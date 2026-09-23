import { Plugin, MarkdownView, Notice, TextFileView, setTooltip } from "obsidian";
import { t, refreshLocale, localeTags } from "./locales";
import {
  VIEW_TYPE_METRICS,
  AppInternal,
  WorkspaceInternal,
  Preset,
  MetricKey,
  WordCountSettings,
  Metrics,
  DEFAULT_SETTINGS,
  DEFAULT_EXTENSION_REPO_URL,
  METRIC_ORDER,
  computeFull,
  metricRows,
  statusBarRows,
  surfaceWarnLevel,
} from "./metrics";
import { ExtensionRegistry } from "./extensions";
import { ExtensionManager } from "./extension-manager";
import { EmbeddedNotes, CountSource } from "./embeds";
import {
  VIEW_TYPE_CANVAS,
  CanvasScope,
  CanvasViewInternal,
  isCanvasView,
  canvasCardEditor,
  canvasData,
  canvasScope,
  canvasSelection,
  canvasTextSources,
} from "./canvas";
import { MetricsView, WordCountSettingTab } from "./gui";
import { ChangelogModal } from "./changelog";

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class WordCountPlugin extends Plugin {
  settings: WordCountSettings;
  statusBarItem: HTMLElement;
  lastMetrics: Metrics | null = null;
  // Enabled extension-metric values for the current note, keyed by extension id.
  // Computed alongside lastMetrics; consumed by the (forthcoming) extension UI.
  lastExtMetrics: Record<string, number> = {};
  // Live registry of installed extensions and the manager that loads/installs them.
  readonly extensions: ExtensionRegistry = new ExtensionRegistry();
  readonly extensionManager: ExtensionManager = new ExtensionManager(this, this.extensions);
  // Text of the notes embedded in the current one, summed in when
  // settings.countEmbeddedNotes is on, and of the note cards in the current
  // canvas. Redraws the count once a read lands.
  readonly embeddedNotes: EmbeddedNotes = new EmbeddedNotes(this.app, () => this.updateCount());
  private settingTab: WordCountSettingTab;
  private registeredCommandIds: Set<string> = new Set();
  private activatingRightPane = false;
  // While a canvas is the active view, a timer checking it for changes (see
  // watchCanvas), and what the last canvas count was taken from.
  private canvasTimer: number | null = null;
  private lastCanvasState: unknown[] = [];

  async onload() {
    await this.loadSettings();

    // Register installed extensions before the first count so their metrics and
    // setting transforms are live immediately, and localize them to the UI locale.
    this.extensionManager.load();
    this.extensions.setLocale(localeTags());

    // Don't auto-create a preset on first run — the plugin starts with an empty
    // preset list and the user adds their own. Only keep activePresetId valid
    // when presets already exist (e.g. it points at a since-deleted preset).
    if (this.settings.presets.length > 0 && !this.getActivePreset()) {
      this.settings.activePresetId = this.settings.presets[0].id;
      await this.saveSettings();
    }

    refreshLocale();
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("wcp-status-bar");
    this.statusBarItem.addEventListener("click", () => this.cyclePreset());

    this.registerAllPresetCommands();

    // Right pane metrics view
    this.registerView(VIEW_TYPE_METRICS, (leaf) => new MetricsView(leaf, this));
    this.addCommand({
      id: "open-metrics-view",
      name: t.commandOpenView,
      callback: () => this.activateRightPane(true),
    });
    this.addCommand({
      id: "show-changelog",
      name: t.commandShowChangelog,
      callback: () => new ChangelogModal(this.app).open(),
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.syncCanvasWatch();
      this.updateCount();
    }));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.updateCount()));
    this.registerEvent((this.app.workspace as WorkspaceInternal).on("editor-selection-change", () => this.updateCount()));
    this.register(() => this.stopCanvasWatch());

    // Keep embedded notes' text current. The cache only holds notes embedded in
    // the one being counted, so these do nothing for any other note.
    this.registerEvent(this.app.metadataCache.on("changed", (file, data) => {
      if (this.embeddedNotes.update(file, data)) this.updateCount();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.embeddedNotes.forget(file.path)) this.updateCount();
    }));
    this.registerEvent(this.app.vault.on("rename", (_file, oldPath) => {
      if (this.embeddedNotes.forget(oldPath)) this.updateCount();
    }));

    this.settingTab = new WordCountSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // React to the core word counter being toggled from Obsidian's own settings
    this.registerEvent(
      (this.app as AppInternal).internalPlugins.on("change", () => { void this.syncDefaultWordCountState(); })
    );

    // Defer view/leaf work until the workspace layout is ready
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.hideDefaultWordCount) void this.setDefaultWordCountHidden(true);
      // A canvas restored as the active tab on startup gets no leaf change to start
      // its watch.
      this.syncCanvasWatch();
      void this.applyDisplayMethod();
      // Check the catalogue for extension updates in the background (opt-in).
      if (this.settings.autoUpdateExtensions) void this.autoUpdateInstalledExtensions();
    });

    this.updateCount();
  }

  // ── Display method ──────────────────────────────────────────────────────────

  /**
   * Open or close the right pane to match the chosen display method.
   * @param reveal When true (user-initiated), bring the pane into view. When
   *   false (automatic startup activation), leave the sidebar's saved state
   *   untouched so we don't steal focus from the last-active tab.
   */
  async applyDisplayMethod(reveal = false) {
    if (this.settings.displayMethod === "statusBar") this.detachRightPane();
    else await this.activateRightPane(reveal);
    this.updateCount();
  }

  /**
   * Ensure exactly one metrics leaf exists in the right pane.
   * @param reveal When true, reveal the leaf (used for explicit user actions
   *   like the command or a settings change). When false (the default, used on
   *   startup), the leaf is created but NOT revealed so Obsidian's restored
   *   workspace layout — which tab the user last had focused — is preserved.
   */
  async activateRightPane(reveal = false) {
    // Guard against re-entrancy: two overlapping calls (e.g. onLayoutReady plus a
    // settings change) could each create a leaf before the other's await resolves.
    if (this.activatingRightPane) return;
    this.activatingRightPane = true;
    try {
      const { workspace } = this.app;

      // If a single healthy tab already exists, reuse it (avoids flicker).
      const existing = workspace.getLeavesOfType(VIEW_TYPE_METRICS);
      if (existing.length === 1 && existing[0].view instanceof MetricsView) {
        if (reveal) void workspace.revealLeaf(existing[0]);
        return;
      }

      // Otherwise guarantee a single tab: remove every existing/duplicate/dead/
      // orphaned leaf of our type, then create exactly one. onLayoutReady ensures
      // the workspace's own restore has already finished, so nothing reappears.
      workspace.detachLeavesOfType(VIEW_TYPE_METRICS);

      const right = workspace.getRightLeaf(false);
      if (!right) return;
      // active:false so we don't pull focus away from the editor (which would
      // stop the live count). Only revealLeaf when the user explicitly asked for
      // the pane; on startup we leave the sidebar as the saved layout left it.
      await right.setViewState({ type: VIEW_TYPE_METRICS, active: false });
      if (reveal) void workspace.revealLeaf(right);
    } finally {
      this.activatingRightPane = false;
    }
  }

  detachRightPane() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_METRICS);
  }

  // ── Extension auto-update ─────────────────────────────────────────────────────

  /**
   * Update installed community extensions whose catalogue copy is newer. Runs in
   * the background (opt-in via settings.autoUpdateExtensions); network failures are
   * swallowed so a missing connection never disrupts startup. On success the live
   * counts refresh to reflect the new copies.
   */
  async autoUpdateInstalledExtensions() {
    if (this.extensions.isEmpty()) return;
    // offline or the index couldn't be fetched — try again next launch
    const updated = await this.extensionManager.updateAll().catch(() => null);
    if (!updated || updated.length === 0) return;
    new Notice(t.extAutoUpdatedNotice(updated.length));
    this.updateCount();
  }

  // ── Core word counter toggle ────────────────────────────────────────────────

  async setDefaultWordCountHidden(hidden: boolean) {
    const internal = (this.app as AppInternal).internalPlugins;
    const core = internal?.getPluginById("word-count");
    if (!core) return;
    if (hidden === core.enabled) {
      // Probe the available toggle API (it has changed across Obsidian versions).
      if (hidden) {
        if (internal.disablePluginAndSave) await internal.disablePluginAndSave("word-count");
        else if (internal.disablePlugin) await internal.disablePlugin("word-count");
        else await core.disable?.();
      } else {
        if (internal.enablePluginAndSave) await internal.enablePluginAndSave("word-count");
        else if (internal.enablePlugin) await internal.enablePlugin("word-count");
        else await core.enable?.();
      }
    }
  }

  /**
   * If the user re-enables the core word counter from Obsidian's settings while
   * our "hide" toggle is on, back off and turn the toggle off to avoid a
   * duplicate counter in the status bar.
   */
  private async syncDefaultWordCountState() {
    if (!this.settings.hideDefaultWordCount) return;
    const core = (this.app as AppInternal).internalPlugins?.getPluginById("word-count");
    if (core?.enabled) {
      this.settings.hideDefaultWordCount = false;
      await this.saveSettings();
      this.settingTab.refreshControls();
    }
  }

  // ── Preset helpers ────────────────────────────────────────────────────────

  getActivePreset(): Preset | undefined {
    return this.settings.presets.find((p) => p.id === this.settings.activePresetId);
  }

  async activatePreset(id: string) {
    this.settings.activePresetId = id;
    await this.saveSettings();
    this.updateCount();
  }

  cyclePreset() {
    const { presets } = this.settings;
    if (presets.length <= 1) return;
    const idx = presets.findIndex((p) => p.id === this.settings.activePresetId);
    void this.activatePreset(presets[(idx + 1) % presets.length].id);
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  registerAllPresetCommands() {
    for (const preset of this.settings.presets) this.registerPresetCommand(preset);
  }

  registerPresetCommand(preset: Preset) {
    const cmdId = `word-count-activate-preset-${preset.id}`;
    if (this.registeredCommandIds.has(cmdId)) return;
    this.addCommand({
      id: cmdId,
      name: t.commandActivatePreset(preset.name),
      callback: () => this.activatePreset(preset.id),
    });
    this.registeredCommandIds.add(cmdId);
  }

  removePresetCommand(preset: Preset) {
    const cmdId = `word-count-activate-preset-${preset.id}`;
    (this.app as AppInternal).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
    this.registeredCommandIds.delete(cmdId);
  }

  refreshPresetCommands() {
    // Collect stale IDs first to avoid mutating the Set during iteration
    const stale = [...this.registeredCommandIds].filter(
      (cmdId) => !this.settings.presets.find((p) => p.id === cmdId.replace("word-count-activate-preset-", ""))
    );
    for (const cmdId of stale) {
      (this.app as AppInternal).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
      this.registeredCommandIds.delete(cmdId);
    }

    for (const preset of this.settings.presets) {
      this.registerPresetCommand(preset);
      const cmd = (this.app as AppInternal).commands?.commands?.[`${this.manifest.id}:word-count-activate-preset-${preset.id}`];
      if (cmd) cmd.name = t.commandActivatePreset(preset.name);
    }
  }

  // ── Counting & rendering ────────────────────────────────────────────────────

  updateCount() {
    const preset = this.getActivePreset();
    const view = this.app.workspace.getActiveViewOfType(TextFileView);
    const canvas = isCanvasView(view) ? view : null;

    let sources: CountSource[] | null = null;
    let scope: CanvasScope | undefined;
    if (view instanceof MarkdownView) {
      const selection = view.editor.getSelection();
      // Embeds inside a selection are summed in too, like the rest of the note.
      sources = [{ text: selection.length > 0 ? selection : view.getViewData(), path: view.file?.path ?? "" }];
    } else if (canvas && preset) {
      ({ sources, scope } = this.canvasCount(canvas, preset));
    }

    if (preset && sources) {
      const followEmbeds = this.settings.countEmbeddedNotes;
      // A note reads nothing from the cache unless its embeds are followed; a
      // canvas always does, for its note cards.
      const texts = followEmbeds || canvas
        ? this.embeddedNotes.count(sources, followEmbeds)
        : sources.map((source) => ({ text: "text" in source ? source.text : "" }));
      const full = computeFull(texts, preset, this.extensions, scope);
      this.lastMetrics = full.values;
      this.lastExtMetrics = full.ext;
    } else if (
      this.app.workspace.getLeavesOfType("markdown").length === 0
      && this.app.workspace.getLeavesOfType(VIEW_TYPE_CANVAS).length === 0
    ) {
      // No notes or canvases open at all — clear. If one is still open but focus
      // moved to another pane (e.g. our own right pane), keep the last metrics.
      this.lastMetrics = null;
      this.lastExtMetrics = {};
    }

    this.renderStatusBar(preset, this.lastMetrics);
    this.renderRightPane();
  }

  /**
   * What to count in a canvas: the card being edited, or the text selected in it;
   * otherwise the selected cards; otherwise every card. Returns the texts to count
   * and the cards and arrows they come from, for the canvas metric extensions.
   */
  private canvasCount(view: CanvasViewInternal, preset: Preset): { sources: CountSource[]; scope: CanvasScope } {
    const canvasPath = view.file?.path ?? "";
    const { nodes, edges } = canvasData(view);
    const selected = new Set(canvasSelection(view));
    const scope = canvasScope(nodes, edges, selected.size > 0 ? selected : undefined);

    const edited = canvasCardEditor(this.app.workspace.activeEditor, view);
    if (edited) {
      // A note card's links resolve from its note, a text card's from the canvas.
      const path = edited.info.file?.path ?? canvasPath;
      const selection = edited.editor.getSelection();
      if (selection.length > 0) return { sources: [{ text: selection, path }], scope };
      // A heading or block card edits the note but shows only that section, so it
      // is counted like a selected card: the section, as last saved.
      const [card] = scope.cards;
      if (!(card?.type === "note" && card.subpath)) return { sources: [{ text: edited.editor.getValue(), path }], scope };
      // The card being edited is counted whatever the canvas settings leave out.
      return { sources: canvasTextSources(scope, canvasPath), scope };
    }

    return { sources: canvasTextSources(scope, canvasPath, this.extensions.canvasOptions(preset)), scope };
  }

  /**
   * A canvas raises no event when cards are selected, added or removed, or when a
   * card finishes editing, so while one is the active view it is checked for
   * changes a few times a second. The timer runs only then, costing nothing to
   * anyone not working in a canvas.
   */
  private syncCanvasWatch() {
    if (!isCanvasView(this.app.workspace.getActiveViewOfType(TextFileView))) {
      this.stopCanvasWatch();
    } else if (this.canvasTimer === null) {
      this.canvasTimer = window.setInterval(() => this.watchCanvas(), 250);
    }
  }

  private stopCanvasWatch() {
    if (this.canvasTimer !== null) window.clearInterval(this.canvasTimer);
    this.canvasTimer = null;
    this.lastCanvasState = [];
  }

  /** Recount when what the active canvas's count is taken from has changed. */
  private watchCanvas() {
    const view = this.app.workspace.getActiveViewOfType(TextFileView);
    if (!isCanvasView(view)) {
      this.stopCanvasWatch();
      return;
    }
    const edited = canvasCardEditor(this.app.workspace.activeEditor, view);
    const state = [view, view.canvas?.data, canvasSelection(view).join(","), edited?.editor];
    if (state.length === this.lastCanvasState.length && state.every((v, i) => v === this.lastCanvasState[i])) return;
    this.lastCanvasState = state;
    this.updateCount();
  }

  private renderStatusBar(preset: Preset | undefined, metrics: Metrics | null) {
    const showStatusBar = this.settings.displayMethod !== "rightPane";
    this.statusBarItem.toggle(showStatusBar);
    if (!showStatusBar) return;

    this.statusBarItem.empty();
    if (!preset || !metrics) return;

    const allRows = metricRows(preset, metrics, this.extensions, this.lastExtMetrics, this.settings.customLabels);
    // Metrics hidden from the status bar (see StatusBarVisibilityModal) are left
    // out here only; the right pane still shows them. When every enabled metric is
    // hidden the item is simply left empty — "No metrics enabled" would be untrue.
    const rows = statusBarRows(preset, allRows);
    if (allRows.length === 0) {
      this.statusBarItem.setText(t.statusNoMetrics);
    } else {
      rows.forEach((row, i) => {
        if (i > 0) this.statusBarItem.createSpan({ text: this.settings.separator, cls: "wcp-separator" });
        const span = this.statusBarItem.createSpan({ text: row.statusText });
        const level = surfaceWarnLevel(this.settings.limitWarningsDisplayMethod, "statusBar", row.level);
        if (level !== "none") span.addClass(`wcp-limit-${level}`);
      });
    }

    const multiPreset = this.settings.presets.length > 1;
    setTooltip(
      this.statusBarItem,
      multiPreset ? t.statusTooltipCycle(preset.name) : t.statusTooltipSingle(preset.name),
      { placement: "top" }
    );
  }

  private renderRightPane() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_METRICS)) {
      if (leaf.view instanceof MetricsView) leaf.view.render();
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async loadSettings() {
    const data = (await this.loadData()) as Partial<WordCountSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // A fresh install has no update to announce: mark the running release's
    // changelog notice as seen, and save it so the next update still shows one.
    if (data === null) {
      this.settings.dismissedChangelogVersion = this.manifest.version;
      await this.saveSettings();
    }
    for (const p of this.settings.presets) {
      // Reading-time speed was added later; default existing presets to the
      // average reader so the metric and its dropdown have a valid value.
      if (p.readingWpm === undefined) p.readingWpm = 250;
      // Drag-and-drop ordering was added later; default to the canonical order.
      if (!Array.isArray(p.metricOrder)) p.metricOrder = [...METRIC_ORDER];
      // Extension enable-flag maps were added later; ensure they exist so the
      // registry can write into them.
      if (!p.extMetrics || typeof p.extMetrics !== "object") p.extMetrics = {};
      if (!p.extSettings || typeof p.extSettings !== "object") p.extSettings = {};
      // Per-metric status-bar visibility was added later; everything starts visible.
      if (!Array.isArray(p.statusBarHidden)) p.statusBarHidden = [];

      // The Tables/Tags metrics and the "Ignore code" setting were extracted into
      // community extensions (ids "tables", "tags", "ignore-code"). Carry each
      // preset's prior intent across, reading the now-removed legacy fields, so the
      // matching extension is pre-connected the moment it's installed.
      const em = p.extMetrics, es = p.extSettings;
      const legacy = p as unknown as { showTables?: boolean; showTags?: boolean; ignoreCode?: boolean };
      if (em && legacy.showTables === true) em["tables"] = true;
      if (em && legacy.showTags === true) em["tags"] = true;
      if (es && legacy.ignoreCode === true) es["ignore-code"] = true;
      delete legacy.showTables;
      delete legacy.showTags;
      delete legacy.ignoreCode;
      // Migrate presets saved before warning/goal rules existed: the old
      // `limits`/`stashedLimits` maps (warnings only) become warning rules.
      if (!Array.isArray(p.rules)) {
        const legacy = p as unknown as {
          limits?: Partial<Record<MetricKey, number>>;
          stashedLimits?: Partial<Record<MetricKey, number>>;
        };
        const merged = { ...(legacy.stashedLimits ?? {}), ...(legacy.limits ?? {}) };
        p.rules = (Object.entries(merged) as [MetricKey, number][])
          .map(([metric, threshold]) => ({ metric, threshold, kind: "warning" as const }));
        delete legacy.limits;
        delete legacy.stashedLimits;
      }
    }

    // Extension settings were added later; backfill so the manager has somewhere
    // to read/write installed definitions and the download source.
    if (!Array.isArray(this.settings.installedExtensions)) this.settings.installedExtensions = [];
    if (typeof this.settings.extensionRepoUrl !== "string" || this.settings.extensionRepoUrl.length === 0) {
      this.settings.extensionRepoUrl = DEFAULT_EXTENSION_REPO_URL;
    }
    if (typeof this.settings.autoUpdateExtensions !== "boolean") this.settings.autoUpdateExtensions = false;
    // Custom metric labels were added later; backfill so the modal has a map to
    // write into.
    const labels = this.settings.customLabels as unknown;
    if (!labels || typeof labels !== "object" || Array.isArray(labels)) this.settings.customLabels = {};
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
