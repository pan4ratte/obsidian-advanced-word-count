import { App, ItemView, Modal, Notice, Platform, PluginSettingTab, Setting, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
// Declarative settings types (Obsidian 1.13.0+); type-only, so nothing is imported
// at runtime.
import type { SettingDefinitionItem } from "obsidian";
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
  CustomLabel,
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
    const rows = preset && metrics
      ? metricRows(preset, metrics, this.plugin.extensions, this.plugin.lastExtMetrics, this.plugin.settings.customLabels)
      : [];
    const layout = this.plugin.settings.rightPaneLayout;
    const multiPreset = this.plugin.settings.presets.length > 1;

    // Structure signature — when unchanged we can update in place and animate. The
    // block labels are part of it: a custom label changes the text but not the set
    // of rows, and only a rebuild repaints it.
    const sig = preset && metrics && rows.length > 0
      ? [preset.id, preset.name, multiPreset, layout, ...rows.flatMap((r) => [r.key, r.blockLabel])].join("|")
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
    const nameEl = header.createSpan({ cls: "wcp-view-preset-name" });
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
      const value = valueLine.createDiv({ cls: "wcp-metric-value" });
      this.renderValue(value, row.value, "", false);
      if (row.unit) valueLine.createSpan({ text: row.unit, cls: "wcp-metric-unit" });
      block.createDiv({ text: row.blockLabel, cls: "wcp-metric-label" });
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
  // Container the preset UI draws into, created once by the presets definition's
  // render callback and reused afterwards. Kept so preset edits can redraw just
  // this subtree instead of rebuilding Obsidian's whole definition list.
  private presetsRoot: HTMLElement | null = null;

  constructor(app: App, plugin: WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async save() {
    this.plugin.refreshPresetCommands();
    await this.plugin.saveSettings();
    this.plugin.updateCount();
  }

  /**
   * Re-read the declared controls from the settings object. Needed when something
   * outside this tab writes a setting the tab is displaying — see
   * syncDefaultWordCountState(), which turns "hide default word counter" back off.
   * Safe to call: every definition below has a static name/key, so the reconciler
   * reuses the existing rows rather than rebuilding them.
   */
  refreshControls() {
    this.update();
  }

  // ── Declarative settings (Obsidian 1.13.0+) ─────────────────────────────────
  //
  // The whole tab is declared here; there is no display() fallback, which is safe
  // only because this array is never empty (Obsidian falls back to display() only
  // when it is). Plain bound values use `control`, so Obsidian renders, persists
  // and search-indexes them individually — the keys are field names in
  // WordCountSettings, routed through get/setControlValue below.
  //
  // The preset UI is far too dynamic to declare, so it gets a single `render`
  // definition that hands its row's element to the imperative renderer. See
  // renderPresets() for the rules that come with that.

  getSettingDefinitions(): SettingDefinitionItem[] {
    const displayMethods: Record<string, string> = {
      statusBar: t.displayMethodStatusBar,
      rightPane: t.displayMethodRightPane,
      both: t.displayMethodBoth,
    };
    return [
      // Plugin blurb. Drawn by hand so it keeps the full-width note styling it had
      // before the migration, instead of the two-column name/description row.
      {
        type: "group",
        cls: "wcp-settings-group",
        heading: t.settingsHeading,
        items: [
          {
            name: t.settingsHeading,
            desc: t.settingsDescription,
            searchable: false, // the group heading above already carries this text
            render: (setting) => {
              setting.settingEl.addClass("wcp-settings-anchor", "wcp-settings-anchor-bare");
              const root = this.anchorRoot(setting, "wcp-intro-root");
              root.empty();
              root.createEl("p", { text: t.settingsDescription, cls: "wcp-plugin-note" });
            },
          },
        ],
      },
      {
        type: "group",
        heading: t.settingsSectionGeneral,
        items: [
          {
            name: t.settingsHideDefaultName,
            desc: t.settingsHideDefaultDesc,
            control: { type: "toggle", key: "hideDefaultWordCount" },
          },
          {
            name: t.settingsDisplayMethodName,
            desc: t.settingsDisplayMethodDesc,
            control: { type: "dropdown", key: "displayMethod", options: displayMethods },
          },
          {
            name: t.settingsRightPaneLayoutName,
            desc: t.settingsRightPaneLayoutDesc,
            control: {
              type: "dropdown",
              key: "rightPaneLayout",
              options: { two: t.rightPaneLayoutTwo, one: t.rightPaneLayoutOne },
            },
          },
          {
            name: t.settingsLimitWarningsDisplayName,
            desc: t.settingsLimitWarningsDisplayDesc,
            control: { type: "dropdown", key: "limitWarningsDisplayMethod", options: displayMethods },
          },
          {
            name: t.settingsSeparatorName,
            desc: t.settingsSeparatorDesc,
            control: { type: "text", key: "separator", placeholder: "  |  " },
          },
        ],
      },
      {
        type: "group",
        heading: t.settingsSectionPresets,
        items: [
          {
            name: t.settingsAutoUpdateExtensionsName,
            desc: t.settingsAutoUpdateExtensionsDesc,
            control: { type: "toggle", key: "autoUpdateExtensions" },
          },
          {
            name: t.settingsCustomLabelsName,
            desc: t.settingsCustomLabelsDesc,
            action: () => new CustomLabelsModal(this.plugin).open(),
          },
          // Description plus the two full-width actions (open the community store,
          // create a preset) stacked below it. Deliberately left in this group so it
          // keeps the group's card — only the buttons are hand-drawn.
          {
            name: t.settingsPresetsStoreName,
            desc: t.settingsPresetsStoreDesc,
            aliases: [t.settingsBrowseExtensions, t.settingsAddPreset],
            render: (setting) => {
              setting.settingEl.addClass("wcp-presets-intro");
              const root = this.anchorRoot(setting, "wcp-presets-actions");
              root.empty();
              this.renderPresetActions(root);
            },
          },
        ],
      },
      // One card per preset. Its own group, with the group card blanked (see
      // .wcp-settings-group in styles.css), because each preset already draws its
      // own card — nesting them inside another one would double the chrome.
      {
        type: "group",
        cls: "wcp-settings-group",
        items: [
          {
            name: t.settingsYourPresets,
            // The cards are one DOM blob as far as Obsidian is concerned, so spell
            // out what lives in them for the settings search.
            aliases: [
              t.sectionStatusBar,
              t.sectionWordCountOptions,
              t.limitsTitle,
              t.wppLabel,
              t.readingTimeLabel,
            ],
            render: (setting) => {
              setting.settingEl.addClass("wcp-settings-anchor", "wcp-settings-anchor-bare");
              this.renderPresets(this.anchorRoot(setting, "wcp-settings-root"));
              // Forget the root on tab hide and before each re-render, so a late
              // callback (an extensions modal closing, say) can't redraw into a
              // node that is no longer on screen.
              return () => { this.presetsRoot = null; };
            },
          },
        ],
      },
    ];
  }

  /**
   * A render callback's own container inside its row, created on first render and
   * reused on every later one. Obsidian re-runs the callback against the same row
   * on update(), and Setting.clear() only empties controlEl — it leaves settingEl's
   * own children alone — so appending unconditionally would stack a second copy of
   * the whole UI. Building into settingEl (never into the group's list element) is
   * what keeps the content alive: the group prunes its list down to the rows it
   * created after every render pass.
   */
  private anchorRoot(setting: Setting, cls: string): HTMLElement {
    return setting.settingEl.querySelector<HTMLElement>(`:scope > .${cls}`)
      ?? setting.settingEl.createDiv({ cls });
  }

  /** Read a declared control's value from the plugin's settings. */
  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  /**
   * Persist a declared control's value, applying its side effects — an unknown key
   * is ignored rather than blindly written into the settings object.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;
    switch (key) {
      case "hideDefaultWordCount":
        settings.hideDefaultWordCount = value === true;
        await this.plugin.setDefaultWordCountHidden(settings.hideDefaultWordCount);
        await this.save();
        return;
      case "displayMethod":
        settings.displayMethod = value as DisplayMethod;
        await this.plugin.saveSettings();
        await this.plugin.applyDisplayMethod(true);
        return;
      case "rightPaneLayout":
        settings.rightPaneLayout = value as RightPaneLayout;
        await this.plugin.saveSettings();
        this.plugin.updateCount();
        return;
      case "limitWarningsDisplayMethod":
        settings.limitWarningsDisplayMethod = value as DisplayMethod;
        await this.plugin.saveSettings();
        this.plugin.updateCount();
        return;
      case "separator":
        settings.separator = String(value);
        await this.save();
        return;
      case "autoUpdateExtensions":
        settings.autoUpdateExtensions = value === true;
        await this.save();
        // Check straight away when the user opts in, as the rendered toggle does.
        if (settings.autoUpdateExtensions) void this.plugin.autoUpdateInstalledExtensions();
        return;
    }
  }

  /**
   * The two full-width accent buttons: open the community store, or create a preset.
   *
   * Nothing drawn by a `render` definition is auto-saved — that persistence only
   * comes with `control` — so this and renderPresets() below write through save()
   * in every handler themselves.
   */
  private renderPresetActions(root: HTMLElement): void {
    const storeBtn = root.createEl("button", { cls: "mod-cta" });
    setIcon(storeBtn.createSpan({ cls: "wcp-btn-icon" }), "store");
    storeBtn.createSpan({ text: t.settingsBrowseExtensions });
    storeBtn.addEventListener("click", () => {
      // Re-render the preset cards after an install so newly downloaded
      // extensions appear in each preset's "Connect extensions" dropdown.
      new ExtensionBrowserModal(this.plugin, () => this.rerenderPresets()).open();
    });

    const createBtn = root.createEl("button", { cls: "mod-cta" });
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
      this.rerenderPresets();
    }));
  }

  /** One card per preset. `root` is the container handed over by the render callback. */
  private renderPresets(root: HTMLElement): void {
    this.presetsRoot = root;
    root.empty();
    for (const preset of this.plugin.settings.presets) {
      this.renderPreset(root, preset);
    }
  }

  /**
   * Redraw the preset cards after a change to the preset list. Deliberately not
   * update(): that re-runs getSettingDefinitions() and reconciles Obsidian's rows,
   * which is far more work than repainting our own subtree.
   */
  private rerenderPresets(): void {
    if (this.presetsRoot) this.renderPresets(this.presetsRoot);
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
    new Notice(t.presetExportedNotice(ext.storeName));
  }

  /** Download an object as a pretty-printed JSON file. */
  private downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // Create the anchor attached to the active document's body (createEl appends to
    // the node it's called on), and defer the revoke. Clicking a detached anchor or
    // revoking the object URL synchronously can drop the download on some Electron
    // builds (notably macOS/Linux), even though it happens to work on Windows.
    const a = activeDocument.body.createEl("a");
    a.href = url;
    a.download = filename;
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  renderPreset(parent: HTMLElement, preset: Preset) {
    const isActive = preset.id === this.plugin.settings.activePresetId;
    const card = parent.createDiv({ cls: `wcp-preset-card${isActive ? " is-active" : ""}` });

    // ── Header ──────────────────────────────────────────────────────────────
    const header = card.createDiv({ cls: "wcp-preset-header" });

    // Status badge — always shown as an icon. Active is highlighted; inactive is
    // faded and clickable to make this preset active. The status text lives in
    // the tooltip.
    const badge = header.createSpan({
      cls: `wcp-active-badge${isActive ? "" : " is-inactive"}`,
    });
    setIcon(badge, "whole-word");
    setTooltip(badge, isActive ? t.badgeActive : t.badgeInactive, { placement: "top" });
    if (!isActive) {
      badge.addEventListener("click", handle(async () => {
        await this.plugin.activatePreset(preset.id);
        this.rerenderPresets();
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
        this.rerenderPresets();
      })).open();
    });

    // ── Words per page ──────────────────────────────────────────────────────
    const wppRow = card.createDiv({ cls: "wcp-wpp-row" });
    wppRow.createSpan({ text: t.wppLabel, cls: "wcp-wpp-label" });

    const wppInput = wppRow.createEl("input", { type: "number" });
    wppInput.value = String(preset.wordsPerPage);
    wppInput.min = "0";
    wppInput.addClass("wcp-wpp-input");
    wppRow.createSpan({ text: t.wppSuffix, cls: "wcp-wpp-suffix" });

    // ── Reading time speed (its own row) ─────────────────────────────────────
    const readingRow = card.createDiv({ cls: "wcp-wpp-row" });
    readingRow.createSpan({ text: t.readingTimeLabel, cls: "wcp-wpp-label" });
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
    head.createEl("p", { text: title, cls: "wcp-section-header" });
    // Description and the connect dropdown share one row (stacking on narrow screens).
    const body = head.createDiv({ cls: "wcp-section-head-body" });
    body.createEl("p", { text: note, cls: "wcp-section-note" });

    const installed = type === "metric" ? this.plugin.extensions.metricList() : this.plugin.extensions.settingList();
    const available = installed.filter((def) => !this.extConnected(preset, def));

    const placeholder = installed.length === 0
      ? t.connectInstallFirst
      : type === "metric" ? t.connectAddMetric : t.connectAddSetting;

    const select = body.createEl("select", { cls: "dropdown wcp-ext-connect-select" });
    select.createEl("option", { text: placeholder, value: "" });
    for (const def of available) {
      select.createEl("option", { text: this.plugin.extensions.loc(def, "toggleLabel") ?? def.toggleLabel, value: def.id });
    }
    select.value = "";
    select.disabled = available.length === 0;
    select.addEventListener("change", handle(async () => {
      const def = available.find((d) => d.id === select.value);
      if (!def) return;
      this.setExtConnected(preset, def, true);
      await this.save();
      this.rerenderPresets();
    }));
  }

  /** A connected extension shown as a toggle in a grid; turning it off disconnects. */
  private renderExtToggle(grid: HTMLElement, preset: Preset, def: RegistryExtension) {
    const row = grid.createDiv({ cls: "wcp-toggle-chip" });
    const hint = this.plugin.extensions.loc(def, "hint") ?? def.hint;
    if (hint) setTooltip(row, hint, { placement: "top" });
    row.createSpan({ text: this.plugin.extensions.loc(def, "toggleLabel") ?? def.toggleLabel, cls: "wcp-toggle-label" });
    row.createDiv({ cls: "checkbox-container is-enabled" });
    row.addEventListener("click", handle(async () => {
      this.setExtConnected(preset, def, false);
      await this.save();
      this.rerenderPresets();
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
      this.rerenderPresets();
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
      select.createEl("option", { text: this.plugin.extensions.loc(def, "toggleLabel") ?? def.toggleLabel, value: def.id });
    }
    select.value = rule.metric;
    select.addEventListener("change", handle(async () => {
      rule.metric = select.value;
      // Whole-number thresholds, except for decimal metrics (pages, ratio extensions).
      if (!this.allowsDecimalThreshold(rule.metric)) rule.threshold = Math.round(rule.threshold);
      this.clampToPair(rule, this.pairedRule(preset, rule));
      await this.save();
      this.rerenderPresets(); // re-render so the chosen metric drops out of other dropdowns
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
      if (paired) this.rerenderPresets(); // refresh the paired input's min/max hint
    }));

    // Delete
    const del = row.createEl("button");
    setIcon(del, "trash-2");
    setTooltip(del, t.btnRemoveLimit, { placement: "top" });
    del.addClass("wcp-btn", "wcp-btn-delete");
    del.addEventListener("click", handle(async () => {
      preset.rules = preset.rules.filter((r) => r !== rule);
      await this.save();
      this.rerenderPresets();
    }));
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  sectionHeader(parent: HTMLElement, text: string) {
    parent.createEl("p", { text, cls: "wcp-section-header" });
  }

  renderToggleChip(parent: HTMLElement, preset: Preset, key: keyof Preset, label: string, hint?: string, onChange?: () => void): HTMLElement {
    const row = parent.createDiv({ cls: "wcp-toggle-chip" });
    if (hint) setTooltip(row, hint, { placement: "top" });

    row.createSpan({ text: label, cls: "wcp-toggle-label" });

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
    if (ruName) ru.storeName = ruName;
    if (ruDescription) ru.description = ruDescription;
    return Object.keys(ru).length > 0 ? { ru } : undefined;
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Extension browser modal ───────────────────────────────────────────────────

type ExtTypeFilter = "all" | "metric" | "setting" | "preset" | "local";

export class ExtensionBrowserModal extends Modal {
  private plugin: WordCountPlugin;
  // Called after an install/uninstall so the settings page behind the modal can refresh.
  private onChanged: () => void;
  private entries: ExtensionIndexEntry[] = [];
  private filter = "";
  private typeFilter: ExtTypeFilter = "all";
  private chipsEl: HTMLElement;
  // Desktop-only affordances: chevrons at the edges of the filter row. The right one
  // shows while the row isn't scrolled to its end, the left one while it's scrolled
  // away from its start. The observer recomputes their visibility on resize.
  private chipsMoreBtn?: HTMLElement;
  private chipsLessBtn?: HTMLElement;
  private chipsResize?: ResizeObserver;
  private listEl: HTMLElement;
  private state: "loading" | "ready" | "error" = "loading";
  // Set whenever an install/uninstall changes the registry. The settings page is
  // re-rendered again on close (see onClose): re-rendering while this modal is
  // still on top doesn't reliably refresh the dropdowns behind it.
  private dirty = false;

  constructor(plugin: WordCountPlugin, onChanged: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    // Wrap the page-refresh callback so every install/uninstall also flags the modal
    // dirty; onClose then re-renders the settings page once this modal is gone.
    this.onChanged = () => { this.dirty = true; onChanged(); };
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
      this.renderChips();
      this.renderList();
    });

    const filtersWrap = contentEl.createDiv({ cls: "wcp-ext-filters-wrap" });
    this.chipsEl = filtersWrap.createDiv({ cls: "wcp-ext-filters" });
    // A mouse wheel emits only vertical deltas, which the browser sends to the
    // nearest vertically-scrollable ancestor — so hovering this horizontal-only
    // row and spinning the wheel did nothing. Translate a predominantly-vertical
    // wheel into horizontal movement; touchpads (horizontal deltas) keep scrolling
    // the row natively and are left untouched.
    this.chipsEl.addEventListener("wheel", (evt) => {
      if (Math.abs(evt.deltaY) <= Math.abs(evt.deltaX)) return;
      const el = this.chipsEl;
      if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
      evt.preventDefault();
      el.scrollLeft += evt.deltaY;
    }, { passive: false });

    // On desktop the filter row can be cut off (the scrollbar is hidden), so themes
    // with wider chips hide chips at the edges. A chevron at each cut-off edge signals
    // there's more and scrolls to reveal it on click. Touch devices scroll the row
    // directly, so the affordances are desktop-only.
    if (Platform.isDesktop) {
      this.chipsLessBtn = filtersWrap.createEl("button", { cls: "wcp-ext-filters-less" });
      setIcon(this.chipsLessBtn, "chevron-left");
      this.chipsLessBtn.addEventListener("click", () => {
        this.chipsEl.scrollTo({ left: 0, behavior: "smooth" });
      });
      this.chipsMoreBtn = filtersWrap.createEl("button", { cls: "wcp-ext-filters-more" });
      setIcon(this.chipsMoreBtn, "chevron-right");
      this.chipsMoreBtn.addEventListener("click", () => {
        this.chipsEl.scrollTo({ left: this.chipsEl.scrollWidth, behavior: "smooth" });
      });
      this.chipsEl.addEventListener("scroll", () => this.updateChipsOverflow());
      // clientWidth changes (modal/window resize) can create or remove the overflow.
      this.chipsResize = new ResizeObserver(() => this.updateChipsOverflow());
      this.chipsResize.observe(this.chipsEl);
    }
    this.renderChips();

    this.listEl = contentEl.createDiv({ cls: "wcp-ext-list" });
    this.renderList();
    void this.load();
  }

  /**
   * Whether an entry matches the current search text (type filter aside). Matches
   * against the localized name/description shown in the list as well as the base
   * (English) values, so typing in the active locale finds what's on screen.
   */
  private matchesSearch(e: ExtensionIndexEntry): boolean {
    const f = this.filter;
    if (!f) return true;
    const loc = this.plugin.extensions;
    const hit = (s: string | undefined) => !!s && s.toLowerCase().includes(f);
    return (
      hit(e.storeName) ||
      hit(loc.loc(e, "storeName")) ||
      hit(e.description) ||
      hit(loc.loc(e, "description")) ||
      hit(e.author) ||
      hit(e.id)
    );
  }

  /**
   * Type filter chips: All / Metrics / Advanced settings / Presets. Each chip shows
   * how many catalogue entries it would yield for the current search — e.g.
   * "Metrics (12)" — so the count is independent of the selected type and updates as
   * you type. Counts are only shown once the catalogue has loaded.
   */
  private renderChips() {
    this.chipsEl.empty();
    const ready = this.state === "ready";
    const matched = ready ? this.entries.filter((e) => this.matchesSearch(e)) : [];
    const localMatched = this.localEntries().filter((e) => this.matchesSearch(e));
    const countOf = (value: ExtTypeFilter) =>
      value === "local"
        ? localMatched.length
        : value === "all"
          ? matched.length
          : matched.filter((e) => e.type === value).length;
    const chips: { value: ExtTypeFilter; label: string }[] = [
      { value: "all", label: t.extFilterAll },
      { value: "metric", label: t.extFilterMetrics },
      { value: "setting", label: t.extFilterSettings },
      { value: "preset", label: t.extFilterPresets },
    ];
    // Local extension testing is a desktop-only developer feature.
    if (!Platform.isMobile) chips.push({ value: "local", label: t.extFilterLocal });
    for (const { value, label } of chips) {
      const chip = this.chipsEl.createEl("button", { cls: "wcp-ext-filter" });
      chip.appendText(label);
      // Local counts come from installed files (no network), so they show even while
      // the remote catalogue is still loading or failed to load.
      if (ready || value === "local") chip.createSpan({ text: `(${countOf(value)})`, cls: "wcp-ext-filter-count" });
      if (this.typeFilter === value) chip.addClass("is-active");
      chip.addEventListener("click", () => {
        this.typeFilter = value;
        this.renderChips();
        this.renderList();
      });
    }
    // The chip set just changed, so the row's overflow may have too.
    this.updateChipsOverflow();
  }

  /**
   * Toggle the edge chevrons by scroll position: the right one while there's more to
   * the right, the left one while scrolled away from the start (1px slack absorbs
   * sub-pixel rounding). A no-op when the buttons don't exist (mobile, or before
   * they're created).
   */
  private updateChipsOverflow() {
    if (!this.chipsMoreBtn) return;
    const el = this.chipsEl;
    this.chipsMoreBtn.toggleClass("is-visible", el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    this.chipsLessBtn?.toggleClass("is-visible", el.scrollLeft > 1);
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
    this.renderChips(); // counts become available once the catalogue is loaded
    this.renderList();
  }

  private renderList() {
    const list = this.listEl;
    list.empty();

    // The "Local" filter is independent of the remote catalogue: a pinned "add from
    // file" card on top, then the locally-installed extensions.
    if (this.typeFilter === "local") {
      this.renderLocalIntroCard(list);
      const locals = this.localEntries().filter((e) => this.matchesSearch(e));
      for (const entry of locals) this.renderCard(list, entry);
      return;
    }

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

    const matchesType = (e: ExtensionIndexEntry) =>
      this.typeFilter === "all" || e.type === this.typeFilter;

    const shown = this.entries.filter((e) => this.matchesSearch(e) && matchesType(e));
    if (shown.length === 0) {
      list.createEl("p", { text: t.extNoResults, cls: "wcp-ext-status" });
      return;
    }

    for (const entry of shown) this.renderCard(list, entry);
  }

  /**
   * Locally-installed extensions as catalogue-shaped rows. A stored Extension carries
   * every field a card reads (id, names, author, type, i18n), so the existing card
   * renderer handles them unchanged.
   */
  private localEntries(): ExtensionIndexEntry[] {
    return this.plugin.extensionManager.localExtensions();
  }

  /**
   * The pinned card at the top of the "Local" filter: explains the flow and offers a
   * folder-open button that picks a JSON file and installs it as a local extension.
   * Reuses the standard card markup so it sits flush with the list below.
   */
  private renderLocalIntroCard(parent: HTMLElement) {
    const card = parent.createDiv({ cls: "wcp-ext-card wcp-ext-local-intro" });
    const main = card.createDiv({ cls: "wcp-ext-card-main" });
    const head = main.createDiv({ cls: "wcp-ext-card-head" });
    head.createSpan({ text: t.extLocalIntroTitle, cls: "wcp-ext-name" });
    main.createEl("p", { text: t.extLocalIntroDesc, cls: "wcp-ext-desc" });

    // No author to credit, so the button takes the whole width of the bar.
    const actions = this.renderCardFooter(card);
    const add = actions.createEl("button", { cls: "wcp-ext-install" });
    setIcon(add, "folder-open");
    setTooltip(add, t.extLocalAdd, { placement: "top" });
    add.addEventListener("click", () => this.pickLocalFile());
  }

  /**
   * Open a file picker, read the chosen JSON and install it as a local extension.
   * The hidden input is created on demand (so the native dialog opens from this user
   * gesture) and removed once it fires.
   */
  private pickLocalFile() {
    const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const input = this.contentEl.createEl("input", { type: "file", cls: "wcp-ext-file-input" });
    input.accept = ".json,application/json";
    input.addEventListener("change", handle(async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const ext = await this.plugin.extensionManager.installLocal(JSON.parse(await file.text()));
        new Notice(t.extLocalInstalledNotice(this.storeName(ext)));
        this.onChanged();
        this.renderChips();
        this.renderList();
      } catch (e) {
        new Notice(t.extLocalInstallFailed(message(e)));
      }
    }));
    input.click();
  }

  /**
   * An extension's display name in the active locale — what the card shows, and so
   * what every notice about it must say too.
   */
  private storeName(entry: { storeName: string; i18n?: I18n }): string {
    return this.plugin.extensions.loc(entry, "storeName") ?? entry.storeName;
  }

  /**
   * The row along the foot of a card: whose work the extension is, then what to do
   * with it. The credit shares the bar with the buttons rather than sitting up in
   * the description — the space the buttons don't need is its own.
   */
  private renderCardFooter(card: HTMLElement, author?: string): HTMLElement {
    const actions = card.createDiv({ cls: "wcp-ext-actions" });
    // Marked on the row rather than asked of its contents, so the buttons know
    // whether they are sharing the bar or filling it.
    if (author) {
      actions.addClass("is-credited");
      actions.createSpan({ text: t.extByAuthor(author), cls: "wcp-ext-author" });
    }
    return actions;
  }

  private renderCard(parent: HTMLElement, entry: ExtensionIndexEntry) {
    const card = parent.createDiv({ cls: "wcp-ext-card" });

    // Top: name + type icon, then the description. The author goes in the footer.
    const main = card.createDiv({ cls: "wcp-ext-card-main" });
    const head = main.createDiv({ cls: "wcp-ext-card-head" });
    head.createSpan({ text: this.storeName(entry), cls: "wcp-ext-name" });
    const icon = head.createSpan({ cls: "wcp-ext-type-icon" });
    const typeIcon = entry.type === "metric" ? "whole-word" : entry.type === "preset" ? "package" : "sliders-horizontal";
    const typeLabel = entry.type === "metric" ? t.extTypeMetric : entry.type === "preset" ? t.extTypePreset : t.extTypeSetting;
    setIcon(icon, typeIcon);
    setTooltip(icon, typeLabel, { placement: "top" });
    main.createEl("p", { text: this.plugin.extensions.loc(entry, "description") ?? entry.description, cls: "wcp-ext-desc" });

    // Presets install differently (they add a preset + pull in the extensions they
    // use), so they get their own single "Add" action and skip the install-state UI.
    if (entry.type === "preset") {
      this.renderPresetActions(this.renderCardFooter(card, entry.author), entry);
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

    // The foot of the card: the credit, then the actions (neutral by default,
    // accent/red only on hover).
    const actions = this.renderCardFooter(card, entry.author);

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
          const name = this.storeName(entry);
          new Notice(deps > 0 ? t.extInstalledWithDepsNotice(name, deps) : t.extInstalledNotice(name));
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
          new Notice(t.extUninstalledNotice(this.storeName(entry)));
          this.onChanged();
          this.renderChips(); // local count chip reflects the removal
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
          .map((d) => this.storeName(d))
          .join(", ");
        new ExtUninstallConfirmModal(this.plugin.app, this.storeName(entry), names, doUninstall).open();
      });
    }
  }

  /**
   * A preset card's single "Add" action: download the extensions the preset uses,
   * then add the preset to the user's preset list (activating it if none is active).
   */
  private renderPresetActions(actions: HTMLElement, entry: ExtensionIndexEntry) {
    const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
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
        new Notice(t.extPresetInstalledNotice(this.storeName(entry), extCount));
        this.onChanged();
        this.renderList();
      } catch (e) {
        new Notice(t.extInstallFailed(message(e)));
        this.renderList();
      }
    }));
  }

  onClose() {
    this.chipsResize?.disconnect();
    this.contentEl.empty();
    // Re-render the settings page now the modal is closed (and the settings tab is
    // front-most again), so freshly installed extensions — local or from the
    // catalogue — reliably show up in each preset's connect dropdowns.
    if (this.dirty) this.onChanged();
  }
}

