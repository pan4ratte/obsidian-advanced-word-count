import { App, ItemView, Modal, Notice, Platform, PluginSettingTab, Setting, WorkspaceLeaf, ToggleComponent, setIcon, setTooltip } from "obsidian";
import { t } from "./locales";
import type WordCountPlugin from "./main";
import {
  VIEW_TYPE_METRICS,
  DisplayMethod,
  RightPaneLayout,
  Preset,
  WarnLevel,
  LimitKind,
  LimitRule,
  METRIC_ORDER,
  METRIC_SHOW_KEY,
  REPOSITORY_URL,
  defaultPreset,
  metricRows,
  surfaceWarnLevel,
  effectiveMetricOrder,
  reorderMetrics,
} from "./metrics";
import { ExtensionIndexEntry, I18n, MetricExtension, PresetExportMeta, SettingExtension, presetDependencyIds, presetExtensionFrom, presetIndexEntryFrom } from "./extensions";

// Extensions that live in the registry and can be connected to a preset — i.e.
// everything except shareable presets (which install as user presets, not toggles).
type RegistryExtension = MetricExtension | SettingExtension;

// Wrap an async callback so it satisfies Obsidian's void-returning event/handler
// types without leaving a floating promise.
const handle = (fn: () => Promise<void>) => (): void => { void fn(); };

// ── Right pane metrics view ────────────────────────────────────────────────────

