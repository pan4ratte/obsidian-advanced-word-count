import { App, ItemView, Modal, PluginSettingTab, Setting, WorkspaceLeaf, ButtonComponent, ToggleComponent, setIcon, setTooltip } from "obsidian";
import { t } from "./locales";
import type WordCountPlugin from "./main";
import {
  VIEW_TYPE_METRICS,
  DisplayMethod,
  RightPaneLayout,
  Preset,
  MetricKey,
  WarnLevel,
  LimitKind,
  LimitRule,
  METRIC_ORDER,
  METRIC_SHOW_KEY,
  defaultPreset,
  metricRows,
  surfaceWarnLevel,
} from "./metrics";

// Wrap an async callback so it satisfies Obsidian's void-returning event/handler
// types without leaving a floating promise.
const handle = (fn: () => Promise<void>) => (): void => { void fn(); };

// ── Right pane metrics view ────────────────────────────────────────────────────

export class MetricsView extends ItemView {
  private plugin: WordCountPlugin;
  // Signature of the currently rendered structure; while it stays the same we
  // update blocks in place so CSS color transitions can animate.
  private gridSig: string | null = null;
  private blockRefs: Map<MetricKey, { block: HTMLElement; value: HTMLElement; text: string }> = new Map();

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
    const rows = preset && metrics ? metricRows(preset, metrics) : [];
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
      const value = block.createEl("div", { cls: "wcp-metric-value" });
      this.renderValue(value, row.value, "", false);
      block.createEl("div", { text: row.blockLabel, cls: "wcp-metric-label" });
      this.blockRefs.set(row.key, { block, value, text: row.value });
    }
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

    // ── Presets ───────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.settingsSectionPresets).setHeading();

    new Setting(containerEl)
      .setName(t.settingsPresetsName)
      .setDesc(t.settingsPresetsDesc)
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText(t.settingsAddPreset).setCta().onClick(async () => {
          const preset = defaultPreset({
            name: t.newPresetName(this.plugin.settings.presets.length + 1),
          });
          this.plugin.settings.presets.unshift(preset);
          // If nothing is active (e.g. the very first preset on a fresh install),
          // make this one active so counts show up immediately.
          if (!this.plugin.getActivePreset()) this.plugin.settings.activePresetId = preset.id;
          await this.save();
          this.display();
        })
      );

    for (const preset of this.plugin.settings.presets) {
      this.renderPreset(containerEl, preset);
    }
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
    this.sectionHeader(card, t.sectionStatusBar);
    card.createEl("p", { text: t.sectionStatusBarNote, cls: "wcp-section-note" });

    const visGrid = card.createDiv({ cls: "wcp-toggle-grid" });
    for (const key of Object.keys(t.toggles) as (keyof typeof t.toggles)[]) {
      const chip = this.renderToggleChip(visGrid, preset, key, t.toggles[key].label, t.toggles[key].hint, () => {
        if (key === "showPages") refreshPagesValidity();
      });
      if (key === "showPages") pagesChip = chip;
    }

    refreshPagesValidity();

    // ── Word count options ──────────────────────────────────────────────────
    this.sectionHeader(card, t.sectionWordCountOptions);
    card.createEl("p", { text: t.sectionWordCountOptionsNote, cls: "wcp-section-note" });

    const wcGrid = card.createDiv({ cls: "wcp-toggle-grid-wide" });
    for (const key of Object.keys(t.wordCountOptions) as (keyof typeof t.wordCountOptions)[]) {
      this.renderToggleChip(wcGrid, preset, key, t.wordCountOptions[key].label, t.wordCountOptions[key].hint);
    }

    // ── Warnings & goals ──────────────────────────────────────────────────────
    this.renderLimits(card.createDiv(), preset);
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

  private renderRuleRow(container: HTMLElement, preset: Preset, rule: LimitRule) {
    const row = container.createDiv({ cls: "wcp-limit-item" });

    // Metric dropdown — offers metrics not already claimed by another rule.
    const taken = new Set(preset.rules.filter((r) => r !== rule).map((r) => r.metric));
    const select = row.createEl("select", { cls: "dropdown" });
    if (rule.metric === "") select.createEl("option", { text: t.limitSelectMetric, value: "" });
    for (const k of METRIC_ORDER) {
      if (taken.has(k)) continue;
      select.createEl("option", { text: t.toggles[METRIC_SHOW_KEY[k] as keyof typeof t.toggles].label, value: k });
    }
    select.value = rule.metric;
    select.addEventListener("change", handle(async () => {
      rule.metric = select.value as MetricKey | "";
      await this.save();
      this.display(); // re-render so the chosen metric drops out of other dropdowns
    }));

    // Threshold
    const input = row.createEl("input", { type: "number" });
    input.min = "0";
    input.value = String(rule.threshold);
    input.addClass("wcp-limit-threshold");
    input.addEventListener("change", handle(async () => {
      const n = Number(input.value);
      rule.threshold = isFinite(n) && n >= 0 ? n : 0;
      input.value = String(rule.threshold);
      await this.save();
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