// ── Custom labels modal ───────────────────────────────────────────────────────

type LabelFilter = "all" | "builtin" | "downloaded";

/**
 * One row of the custom-labels list: an installed metric plus the labels it falls
 * back to when the user hasn't overridden them. Built-ins read theirs from the
 * locale, community metrics from their (localized) definition.
 */
interface LabelTarget {
  key: string;           // built-in MetricKey or extension metric id
  name: string;          // card title
  description: string;   // what the metric counts (the store shows the same line)
  builtin: boolean;
  author?: string;
  statusDefault: string; // status bar
  blockDefault: string;  // right-pane block
}

/**
 * Rename any installed metric. Each card carries the metric's two display labels —
 * status bar and right-pane block — as free text: what's in the box is what shows,
 * and an empty box means the metric is displayed with no label at all. A field left
 * at its default isn't stored, so it keeps following the locale (and, for community
 * metrics, extension updates); "Reset" clears both back to that state.
 *
 * Labels are plugin-wide rather than per-preset: a metric reads the same everywhere.
 */
export class CustomLabelsModal extends Modal {
  private plugin: WordCountPlugin;
  private filter = "";
  private typeFilter: LabelFilter = "all";
  private chipsEl: HTMLElement;
  private listEl: HTMLElement;

  constructor(plugin: WordCountPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    // Same modal chrome as the extensions store (the inset padding lives on .modal).
    this.modalEl.addClass("wcp-ext-modal");
    contentEl.createEl("h3", { text: t.labelsModalTitle, cls: "wcp-ext-title" });
    contentEl.createEl("p", { text: t.labelsModalNote, cls: "wcp-labels-note" });

    const search = contentEl.createEl("input", { type: "text", cls: "wcp-ext-search" });
    search.placeholder = t.labelsSearchPlaceholder;
    search.addEventListener("input", () => {
      this.filter = search.value.trim().toLowerCase();
      this.renderChips();
      this.renderList();
    });

    const filtersWrap = contentEl.createDiv({ cls: "wcp-ext-filters-wrap" });
    this.chipsEl = filtersWrap.createDiv({ cls: "wcp-ext-filters" });
    this.renderChips();

    this.listEl = contentEl.createDiv({ cls: "wcp-ext-list" });
    this.renderList();
  }