export class MetricsView extends ItemView {
  private plugin: WordCountPlugin;
  // Signature of the currently rendered structure; while it stays the same we
  // update blocks in place so CSS color transitions can animate.
  private gridSig: string | null = null;
  // Keyed by metric id (built-in MetricKey or extension metric id).
  private blockRefs: Map<string, { block: HTMLElement; value: HTMLElement; text: string }> = new Map();
  // Metric currently being dragged for reorder (desktop only), or null.
  private dragKey: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WordCountPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_METRICS; }
  getDisplayText(): string { return t.viewTitle; }
  getIcon(): string { return "whole-word"; }

  async onOpen() { this.render(); }

  private setLevel(block: HTMLElement, level: WarnLevel) {
    block.toggleClass("wcp-limit-orange", level === "orange");
    block.toggleClass("wcp-limit-red", level === "red");
    block.toggleClass("wcp-limit-green", level === "green");
  }

  /** Subtle one-shot fade played when a character changes. */
  private pulse(el: HTMLElement) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ opacity: 0.35 }, { opacity: 1 }],
      { duration: 25, easing: "ease-out" }
    );
  }

  /**
   * Render a value as per-character spans, fading in only the characters that
   * differ from the previous value. Comparison is right-aligned so digits line
   * up by place value (e.g. 100 → 101 animates only the last digit).
   */
  private renderValue(el: HTMLElement, next: string, prev: string, animate: boolean) {
    el.empty();
    const offset = next.length - prev.length;
    for (let i = 0; i < next.length; i++) {
      const span = el.createSpan({ text: next[i] });
      const prevIdx = i - offset;
      const changed = prevIdx < 0 || prev[prevIdx] !== next[i];
      if (animate && changed) this.pulse(span);
    }
  }

  render() {
    const preset = this.plugin.getActivePreset();
    const metrics = preset ? this.plugin.lastMetrics : null;
    const rows = preset && metrics ? metricRows(preset, metrics, this.plugin.extensions, this.plugin.lastExtMetrics) : [];
    const layout = this.plugin.settings.rightPaneLayout;
    const multiPreset = this.plugin.settings.presets.length > 1;

    // Structure signature — when unchanged we can update in place and animate.
    const sig = preset && metrics && rows.length > 0
      ? [preset.id, preset.name, multiPreset, layout, ...rows.map((r) => r.key)].join("|")
      : null;

    if (sig && sig === this.gridSig) {
      for (const row of rows) {
        const ref = this.blockRefs.get(row.key);
        if (!ref) continue;
        if (ref.text !== row.value) {
          this.renderValue(ref.value, row.value, ref.text, true);
          ref.text = row.value;
        }
        this.setLevel(ref.block, surfaceWarnLevel(this.plugin.settings.limitWarningsDisplayMethod, "rightPane", row.level));
      }
      return;
    }

    // Structure changed (or placeholder state) — full rebuild.
    this.gridSig = sig;
    this.blockRefs.clear();

    const container = this.contentEl;
    container.empty();
    container.addClass("wcp-view");

    if (!preset) {
      container.createEl("p", { text: t.statusNoMetrics, cls: "wcp-view-empty" });
      return;
    }

    // Header: preset name (clickable to cycle when multiple presets exist)
    const header = container.createDiv({ cls: "wcp-view-header" });
    const nameEl = header.createEl("span", { cls: "wcp-view-preset-name" });
    nameEl.createSpan({ text: preset.name });
    if (multiPreset) {
      nameEl.addClass("is-clickable");
      const icon = nameEl.createSpan({ cls: "wcp-view-cycle-icon" });
      setIcon(icon, "repeat");
      setTooltip(nameEl, t.statusTooltipCycle(preset.name), { placement: "bottom" });
      nameEl.addEventListener("click", () => this.plugin.cyclePreset());
    }

    if (!metrics) {
      container.createEl("p", { text: t.viewNoFile, cls: "wcp-view-empty" });
      return;
    }
    if (rows.length === 0) {
      container.createEl("p", { text: t.statusNoMetrics, cls: "wcp-view-empty" });
      return;
    }

    const cols = layout === "one" ? "wcp-cols-1" : "wcp-cols-2";
    const grid = container.createDiv({ cls: `wcp-block-grid ${cols}` });
    for (const row of rows) {
      const block = grid.createDiv({ cls: "wcp-metric-block" });
      this.setLevel(block, surfaceWarnLevel(this.plugin.settings.limitWarningsDisplayMethod, "rightPane", row.level));
      // Value and its optional unit (e.g. "MIN.") share a baseline-aligned line;
      // the unit is a sibling so in-place value updates don't wipe it.
      const valueLine = block.createDiv({ cls: "wcp-metric-value-line" });
      const value = valueLine.createEl("div", { cls: "wcp-metric-value" });
      this.renderValue(value, row.value, "", false);
      if (row.unit) valueLine.createEl("span", { text: row.unit, cls: "wcp-metric-unit" });
      block.createEl("div", { text: row.blockLabel, cls: "wcp-metric-label" });
      this.blockRefs.set(row.key, { block, value, text: row.value });
      // Drag-and-drop reordering: native HTML5 DnD on desktop, touch (long-press)
      // on mobile/tablet, where drag events don't fire.
      if (Platform.isDesktop) this.enableDragReorder(block, row.key, preset);
      else this.enableTouchReorder(block, row.key, preset);
    }
  }

  // ── Metric reordering ───────────────────────────────────────────────────────

  /** Whether to insert before or after the hovered block. Each block is a single
   *  full-height drop zone: the first block places at the very start (it is the
   *  only gap with no block above it), every other block places after itself. */
  private dropPlace(block: HTMLElement): "before" | "after" {
    const prev = block.previousElementSibling;
    const isFirst = !(prev instanceof HTMLElement && prev.hasClass("wcp-metric-block"));
    return isFirst ? "before" : "after";
  }

  /** The metric block under a viewport point, scoped to this view (so points over
   *  another pane or a popout window are ignored). */
  private blockFromPoint(x: number, y: number): HTMLElement | null {
    const el = this.contentEl.ownerDocument.elementFromPoint(x, y);
    const block = el instanceof Element ? el.closest(".wcp-metric-block") : null;
    return block instanceof HTMLElement && this.contentEl.contains(block) ? block : null;
  }

  private keyForBlock(block: HTMLElement): string | null {
    for (const [key, ref] of this.blockRefs) if (ref.block === block) return key;
    return null;
  }

  /** Apply a reorder onto the target block and persist it. Shared by both inputs. */
  private commitReorder(preset: Preset, dragged: string, targetBlock: HTMLElement, targetKey: string) {
    if (dragged === targetKey) return;
    const place = this.dropPlace(targetBlock);
    preset.metricOrder = reorderMetrics(effectiveMetricOrder(preset, this.plugin.extensions), dragged, targetKey, place);
    void this.plugin.saveSettings().then(() => this.plugin.updateCount());
  }

  /** Mark the drop target by lighting the hovered block's own bottom border — a
   *  single consistent indicator for every block in both layouts. */
  private showDropIndicator(block: HTMLElement) {
    this.clearDropIndicators();
    block.addClass("wcp-drop-bottom");
  }

  private clearDropIndicators() {
    for (const { block } of this.blockRefs.values()) {
      block.removeClass("wcp-drop-bottom");
    }
  }

  /** Desktop: native HTML5 drag-and-drop. */
  private enableDragReorder(block: HTMLElement, key: string, preset: Preset) {
    block.draggable = true;
    block.addClass("wcp-draggable");

    block.addEventListener("dragstart", (e) => {
      this.dragKey = key;
      block.addClass("wcp-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", key); // required for a valid drag in some browsers
      }
    });

    block.addEventListener("dragend", () => {
      this.dragKey = null;
      block.removeClass("wcp-dragging");
      this.clearDropIndicators();
    });

    block.addEventListener("dragover", (e) => {
      if (this.dragKey === null || this.dragKey === key) return;
      e.preventDefault(); // allow the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      this.showDropIndicator(block);
    });

    block.addEventListener("dragleave", () => {
      this.clearDropIndicators();
    });

    block.addEventListener("drop", (e) => {
      e.preventDefault();
      const dragged = this.dragKey;
      this.dragKey = null;
      this.clearDropIndicators();
      if (dragged === null) return;
      this.commitReorder(preset, dragged, block, key);
    });
  }

  /**
   * Mobile/tablet: touch reordering. A long press picks a block up (touch events
   * stick to the original target, so the source block's handlers track the whole
   * gesture); moving the finger highlights the block underneath; releasing drops.
   * Before the long press fires, vertical movement is treated as a scroll and
   * cancels the pickup, so the list still scrolls normally.
   */
  private enableTouchReorder(block: HTMLElement, key: string, preset: Preset) {
    block.addClass("wcp-draggable");

    const HOLD_MS = 350;        // press duration that starts a drag
    const SCROLL_SLOP_PX = 10;  // pre-drag movement tolerated before it counts as a scroll
    let holdTimer: number | null = null;
    let startX = 0, startY = 0;
    let dragging = false;

    const cancelHold = () => {
      if (holdTimer !== null) { window.clearTimeout(holdTimer); holdTimer = null; }
    };

    const endDrag = () => {
      cancelHold();
      if (!dragging) return;
      dragging = false;
      this.dragKey = null;
      block.removeClass("wcp-dragging");
      this.clearDropIndicators();
    };

    block.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { endDrag(); return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      cancelHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        dragging = true;
        this.dragKey = key;
        block.addClass("wcp-dragging");
        this.showDropIndicator(block);
      }, HOLD_MS);
    }, { passive: true });

    block.addEventListener("touchmove", (e) => {
      const touch = e.touches[0];
      if (!dragging) {
        // Still waiting on the long press — a real move means the user is scrolling.
        if (Math.abs(touch.clientX - startX) > SCROLL_SLOP_PX || Math.abs(touch.clientY - startY) > SCROLL_SLOP_PX) {
          cancelHold();
        }
        return;
      }
      e.preventDefault(); // suppress scrolling while dragging
      const target = this.blockFromPoint(touch.clientX, touch.clientY);
      if (target) this.showDropIndicator(target);
      else this.clearDropIndicators();
    }, { passive: false });

    const onEnd = (e: TouchEvent) => {
      const dragged = this.dragKey;
      const wasDragging = dragging;
      const touch = e.changedTouches[0];
      endDrag();
      if (!wasDragging || dragged === null || !touch) return;
      const target = this.blockFromPoint(touch.clientX, touch.clientY);
      const targetKey = target ? this.keyForBlock(target) : null;
      if (target && targetKey !== null) this.commitReorder(preset, dragged, target, targetKey);
    };
    block.addEventListener("touchend", onEnd);
    block.addEventListener("touchcancel", onEnd);
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

export class WordCountSettingTab extends PluginSettingTab {
  plugin: WordCountPlugin;
  private hideDefaultToggle: ToggleComponent | null = null;