  /**
   * Every metric the user actually has: the built-ins, then each installed community
   * metric (whether or not it's connected to a preset).
   */
  private targets(): LabelTarget[] {
    const out: LabelTarget[] = METRIC_ORDER.map((key) => {
      const toggle = t.toggles[METRIC_SHOW_KEY[key] as keyof typeof t.toggles];
      return {
        key,
        name: toggle.label,
        // A built-in's toggle hint says what it counts — the same job the store's
        // description does for an extension.
        description: toggle.hint,
        builtin: true,
        statusDefault: t.statusLabels[key],
        blockDefault: toggle.label,
      };
    });

    const registry = this.plugin.extensions;
    for (const def of registry.metricList()) {
      const toggleLabel = registry.loc(def, "toggleLabel") ?? def.toggleLabel;
      out.push({
        key: def.id,
        name: registry.loc(def, "storeName") ?? def.storeName,
        description: registry.loc(def, "description") ?? def.description,
        builtin: false,
        author: def.author,
        // Mirrors the fallback chain in ExtensionRegistry.metricRows.
        statusDefault: registry.loc(def, "statusBarLabel") ?? def.statusBarLabel ?? toggleLabel,
        blockDefault: toggleLabel,
      });
    }
    return out;
  }

  /** Search matches the card title, its description, either default label, or the id. */
  private matchesSearch(target: LabelTarget): boolean {
    const f = this.filter;
    if (!f) return true;
    const hit = (s: string | undefined) => !!s && s.toLowerCase().includes(f);
    return (
      hit(target.name) ||
      hit(target.description) ||
      hit(target.statusDefault) ||
      hit(target.blockDefault) ||
      hit(target.key)
    );
  }

  private matchesType(target: LabelTarget): boolean {
    return this.typeFilter === "all" || (this.typeFilter === "builtin") === target.builtin;
  }

  /** Origin chips — All / Built-in / Community — each with its count for the search. */
  private renderChips() {
    this.chipsEl.empty();
    const matched = this.targets().filter((e) => this.matchesSearch(e));
    const countOf = (value: LabelFilter) =>
      value === "all" ? matched.length : matched.filter((e) => (value === "builtin") === e.builtin).length;

    const chips: { value: LabelFilter; label: string }[] = [
      { value: "all", label: t.labelsFilterAll },
      { value: "builtin", label: t.labelsFilterBuiltin },
      { value: "downloaded", label: t.labelsFilterDownloaded },
    ];
    for (const { value, label } of chips) {
      const chip = this.chipsEl.createEl("button", { cls: "wcp-ext-filter" });
      chip.appendText(label);
      chip.createSpan({ text: `(${countOf(value)})`, cls: "wcp-ext-filter-count" });
      if (this.typeFilter === value) chip.addClass("is-active");
      chip.addEventListener("click", () => {
        this.typeFilter = value;
        this.renderChips();
        this.renderList();
      });
    }
  }

  private renderList() {
    this.listEl.empty();
    const shown = this.targets().filter((e) => this.matchesSearch(e) && this.matchesType(e));
    if (shown.length === 0) {
      this.listEl.createEl("p", { text: t.labelsNoResults, cls: "wcp-ext-status" });
      return;
    }
    for (const target of shown) this.renderCard(this.listEl, target);
  }