  constructor(app: App, plugin: WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async save() {
    this.plugin.refreshPresetCommands();
    await this.plugin.saveSettings();
    this.plugin.updateCount();
  }

  /** Sync the "hide default word counter" toggle with the stored setting. */
  refreshHideDefaultToggle() {
    this.hideDefaultToggle?.setValue(this.plugin.settings.hideDefaultWordCount);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t.settingsHeading).setHeading();
    containerEl.createEl("p", { text: t.settingsDescription, cls: "wcp-plugin-note" });

    // ── General ───────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.settingsSectionGeneral).setHeading();

    new Setting(containerEl)
      .setName(t.settingsHideDefaultName)
      .setDesc(t.settingsHideDefaultDesc)
      .addToggle((toggle) => {
        this.hideDefaultToggle = toggle;
        toggle
          .setValue(this.plugin.settings.hideDefaultWordCount)
          .onChange(async (value) => {
            this.plugin.settings.hideDefaultWordCount = value;
            await this.plugin.setDefaultWordCountHidden(value);
            await this.save();
          });
      });

    new Setting(containerEl)
      .setName(t.settingsDisplayMethodName)
      .setDesc(t.settingsDisplayMethodDesc)
      .addDropdown((dd) => {
        dd.addOption("statusBar", t.displayMethodStatusBar);
        dd.addOption("rightPane", t.displayMethodRightPane);
        dd.addOption("both", t.displayMethodBoth);
        dd.setValue(this.plugin.settings.displayMethod);
        dd.onChange(async (value) => {
          this.plugin.settings.displayMethod = value as DisplayMethod;
          await this.plugin.saveSettings();
          await this.plugin.applyDisplayMethod(true);
        });
      });

    new Setting(containerEl)
      .setName(t.settingsRightPaneLayoutName)
      .setDesc(t.settingsRightPaneLayoutDesc)
      .addDropdown((dd) => {
        dd.addOption("two", t.rightPaneLayoutTwo);
        dd.addOption("one", t.rightPaneLayoutOne);
        dd.setValue(this.plugin.settings.rightPaneLayout);
        dd.onChange(async (value) => {
          this.plugin.settings.rightPaneLayout = value as RightPaneLayout;
          await this.plugin.saveSettings();
          this.plugin.updateCount();
        });
      });

    new Setting(containerEl)
      .setName(t.settingsLimitWarningsDisplayName)
      .setDesc(t.settingsLimitWarningsDisplayDesc)
      .addDropdown((dd) => {
        dd.addOption("statusBar", t.displayMethodStatusBar);
        dd.addOption("rightPane", t.displayMethodRightPane);
        dd.addOption("both", t.displayMethodBoth);
        dd.setValue(this.plugin.settings.limitWarningsDisplayMethod);
        dd.onChange(async (value) => {
          this.plugin.settings.limitWarningsDisplayMethod = value as DisplayMethod;
          await this.plugin.saveSettings();
          this.plugin.updateCount();
        });
      });

    new Setting(containerEl)
      .setName(t.settingsSeparatorName)
      .setDesc(t.settingsSeparatorDesc)
      .addText((text) =>
        text
          .setPlaceholder("  |  ")
          .setValue(this.plugin.settings.separator)
          .onChange(async (value) => {
            this.plugin.settings.separator = value;
            await this.save();
          })
      );

    // ── Presets & extensions ──────────────────────────────────────────────────
    // The section title, then one setting with the description + two full-width
    // actions on their own row — open the community store, or create a new preset.
    new Setting(containerEl).setName(t.settingsSectionPresets).setHeading();

    new Setting(containerEl)
      .setName(t.settingsAutoUpdateExtensionsName)
      .setDesc(t.settingsAutoUpdateExtensionsDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoUpdateExtensions)
          .onChange(async (value) => {
            this.plugin.settings.autoUpdateExtensions = value;
            await this.save();
            // Run a check straight away when the user opts in, so they don't have
            // to restart Obsidian to pick up pending updates.
            if (value) void this.plugin.autoUpdateInstalledExtensions();
          })
      );

    const intro = new Setting(containerEl)
      .setName(t.settingsPresetsStoreName)
      .setDesc(t.settingsPresetsStoreDesc);
    intro.settingEl.addClass("wcp-presets-intro");

    const actions = intro.settingEl.createDiv({ cls: "wcp-presets-actions" });

    const storeBtn = actions.createEl("button", { cls: "mod-cta" });
    setIcon(storeBtn.createSpan({ cls: "wcp-btn-icon" }), "store");
    storeBtn.createSpan({ text: t.settingsBrowseExtensions });
    storeBtn.addEventListener("click", () => {
      // Re-render the settings page after an install so newly downloaded
      // extensions appear in each preset's "Connect extensions" dropdown.
      new ExtensionBrowserModal(this.plugin, () => this.display()).open();
    });

    const createBtn = actions.createEl("button", { cls: "mod-cta" });
    setIcon(createBtn.createSpan({ cls: "wcp-btn-icon" }), "plus");
    createBtn.createSpan({ text: t.settingsAddPreset });
    createBtn.addEventListener("click", handle(async () => {
      const preset = defaultPreset({
        name: t.newPresetName(this.plugin.settings.presets.length + 1),
      });
      this.plugin.settings.presets.unshift(preset);
      // If nothing is active (e.g. the very first preset on a fresh install),
      // make this one active so counts show up immediately.
      if (!this.plugin.getActivePreset()) this.plugin.settings.activePresetId = preset.id;
      await this.save();
      this.display();
    }));

    for (const preset of this.plugin.settings.presets) {
      this.renderPreset(containerEl, preset);
    }
  }

  /** Open the export dialog, which collects catalogue metadata then downloads the files. */
  private exportPreset(preset: Preset) {
    new PresetExportModal(this.plugin.app, preset, (meta) => this.downloadPresetFiles(preset, meta)).open();
  }

  /**
   * Export a preset for the community store as two downloads: the catalogue-ready
   * `type: "preset"` file (drop into `presets/`) and its `index.json` entry (paste
   * into the catalogue's `extensions` array). `meta` carries the contributor's
   * name/author/description and optional Russian translation, collected by the
   * export dialog; dependencies are the installed extensions the preset uses.
   */
  private downloadPresetFiles(preset: Preset, meta: PresetExportMeta) {
    const deps = presetDependencyIds(preset, (id) => this.plugin.extensions.has(id));
    const updated = new Date().toISOString().slice(0, 10);
    const ext = presetExtensionFrom(preset, deps, updated, meta);
    const entry = presetIndexEntryFrom(ext);
    this.downloadJson(`${ext.id}.json`, ext);
    // Stagger the second download so the two saves don't race in the same tick.
    window.setTimeout(() => this.downloadJson(`${ext.id}-index-entry.json`, entry), 150);
    new Notice(t.presetExportedNotice(ext.name));
  }

  /** Download an object as a pretty-printed JSON file. */
  private downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = activeDocument.createElement("a");
    a.href = url;
    a.download = filename;
    // Attach the anchor and defer the revoke. Clicking a detached anchor or
    // revoking the object URL synchronously can drop the download on some Electron
    // builds (notably macOS/Linux), even though it happens to work on Windows.
    activeDocument.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  renderPreset(containerEl: HTMLElement, preset: Preset) {
    const isActive = preset.id === this.plugin.settings.activePresetId;
    const card = containerEl.createDiv({ cls: `wcp-preset-card${isActive ? " is-active" : ""}` });

    // ── Header ──────────────────────────────────────────────────────────────
    const header = card.createDiv({ cls: "wcp-preset-header" });

    // Status badge — always shown as an icon. Active is highlighted; inactive is
    // faded and clickable to make this preset active. The status text lives in
    // the tooltip.
    const badge = header.createEl("span", {
      cls: `wcp-active-badge${isActive ? "" : " is-inactive"}`,
    });
    setIcon(badge, "whole-word");
    setTooltip(badge, isActive ? t.badgeActive : t.badgeInactive, { placement: "top" });
    if (!isActive) {
      badge.addEventListener("click", handle(async () => {
        await this.plugin.activatePreset(preset.id);
        this.display();
      }));
    }

    const nameInput = header.createEl("input", { type: "text" });
    nameInput.value = preset.name;
    nameInput.placeholder = t.inputNamePlaceholder;
    nameInput.addClass("wcp-name-input");
    nameInput.addEventListener("change", handle(async () => {
      preset.name = nameInput.value.trim() || t.unnamedPreset;
      await this.save();
    }));

    // Export relies on a Blob/<a download> file save, which only works on the
    // Electron desktop app — Obsidian mobile (Capacitor/WebView) can't honour it,
    // so the Share button is hidden there rather than offering a dead action.
    if (!Platform.isMobile) {
      const shareBtn = header.createEl("button");
      setIcon(shareBtn, "share-2");
      setTooltip(shareBtn, t.btnShareTooltip, { placement: "top" });
      shareBtn.addClass("wcp-btn", "wcp-btn-share");
      shareBtn.addEventListener("click", () => this.exportPreset(preset));
    }

    const delBtn = header.createEl("button");
    setIcon(delBtn, "trash-2");
    setTooltip(delBtn, t.btnDeleteTooltip, { placement: "top" });
    delBtn.addClass("wcp-btn", "wcp-btn-delete");
    delBtn.addEventListener("click", () => {
      new DeleteConfirmModal(this.plugin.app, preset.name, handle(async () => {
        this.plugin.removePresetCommand(preset);
        this.plugin.settings.presets = this.plugin.settings.presets.filter((p) => p.id !== preset.id);
        if (this.plugin.settings.activePresetId === preset.id) {
          this.plugin.settings.activePresetId = this.plugin.settings.presets[0]?.id ?? "";
        }
        await this.save();
        this.display();
      })).open();
    });

    // ── Words per page ──────────────────────────────────────────────────────
    const wppRow = card.createDiv({ cls: "wcp-wpp-row" });
    wppRow.createEl("span", { text: t.wppLabel, cls: "wcp-wpp-label" });

    const wppInput = wppRow.createEl("input", { type: "number" });
    wppInput.value = String(preset.wordsPerPage);
    wppInput.min = "0";
    wppInput.addClass("wcp-wpp-input");
    wppRow.createEl("span", { text: t.wppSuffix, cls: "wcp-wpp-suffix" });

    // ── Reading time speed (its own row) ─────────────────────────────────────
    const readingRow = card.createDiv({ cls: "wcp-wpp-row" });
    readingRow.createEl("span", { text: t.readingTimeLabel, cls: "wcp-wpp-label" });
    const readingSelect = readingRow.createEl("select", { cls: "dropdown" });
    const readingSpeeds: { wpm: number; label: string }[] = [
      { wpm: 250, label: t.readingSpeedAverage },
      { wpm: 400, label: t.readingSpeedFast },
      { wpm: 150, label: t.readingSpeedComplex },
    ];
    for (const { wpm, label } of readingSpeeds) {
      readingSelect.createEl("option", { text: label, value: String(wpm) });
    }
    readingSelect.value = String(preset.readingWpm);
    readingSelect.addEventListener("change", handle(async () => {
      const wpm = parseInt(readingSelect.value, 10);
      if (!isNaN(wpm) && wpm > 0) preset.readingWpm = wpm;
      await this.save();
    }));

    // The "Pages" toggle chip and the words-per-page input turn red when pages
    // are enabled but the per-page count is 0 (which would make the metric
    // meaningless, so it is also hidden from the counter).
    let pagesChip: HTMLElement | null = null;
    const refreshPagesValidity = () => {
      const invalid = preset.showPages && preset.wordsPerPage <= 0;
      wppInput.toggleClass("wcp-invalid", invalid);
      pagesChip?.toggleClass("wcp-invalid", invalid);
    };

    wppInput.addEventListener("change", handle(async () => {
      const n = parseInt(wppInput.value);
      if (!isNaN(n) && n >= 0) { preset.wordsPerPage = n; }
      refreshPagesValidity();
      await this.save();
    }));

    // ── Status bar metrics ──────────────────────────────────────────────────
    // Header, description and the metric-extensions dropdown form one block.
    this.renderSectionHeaderWithConnect(card, t.sectionStatusBar, t.sectionStatusBarNote, preset, "metric");

    const visGrid = card.createDiv({ cls: "wcp-toggle-grid" });
    for (const key of Object.keys(t.toggles) as (keyof typeof t.toggles)[]) {
      const chip = this.renderToggleChip(visGrid, preset, key, t.toggles[key].label, t.toggles[key].hint, () => {
        if (key === "showPages") refreshPagesValidity();
      });
      if (key === "showPages") pagesChip = chip;
    }
    // Connected metric extensions appear as toggles in the same grid.
    for (const def of this.plugin.extensions.metricList()) {
      if (this.extConnected(preset, def)) this.renderExtToggle(visGrid, preset, def);
    }

    refreshPagesValidity();

    // ── Word count options ──────────────────────────────────────────────────
    // Header, description and the setting-extensions dropdown form one block.
    this.renderSectionHeaderWithConnect(card, t.sectionWordCountOptions, t.sectionWordCountOptionsNote, preset, "setting");

    const wcGrid = card.createDiv({ cls: "wcp-toggle-grid-wide" });
    for (const key of Object.keys(t.wordCountOptions) as (keyof typeof t.wordCountOptions)[]) {
      this.renderToggleChip(wcGrid, preset, key, t.wordCountOptions[key].label, t.wordCountOptions[key].hint);
    }
    // Connected setting extensions appear as toggles in the same grid.
    for (const def of this.plugin.extensions.settingList()) {
      if (this.extConnected(preset, def)) this.renderExtToggle(wcGrid, preset, def);
    }

    // ── Warnings & goals ──────────────────────────────────────────────────────
    this.renderLimits(card.createDiv(), preset);
  }

  // ── Extension connections ───────────────────────────────────────────────────

  /** Whether an extension is enabled (connected) for this preset. */
  private extConnected(preset: Preset, def: RegistryExtension): boolean {
    return def.type === "metric"
      ? this.plugin.extensions.metricEnabled(preset, def.id)
      : this.plugin.extensions.settingEnabled(preset, def.id);
  }

  /** Set an extension's connected/enabled flag for this preset. */
  private setExtConnected(preset: Preset, def: RegistryExtension, on: boolean): void {
    if (def.type === "metric") {
      if (!preset.extMetrics) preset.extMetrics = {};
      preset.extMetrics[def.id] = on;
    } else {
      if (!preset.extSettings) preset.extSettings = {};
      preset.extSettings[def.id] = on;
    }
  }

  /**
   * One container holding three stacked elements: a section header (Counter
   * metrics / Advanced settings), its description, and a dropdown that connects an
   * installed extension of the matching type. The dropdown is always shown —
   * disabled when there's nothing to add. Its placeholder prompts to install
   * extensions first when none of this type are installed.
   */
  private renderSectionHeaderWithConnect(
    parent: HTMLElement, title: string, note: string, preset: Preset, type: "metric" | "setting"
  ) {
    const head = parent.createDiv({ cls: "wcp-section-head" });
    const text = head.createDiv({ cls: "wcp-section-head-text" });
    text.createEl("p", { text: title, cls: "wcp-section-header" });
    text.createEl("p", { text: note, cls: "wcp-section-note" });

    const installed = type === "metric" ? this.plugin.extensions.metricList() : this.plugin.extensions.settingList();
    const available = installed.filter((def) => !this.extConnected(preset, def));

    const placeholder = installed.length === 0
      ? t.connectInstallFirst
      : type === "metric" ? t.connectAddMetric : t.connectAddSetting;

    const select = head.createEl("select", { cls: "dropdown wcp-ext-connect-select" });
    select.createEl("option", { text: placeholder, value: "" });
    for (const def of available) {
      select.createEl("option", { text: this.plugin.extensions.loc(def, "label") ?? def.label, value: def.id });
    }
    select.value = "";
    select.disabled = available.length === 0;
    select.addEventListener("change", handle(async () => {
      const def = available.find((d) => d.id === select.value);
      if (!def) return;
      this.setExtConnected(preset, def, true);
      await this.save();
      this.display();
    }));
  }

  /** A connected extension shown as a toggle in a grid; turning it off disconnects. */
  private renderExtToggle(grid: HTMLElement, preset: Preset, def: RegistryExtension) {
    const row = grid.createDiv({ cls: "wcp-toggle-chip" });
    const hint = this.plugin.extensions.loc(def, "hint") ?? def.hint;
    if (hint) setTooltip(row, hint, { placement: "top" });
    row.createEl("span", { text: this.plugin.extensions.loc(def, "title") ?? def.title, cls: "wcp-toggle-label" });
    row.createDiv({ cls: "checkbox-container is-enabled" });
    row.addEventListener("click", handle(async () => {
      this.setExtConnected(preset, def, false);
      await this.save();
      this.display();
    }));
  }

  renderLimits(container: HTMLElement, preset: Preset) {
    container.empty();
    this.sectionHeader(container, t.limitsTitle);

    // Description and the add buttons share one container.
    const head = container.createDiv({ cls: "wcp-limit-head" });
    head.createEl("p", { text: t.limitsDesc, cls: "wcp-section-note" });

    // Buttons to add a new (metric-less) rule of each kind.
    const addRule = (kind: LimitKind) => handle(async () => {
      preset.rules.push({ metric: "", threshold: 0, kind });
      await this.save();
      this.display();
    });

    const btnRow = head.createDiv({ cls: "wcp-limit-buttons" });
    btnRow.createEl("button", { text: t.addWarning }).addEventListener("click", addRule("warning"));
    btnRow.createEl("button", { text: t.addGoal }).addEventListener("click", addRule("goal"));

    // A subsection (with its title) only appears once it has at least one rule.
    this.renderRuleGroup(container, preset, "warning", t.warningsSubtitle);
    this.renderRuleGroup(container, preset, "goal", t.goalsSubtitle);
  }

  private renderRuleGroup(container: HTMLElement, preset: Preset, kind: LimitKind, title: string) {
    const rules = preset.rules.filter((r) => r.kind === kind);
    if (rules.length === 0) return;
    container.createEl("p", { text: title, cls: "wcp-limit-subhead" });
    for (const rule of rules) this.renderRuleRow(container, preset, rule);
  }

  /** The other-kind rule sharing this rule's metric, if any (warning ↔ goal). */
  private pairedRule(preset: Preset, rule: LimitRule): LimitRule | undefined {
    if (rule.metric === "") return undefined;
    return preset.rules.find((r) => r !== rule && r.metric === rule.metric && r.kind !== rule.kind);
  }

  /** Keep the invariant warning.threshold ≥ goal.threshold for a metric's pair. */
  private clampToPair(rule: LimitRule, paired: LimitRule | undefined) {
    if (!paired || paired.threshold <= 0) return;
    if (rule.kind === "warning" && rule.threshold < paired.threshold) rule.threshold = paired.threshold;
    if (rule.kind === "goal" && rule.threshold > paired.threshold) rule.threshold = paired.threshold;
  }

  /** Whether a metric's threshold may use a decimal place: pages, or a ratio
   *  extension metric (which produces fractional values). */
  private allowsDecimalThreshold(metric: string): boolean {
    return metric === "pages" || this.plugin.extensions.getMetric(metric)?.count.mode === "ratio";
  }

  private renderRuleRow(container: HTMLElement, preset: Preset, rule: LimitRule) {
    const row = container.createDiv({ cls: "wcp-limit-item" });

    // Metric dropdown — offers metrics not already claimed by another rule of the
    // same kind (a metric may still carry one warning and one goal at once).
    const taken = new Set(
      preset.rules.filter((r) => r !== rule && r.kind === rule.kind).map((r) => r.metric)
    );
    const select = row.createEl("select", { cls: "dropdown" });
    if (rule.metric === "") select.createEl("option", { text: t.limitSelectMetric, value: "" });
    for (const k of METRIC_ORDER) {
      if (taken.has(k)) continue;
      select.createEl("option", { text: t.toggles[METRIC_SHOW_KEY[k] as keyof typeof t.toggles].label, value: k });
    }
    // Installed extension metrics can carry warnings/goals too.
    for (const def of this.plugin.extensions.metricList()) {
      if (taken.has(def.id)) continue;
      select.createEl("option", { text: def.label, value: def.id });
    }
    select.value = rule.metric;
    select.addEventListener("change", handle(async () => {
      rule.metric = select.value;
      // Whole-number thresholds, except for decimal metrics (pages, ratio extensions).
      if (!this.allowsDecimalThreshold(rule.metric)) rule.threshold = Math.round(rule.threshold);
      this.clampToPair(rule, this.pairedRule(preset, rule));
      await this.save();
      this.display(); // re-render so the chosen metric drops out of other dropdowns
    }));

    // Threshold — bounded so a warning can't drop below its goal (and vice versa).
    // Decimal metrics (pages, ratio extensions) allow one decimal place; the rest
    // are integer.
    const allowsDecimal = this.allowsDecimalThreshold(rule.metric);
    const paired = this.pairedRule(preset, rule);
    const input = row.createEl("input", { type: "number" });
    input.step = allowsDecimal ? "0.1" : "1";
    input.min = rule.kind === "warning" && paired && paired.threshold > 0 ? String(paired.threshold) : "0";
    if (rule.kind === "goal" && paired && paired.threshold > 0) input.max = String(paired.threshold);
    input.value = String(rule.threshold);
    input.addEventListener("change", handle(async () => {
      let n = Number(input.value);
      if (!isFinite(n) || n < 0) n = 0;
      // Round to one decimal for pages, to a whole number otherwise.
      rule.threshold = allowsDecimal ? Math.round(n * 10) / 10 : Math.round(n);
      this.clampToPair(rule, paired);
      input.value = String(rule.threshold);
      await this.save();
      if (paired) this.display(); // refresh the paired input's min/max hint
    }));

    // Delete
    const del = row.createEl("button");
    setIcon(del, "trash-2");
    setTooltip(del, t.btnRemoveLimit, { placement: "top" });
    del.addClass("wcp-btn", "wcp-btn-delete");
    del.addEventListener("click", handle(async () => {
      preset.rules = preset.rules.filter((r) => r !== rule);
      await this.save();
      this.display();
    }));
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  sectionHeader(parent: HTMLElement, text: string) {
    parent.createEl("p", { text, cls: "wcp-section-header" });
  }

  renderToggleChip(parent: HTMLElement, preset: Preset, key: keyof Preset, label: string, hint?: string, onChange?: () => void): HTMLElement {
    const row = parent.createDiv({ cls: "wcp-toggle-chip" });
    if (hint) setTooltip(row, hint, { placement: "top" });

    row.createEl("span", { text: label, cls: "wcp-toggle-label" });

    const toggle = row.createDiv({ cls: "checkbox-container" });
    if (preset[key]) toggle.addClass("is-enabled");

    row.addEventListener("click", handle(async () => {
      (preset[key] as boolean) = !(preset[key] as boolean);
      toggle.toggleClass("is-enabled", preset[key] as boolean);
      onChange?.();
      await this.save();
    }));

    return row;
  }
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

export class DeleteConfirmModal extends Modal {
  private presetName: string;
  private onConfirm: () => void;

  constructor(app: App, presetName: string, onConfirm: () => void) {
    super(app);
    this.presetName = presetName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t.deleteConfirmTitle });
    contentEl.createEl("p", { text: t.deleteConfirmMessage(this.presetName) });

    const btnRow = contentEl.createDiv({ cls: "wcp-modal-buttons" });

    btnRow.createEl("button", { text: t.deleteConfirmNo })
      .addEventListener("click", () => this.close());

    const confirmBtn = btnRow.createEl("button", { text: t.deleteConfirmYes });
    confirmBtn.addClass("mod-warning");
    confirmBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Uninstall confirmation modal ──────────────────────────────────────────────
//
// Shown when removing an extension that other installed extensions depend on, so
// the user can back out before breaking them. `dependents` is the already-
// localized, comma-joined list of the dependent extensions' names.

export class ExtUninstallConfirmModal extends Modal {
  constructor(
    app: App,
    private extName: string,
    private dependents: string,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t.extUninstallConfirmTitle });
    contentEl.createEl("p", { text: t.extUninstallConfirmMessage(this.extName, this.dependents) });

    const btnRow = contentEl.createDiv({ cls: "wcp-modal-buttons" });
    btnRow.createEl("button", { text: t.extUninstallConfirmNo })
      .addEventListener("click", () => this.close());

    const confirmBtn = btnRow.createEl("button", { text: t.extUninstallConfirmYes });
    confirmBtn.addClass("mod-warning");
    confirmBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Preset export modal ───────────────────────────────────────────────────────
//
// Collects the catalogue metadata (name, author, description + optional Russian
// translation) before exporting a preset, then hands a PresetExportMeta back so the
// caller can generate the two download files with the fields already filled in.

export class PresetExportModal extends Modal {
  private name: string;
  private author = "";
  private description = "";
  private ruName = "";
  private ruDescription = "";
  // Inputs of the required fields, kept so Export can flag the empty ones in red.
  private requiredInputs: (HTMLInputElement | HTMLTextAreaElement)[] = [];

  constructor(app: App, preset: Preset, private onExport: (meta: PresetExportMeta) => void) {
    super(app);
    this.name = preset.name;
  }

  onOpen() {
    const { contentEl } = this;
    this.requiredInputs = [];
    contentEl.createEl("h3", { text: t.exportModalTitle });
    contentEl.createEl("p", { text: t.exportInstruction, cls: "wcp-export-instruction" });

    // Clear the red flag as soon as a required field gets non-blank input.
    const clearInvalid = (el: HTMLElement, v: string) => { if (v.trim()) el.removeClass("wcp-export-invalid"); };

    new Setting(contentEl)
      .setName(t.exportFieldName)
      .addText((tc) => {
        tc.setValue(this.name).onChange((v) => { this.name = v; clearInvalid(tc.inputEl, v); });
        tc.inputEl.maxLength = 112;
        this.requiredInputs.push(tc.inputEl);
      });
    new Setting(contentEl)
      .setName(t.exportFieldAuthor)
      .addText((tc) => {
        tc.setPlaceholder(t.exportAuthorPlaceholder).onChange((v) => { this.author = v; clearInvalid(tc.inputEl, v); });
        tc.inputEl.maxLength = 64;
        this.requiredInputs.push(tc.inputEl);
      });
    new Setting(contentEl)
      .setName(t.exportFieldDescription)
      .setClass("wcp-export-fullwidth")
      .addTextArea((tc) => {
        tc.onChange((v) => { this.description = v; clearInvalid(tc.inputEl, v); });
        tc.inputEl.maxLength = 256;
        this.requiredInputs.push(tc.inputEl);
      });

    contentEl.createEl("p", { text: t.exportLocalizedNote, cls: "wcp-export-note" });

    new Setting(contentEl)
      .setName(t.exportFieldNameRu)
      .addText((tc) => {
        tc.onChange((v) => (this.ruName = v));
        tc.inputEl.maxLength = 112;
      });
    new Setting(contentEl)
      .setName(t.exportFieldDescriptionRu)
      .setClass("wcp-export-fullwidth")
      .addTextArea((tc) => {
        tc.onChange((v) => (this.ruDescription = v));
        tc.inputEl.maxLength = 256;
      });

    const btnRow = contentEl.createDiv({ cls: "wcp-modal-buttons" });
    const openRepo = btnRow.createEl("button", { text: t.exportOpenRepo });
    openRepo.addEventListener("click", () => window.open(REPOSITORY_URL, "_blank"));
    btnRow.createEl("button", { text: t.exportCancel })
      .addEventListener("click", () => this.close());
    const exportBtn = btnRow.createEl("button", { text: t.exportConfirm });
    exportBtn.addClass("mod-cta");
    exportBtn.addEventListener("click", () => {
      const name = this.name.trim();
      const author = this.author.trim();
      const description = this.description.trim();
      // Flag every empty required field in red (and clear the ones now filled).
      for (const el of this.requiredInputs) el.toggleClass("wcp-export-invalid", el.value.trim().length === 0);
      if (!name || !author || !description) {
        new Notice(t.exportMissingFields);
        return;
      }
      this.onExport({ name, author, description, i18n: this.buildI18n() });
      this.close();
    });
  }

  /** Build the i18n block from the Russian fields, or undefined when both are blank. */
  private buildI18n(): I18n | undefined {
    const ru: Record<string, string> = {};
    const ruName = this.ruName.trim();
    const ruDescription = this.ruDescription.trim();
    if (ruName) ru.name = ruName;
    if (ruDescription) ru.description = ruDescription;
    return Object.keys(ru).length > 0 ? { ru } : undefined;
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Extension browser modal ───────────────────────────────────────────────────

type ExtTypeFilter = "all" | "metric" | "setting" | "preset";

export class ExtensionBrowserModal extends Modal {
  private plugin: WordCountPlugin;
  // Called after an install/uninstall so the settings page behind the modal can refresh.
  private onChanged: () => void;
  private entries: ExtensionIndexEntry[] = [];
  private filter = "";
  private typeFilter: ExtTypeFilter = "all";
  private chipsEl: HTMLElement;
  private listEl: HTMLElement;
  private state: "loading" | "ready" | "error" = "loading";

  constructor(plugin: WordCountPlugin, onChanged: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChanged = onChanged;
  }

  onOpen() {
    const { contentEl } = this;
    // The inset padding lives on the outer .modal element, not .modal-content, so
    // scope the override there.
    this.modalEl.addClass("wcp-ext-modal");
    contentEl.createEl("h3", { text: t.extModalTitle, cls: "wcp-ext-title" });

    const search = contentEl.createEl("input", { type: "text", cls: "wcp-ext-search" });
    search.placeholder = t.extSearchPlaceholder;
    search.addEventListener("input", () => {
      this.filter = search.value.trim().toLowerCase();
      this.renderList();
    });

    this.chipsEl = contentEl.createDiv({ cls: "wcp-ext-filters" });
    this.renderChips();

    this.listEl = contentEl.createDiv({ cls: "wcp-ext-list" });
    this.renderList();
    void this.load();
  }

  /** Type filter chips: All / Metrics / Advanced settings / Presets. */
  private renderChips() {
    this.chipsEl.empty();
    const chips: { value: ExtTypeFilter; label: string }[] = [
      { value: "all", label: t.extFilterAll },
      { value: "metric", label: t.extFilterMetrics },
      { value: "setting", label: t.extFilterSettings },
      { value: "preset", label: t.extFilterPresets },
    ];
    for (const { value, label } of chips) {
      const chip = this.chipsEl.createEl("button", { text: label, cls: "wcp-ext-filter" });
      if (this.typeFilter === value) chip.addClass("is-active");
      chip.addEventListener("click", () => {
        this.typeFilter = value;
        this.renderChips();
        this.renderList();
      });
    }
  }

  /** Fetch the catalogue index, updating the list through its load states. */
  private async load() {
    this.state = "loading";
    this.renderList();
    try {
      this.entries = await this.plugin.extensionManager.fetchIndex();
      this.state = "ready";
    } catch {
      this.state = "error";
    }
    this.renderList();
  }

  private renderList() {
    const list = this.listEl;
    list.empty();

    if (this.state === "loading") {
      list.createEl("p", { text: t.extLoading, cls: "wcp-ext-status" });
      return;
    }
    if (this.state === "error") {
      list.createEl("p", { text: t.extLoadError, cls: "wcp-ext-status" });
      const retry = list.createEl("button", { text: t.extRetry });
      retry.addClass("mod-cta");
      retry.addEventListener("click", () => void this.load());
      return;
    }
    if (this.entries.length === 0) {
      list.createEl("p", { text: t.extEmptyCatalogue, cls: "wcp-ext-status" });
      return;
    }

    const f = this.filter;
    const matchesSearch = (e: ExtensionIndexEntry) =>
      !f ||
      e.name.toLowerCase().includes(f) ||
      e.description.toLowerCase().includes(f) ||
      e.author.toLowerCase().includes(f) ||
      e.id.toLowerCase().includes(f);
    const matchesType = (e: ExtensionIndexEntry) =>
      this.typeFilter === "all" || e.type === this.typeFilter;

    const shown = this.entries.filter((e) => matchesSearch(e) && matchesType(e));
    if (shown.length === 0) {
      list.createEl("p", { text: t.extNoResults, cls: "wcp-ext-status" });
      return;
    }

    for (const entry of shown) this.renderCard(list, entry);
  }

  private renderCard(parent: HTMLElement, entry: ExtensionIndexEntry) {
    const card = parent.createDiv({ cls: "wcp-ext-card" });

    // Left: name + type icon, author beneath, then the description.
    const main = card.createDiv({ cls: "wcp-ext-card-main" });
    const head = main.createDiv({ cls: "wcp-ext-card-head" });
    head.createEl("span", { text: this.plugin.extensions.loc(entry, "name") ?? entry.name, cls: "wcp-ext-name" });
    const icon = head.createSpan({ cls: "wcp-ext-type-icon" });
    const typeIcon = entry.type === "metric" ? "whole-word" : entry.type === "preset" ? "package" : "sliders-horizontal";
    const typeLabel = entry.type === "metric" ? t.extTypeMetric : entry.type === "preset" ? t.extTypePreset : t.extTypeSetting;
    setIcon(icon, typeIcon);
    setTooltip(icon, typeLabel, { placement: "top" });
    main.createEl("span", { text: t.extByAuthor(entry.author), cls: "wcp-ext-author" });
    main.createEl("p", { text: this.plugin.extensions.loc(entry, "description") ?? entry.description, cls: "wcp-ext-desc" });

    // Presets install differently (they add a preset + pull in the extensions they
    // use), so they get their own single "Add" action and skip the install-state UI.
    if (entry.type === "preset") {
      this.renderPresetActions(card, entry);
      return;
    }

    const installed = this.plugin.extensionManager.isInstalled(entry.id);
    // Highlight installed extensions: the type icon and title pick up the accent color.
    if (installed) card.addClass("is-installed");
    const installedDate = this.plugin.extensionManager.installedDate(entry.id);
    // Update available when the catalogue's ISO date is newer than the installed
    // copy's (ISO dates compare correctly as strings).
    const updatable = installed && !!entry.updated && !!installedDate && entry.updated > installedDate;
    const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

    // Right: action buttons (neutral by default, accent/red only on hover).
    const actions = card.createDiv({ cls: "wcp-ext-actions" });

    // Install (not installed) or Update (catalogue copy is newer). Icon-only; the
    // label lives in the tooltip.
    if (!installed || updatable) {
      const primary = actions.createEl("button", { cls: "wcp-ext-install" });
      setIcon(primary, updatable ? "refresh-cw" : "download");
      setTooltip(primary, updatable ? t.extUpdate : t.extInstall, { placement: "top" });
      primary.addEventListener("click", handle(async () => {
        primary.disabled = true;
        setTooltip(primary, t.extInstalling, { placement: "top" });
        try {
          // Pass the loaded catalogue so dependencies resolve without a re-fetch.
          const installed = await this.plugin.extensionManager.installFromIndex(entry, this.entries);
          const deps = installed.length - 1; // the rest of the batch are pulled-in dependencies
          new Notice(deps > 0 ? t.extInstalledWithDepsNotice(entry.name, deps) : t.extInstalledNotice(entry.name));
          this.onChanged();
          this.renderList(); // rebuild so install states refresh
        } catch (e) {
          new Notice(t.extInstallFailed(message(e)));
          this.renderList();
        }
      }));
    }

    // Uninstall (anything currently installed). Trash icon; label in the tooltip.
    if (installed) {
      const uninstall = actions.createEl("button", { cls: "wcp-ext-uninstall" });
      setIcon(uninstall, "trash-2");
      setTooltip(uninstall, t.extUninstall, { placement: "top" });

      const doUninstall = handle(async () => {
        uninstall.disabled = true;
        try {
          await this.plugin.extensionManager.uninstall(entry.id);
          new Notice(t.extUninstalledNotice(entry.name));
          this.onChanged();
          this.renderList();
        } catch (e) {
          new Notice(t.extUninstallFailed(message(e)));
          this.renderList();
        }
      });

      uninstall.addEventListener("click", () => {
        // Warn first if other installed extensions depend on this one.
        const dependents = this.plugin.extensionManager.dependents(entry.id);
        if (dependents.length === 0) {
          doUninstall();
          return;
        }
        const names = dependents
          .map((d) => this.plugin.extensions.loc(d, "name") ?? d.name)
          .join(", ");
        new ExtUninstallConfirmModal(this.plugin.app, entry.name, names, doUninstall).open();
      });
    }
  }

  /**
   * A preset card's single "Add" action: download the extensions the preset uses,
   * then add the preset to the user's preset list (activating it if none is active).
   */
  private renderPresetActions(card: HTMLElement, entry: ExtensionIndexEntry) {
    const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const actions = card.createDiv({ cls: "wcp-ext-actions" });
    const add = actions.createEl("button", { cls: "wcp-ext-install" });
    setIcon(add, "download");
    setTooltip(add, t.extInstallPreset, { placement: "top" });
    add.addEventListener("click", handle(async () => {
      add.disabled = true;
      setTooltip(add, t.extInstalling, { placement: "top" });
      try {
        // Pass the loaded catalogue so the preset's extensions resolve without a re-fetch.
        const { preset, extCount } = await this.plugin.extensionManager.installPresetFromIndex(entry, this.entries);
        this.plugin.settings.presets.unshift(preset);
        if (!this.plugin.getActivePreset()) this.plugin.settings.activePresetId = preset.id;
        this.plugin.refreshPresetCommands();
        await this.plugin.saveSettings();
        this.plugin.updateCount();
        new Notice(t.extPresetInstalledNotice(entry.name, extCount));
        this.onChanged();
        this.renderList();
      } catch (e) {
        new Notice(t.extInstallFailed(message(e)));
        this.renderList();
      }
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