  /** The stored override for one field, or undefined when the metric uses its default. */
  private override(key: string, field: keyof CustomLabel): string | undefined {
    const entry = this.plugin.settings.customLabels[key];
    const value = entry ? entry[field] : undefined;
    return typeof value === "string" ? value : undefined;
  }

  private hasOverride(key: string): boolean {
    return this.override(key, "status") !== undefined || this.override(key, "block") !== undefined;
  }

  /**
   * Store (or clear) one label. A value equal to the metric's own label is stored as
   * *no* override, so it keeps tracking the locale and extension updates; an empty
   * string is a real override meaning "show no label".
   */
  private async setLabel(key: string, field: keyof CustomLabel, value: string, fallback: string) {
    const labels = this.plugin.settings.customLabels;
    const entry: CustomLabel = { ...(labels[key] ?? {}) };
    if (value === fallback) delete entry[field];
    else entry[field] = value;

    if (entry.status === undefined && entry.block === undefined) delete labels[key];
    else labels[key] = entry;

    await this.plugin.saveSettings();
    // Repaint the status bar and the right pane so the new label shows immediately.
    this.plugin.updateCount();
  }

  private renderCard(parent: HTMLElement, target: LabelTarget) {
    const card = parent.createDiv({ cls: "wcp-ext-card wcp-labels-card" });

    const main = card.createDiv({ cls: "wcp-ext-card-main" });
    const head = main.createDiv({ cls: "wcp-ext-card-head" });
    head.createSpan({ text: target.name, cls: "wcp-ext-name" });
    // The icon (and its tooltip) is the only origin marker — no author/type line, so
    // the card stays two rows tall: the name, then the fields.
    const icon = head.createSpan({ cls: "wcp-ext-type-icon" });
    setIcon(icon, target.builtin ? "whole-word" : "blocks");
    setTooltip(icon, target.builtin ? t.labelsTypeBuiltin : t.labelsTypeDownloaded, { placement: "top" });
    main.createEl("p", { text: target.description, cls: "wcp-ext-desc" });

    const fields = main.createDiv({ cls: "wcp-labels-fields" });
    const addField = (label: string, field: keyof CustomLabel, fallback: string) => {
      const wrap = fields.createDiv({ cls: "wcp-labels-field" });
      wrap.createEl("label", { text: label, cls: "wcp-labels-field-name" });
      const input = wrap.createEl("input", { type: "text", cls: "wcp-labels-input" });
      // Pre-filled with what's shown today, so clearing the box unambiguously means
      // "no label" — the placeholder spells out that result.
      input.value = this.override(target.key, field) ?? fallback;
      input.placeholder = t.labelsNoLabelPlaceholder;
      input.addEventListener("input", handle(async () => {
        await this.setLabel(target.key, field, input.value, fallback);
        refreshReset();
      }));
      return input;
    };

    const statusInput = addField(t.labelsFieldStatusBar, "status", target.statusDefault);
    const blockInput = addField(t.labelsFieldRightPane, "block", target.blockDefault);

    // Reset is the last item of the fields row, so it sits on the inputs' line
    // rather than beside the card as a whole.
    const actions = fields.createDiv({ cls: "wcp-ext-actions wcp-labels-actions" });
    const reset = actions.createEl("button", { cls: "wcp-ext-install" });
    setIcon(reset, "rotate-ccw");
    setTooltip(reset, t.labelsReset, { placement: "top" });
    const refreshReset = () => { reset.disabled = !this.hasOverride(target.key); };

    refreshReset();
    reset.addEventListener("click", handle(async () => {
      delete this.plugin.settings.customLabels[target.key];
      statusInput.value = target.statusDefault;
      blockInput.value = target.blockDefault;
      await this.plugin.saveSettings();
      this.plugin.updateCount();
      refreshReset();
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
