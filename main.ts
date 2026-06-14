import { App, EventRef, ItemView, Modal, Plugin, PluginSettingTab, Setting, MarkdownView, Workspace, WorkspaceLeaf, ButtonComponent, ToggleComponent, setIcon, setTooltip } from "obsidian";
import { t, refreshLocale } from "./locales";

const VIEW_TYPE_METRICS = "advanced-word-count-view";

type DisplayMethod = "statusBar" | "rightPane" | "both";

type RightPaneLayout = "one" | "two";

// ── Types ─────────────────────────────────────────────────────────────────────

// Undocumented Obsidian internals not present in the public type definitions
interface ObsidianCommands {
  removeCommand(id: string): void;
  commands: Record<string, { name: string }>;
}
interface InternalPlugin {
  enabled: boolean;
  enable?: (save?: boolean) => Promise<void> | void;
  disable?: (save?: boolean) => Promise<void> | void;
}
// Method names for toggling core plugins have differed across Obsidian
// versions, so every entry point is treated as optional and probed at runtime.
interface InternalPlugins {
  getPluginById(id: string): InternalPlugin | null;
  enablePluginAndSave?(id: string): Promise<void>;
  disablePluginAndSave?(id: string): Promise<void>;
  enablePlugin?(id: string): Promise<void>;
  disablePlugin?(id: string): Promise<void>;
  on(name: "change", callback: () => void): EventRef;
}
interface AppInternal extends App {
  commands: ObsidianCommands;
  internalPlugins: InternalPlugins;
}
type WorkspaceInternal = Workspace & {
  on(name: string, callback: (...args: unknown[]) => void): EventRef;
};

interface Preset {
  id: string;
  name: string;

  // Page
  wordsPerPage: number;

  // Metric visibility
  showWordsWithSpaces: boolean;    // space-separated word count
  showCharsWithSpaces: boolean;    // total characters including spaces and linebreaks
  showCharsWithoutSpaces: boolean; // total characters excluding all whitespace
  showPages: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
  showCitekeys: boolean;
  showEmbeds: boolean;
  showTables: boolean;
  showTags: boolean;

  // Word count inclusions / exclusions (shared by both word and char metrics)
  countMdLinksAsWords: boolean;
  countWikiLinkDisplayText: boolean;
  ignoreWikiLinks: boolean;
  countCitekeysAsWords: boolean;
  ignoreComments: boolean;
  ignoreHtmlTags: boolean;

  // Per-metric warning limits (metric key → threshold)
  limits: Partial<Record<MetricKey, number>>;
  // Limits of metrics that are currently disabled, preserved so they return
  // when the metric is re-enabled.
  stashedLimits: Partial<Record<MetricKey, number>>;
}

interface WordCountSettings {
  activePresetId: string;
  presets: Preset[];
  separator: string;
  hideDefaultWordCount: boolean;
  displayMethod: DisplayMethod;
  rightPaneLayout: RightPaneLayout;
  limitWarningsDisplayMethod: DisplayMethod;
}

interface Metrics {
  wordsWithSpaces: number;
  charsWithSpaces: number;
  charsWithoutSpaces: number;
  pages: string;
  lines: number;
  paragraphs: number;
  markdownLinks: number;
  wikiLinks: number;
  citekeys: number;
  embeds: number;
  tables: number;
  tags: number;
}

// Metric identifiers match the field names in Metrics
type MetricKey = keyof Metrics;
type WarnLevel = "none" | "orange" | "red";

// Display order and the preset "show" flag that gates each metric
const METRIC_ORDER: MetricKey[] = [
  "wordsWithSpaces", "charsWithSpaces", "charsWithoutSpaces", "pages",
  "lines", "paragraphs", "markdownLinks", "wikiLinks", "citekeys",
  "embeds", "tables", "tags",
];
const METRIC_SHOW_KEY: Record<MetricKey, keyof Preset> = {
  wordsWithSpaces: "showWordsWithSpaces",
  charsWithSpaces: "showCharsWithSpaces",
  charsWithoutSpaces: "showCharsWithoutSpaces",
  pages: "showPages",
  lines: "showLines",
  paragraphs: "showParagraphs",
  markdownLinks: "showMarkdownLinks",
  wikiLinks: "showWikiLinks",
  citekeys: "showCitekeys",
  embeds: "showEmbeds",
  tables: "showTables",
  tags: "showTags",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultPreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: crypto.randomUUID(),
    name: t.defaultPresetName,
    wordsPerPage: 250,
    showWordsWithSpaces: true,
    showCharsWithSpaces: false,
    showCharsWithoutSpaces: false,
    showPages: true,
    showLines: false,
    showParagraphs: false,
    showMarkdownLinks: false,
    showWikiLinks: false,
    showCitekeys: false,
    showEmbeds: false,
    showTables: false,
    showTags: false,
    countMdLinksAsWords: false,
    countWikiLinkDisplayText: false,
    ignoreWikiLinks: false,
    countCitekeysAsWords: false,
    ignoreComments: true,
    ignoreHtmlTags: false,
    limits: {},
    stashedLimits: {},
    ...overrides,
  };
}

// When a metric is toggled, move its limit warning between the active `limits`
// and the per-preset `stashedLimits` store so disabling/re-enabling a metric
// hides/restores its warning without losing the configured threshold.
function syncMetricLimit(preset: Preset, key: MetricKey) {
  const enabled = preset[METRIC_SHOW_KEY[key]] as boolean;
  if (enabled) {
    const stashed = preset.stashedLimits[key];
    if (stashed !== undefined) {
      preset.limits[key] = stashed;
      delete preset.stashedLimits[key];
    }
  } else {
    const active = preset.limits[key];
    if (active !== undefined) {
      preset.stashedLimits[key] = active;
      delete preset.limits[key];
    }
  }
}

// Wrap an async callback so it satisfies Obsidian's void-returning event/handler
// types without leaving a floating promise.
const handle = (fn: () => Promise<void>) => (): void => { void fn(); };

const DEFAULT_SETTINGS: WordCountSettings = {
  activePresetId: "",
  presets: [],
  separator: "  |  ",
  hideDefaultWordCount: false,
  displayMethod: "statusBar",
  rightPaneLayout: "two",
  limitWarningsDisplayMethod: "both",
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class WordCountPlugin extends Plugin {
  settings: WordCountSettings;
  statusBarItem: HTMLElement;
  lastMetrics: Metrics | null = null;
  private settingTab: WordCountSettingTab;
  private registeredCommandIds: Set<string> = new Set();
  private activatingRightPane = false;

  async onload() {
    await this.loadSettings();

    // Ensure at least one preset exists and activePresetId is valid
    if (this.settings.presets.length === 0) {
      const first = defaultPreset({ name: t.defaultPresetName });
      this.settings.presets.push(first);
      this.settings.activePresetId = first.id;
      await this.saveSettings();
    } else if (!this.getActivePreset()) {
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

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateCount()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.updateCount()));
    this.registerEvent((this.app.workspace as WorkspaceInternal).on("editor-selection-change", () => this.updateCount()));

    this.settingTab = new WordCountSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // React to the core word counter being toggled from Obsidian's own settings
    this.registerEvent(
      (this.app as AppInternal).internalPlugins.on("change", () => { void this.syncDefaultWordCountState(); })
    );

    // Defer view/leaf work until the workspace layout is ready
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.hideDefaultWordCount) void this.setDefaultWordCountHidden(true);
      void this.applyDisplayMethod();
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
      this.settingTab.refreshHideDefaultToggle();
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

  // ── Text pre-processing ───────────────────────────────────────────────────

  private preprocessBase(raw: string, preset: Preset): string {
    let s = raw;

    // Frontmatter
    s = s.replace(/^---[\s\S]*?---\n?/, "");

    // Comments (stripped first so their content never leaks into counts)
    if (preset.ignoreComments) {
      s = s.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
    }

    // HTML tags — strip the markup but keep the words/symbols inside the tags.
    // [^<>] (rather than [^>]) prevents quadratic backtracking on inputs like "<A<A<A…".
    if (preset.ignoreHtmlTags) {
      s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, "");
    }

    // Code blocks (always excluded)
    s = s.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

    // Images (always excluded)
    s = s.replace(/!\[.*?\]\(.*?\)/g, "");

    // Markdown links — keep label text or strip
    if (preset.countMdLinksAsWords) {
      s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
      s = s.replace(/\([^)]*\)\[([^\]]*)\]/g, "$1");
    } else {
      s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_: string, label: string, url: string) => `${label} ${url.trim()}`.trim());
      s = s.replace(/\(([^)]*)\)\[([^\]]*)\]/g, (_: string, url: string, label: string) => `${label} ${url.trim()}`.trim());
    }

    // Wiki links
    if (preset.ignoreWikiLinks) {
      // Strip entirely
      s = s.replace(/\[\[.*?\]\]/g, "");
    } else if (preset.countWikiLinkDisplayText) {
      // [[Page|Alias]] → "Alias", [[Page]] → "Page"
      s = s.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_: string, page: string, alias: string) =>
        (alias.trim() || page.trim()).replace(/#.*$/, "").trim()
      );
    } else {
      // Count every word inside: [[Page#Heading|Alias]] → "Page Heading Alias"
      s = s.replace(/\[\[([^\]]*)\]\]/g, (_: string, inner: string) =>
        inner.replace(/[|#]/g, " ").trim()
      );
    }

    // Citekeys — strip of keep as word token
    if (preset.countCitekeysAsWords) {
      s = s.replace(/\[@[^\]]*\]/g, "");
    } else {
      s = s.replace(/\[@([^\]]+)\]/g, "$1");
    }

    // Strip inline Markdown decoration (headings, bold, italic, strike, quotes, pipes)
    // List-item markers are intentionally left here for callers to handle.
    s = s
      .replace(/#{1,6}\s/g, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/>\s/g, "")
      .replace(/\|/g, "");

    return s;
  }

  preprocessText(raw: string, preset: Preset): string {
    // Build the base (no list markers yet), then strip them for word counting.
    let s = this.preprocessBase(raw, preset);

    s = s
      .replace(/[-*+]\s/g, "")
      .replace(/\d+\.\s/g, "");

    return s;
  }

  // ── Counters ──────────────────────────────────────────────────────────────

  /** Traditional word count: space-separated tokens after preprocessing. */
  countWordsWithSpaces(preprocessed: string): number {
    const trimmed = preprocessed.trim();
    // split(/\s+/) on a non-empty trimmed string never produces empty tokens
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  private substituteListMarkers(base: string, countSpaces: boolean): string {
    const u = countSpaces ? "\x01\x02"      : "\x01";        // unordered / checkbox
    const n = countSpaces ? "\x01\x02\x03"  : "\x01\x02";   // numbered
    return base
      .replace(/^- \[[ x]\] /gm, u)   // checkbox
      .replace(/^[*\-+] /gm,     u)   // unordered
      .replace(/^\d+\. /gm,      n)   // numbered (dot)
      .replace(/^\d+\) /gm,      n);  // numbered (paren)
  }

  /** Character count including spaces and linebreaks, after preprocessing. */
  countCharsWithSpaces(base: string): number {
    return this.substituteListMarkers(base, true).length;
  }

  /** Character count excluding all whitespace, after preprocessing. */
  countCharsWithoutSpaces(base: string): number {
    return this.substituteListMarkers(base, false).replace(/\s/g, "").length;
  }

  countLines(text: string): number {
    return text ? text.split("\n").length : 0;
  }

  countParagraphs(text: string): number {
    if (!text) return 0;
    return text
      .replace(/^---[\s\S]*?---\n?/, "")
      .split(/\n{2,}/)
      .filter((b) => b.trim().length > 0).length;
  }

  countMarkdownLinks(text: string): number {
    const standard = (text.match(/\[[^\]]{0,500}\]\([^)]{0,2000}\)/g) ?? []).filter((m) => !m.startsWith("!"));
    return standard.length + (text.match(/\([^)]{0,500}\)\[[^\]]{0,500}\]/g) ?? []).length;
  }

  countWikiLinks(text: string): number {
    // Exclude embeds (![[...]]) — those are counted separately.
    return (text.match(/(?<!!)\[\[[^\]]{0,500}\]\]/g) ?? []).length;
  }

  countCitekeys(text: string): number {
    return (text.match(/\[@[^\]]{1,100}\]/g) ?? []).length;
  }

  countEmbeds(text: string): number {
    return (text.match(/!\[\[[^\]]{0,500}\]\]/g) ?? []).length;
  }

  /** Counts complete Markdown tables (a header row followed by a delimiter row). */
  countTables(text: string): number {
    const lines = text.split("\n");
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const delim = lines[i];
      // Delimiter row: only pipes, dashes, colons and spaces, with at least one of each pipe/dash.
      if (!/^[\s|:-]+$/.test(delim) || !delim.includes("|") || !delim.includes("-")) continue;
      const header = lines[i - 1];
      if (header.includes("|") && header.trim().length > 0) count++;
    }
    return count;
  }

  /** Counts Obsidian #tags (must contain at least one non-numeric character; Unicode-aware). */
  countTags(text: string): number {
    const matches = text.match(/(?<![\p{L}\p{N}_#])#[\p{L}\p{N}_/-]+/gu) ?? [];
    return matches.filter((m) => /[^\p{N}]/u.test(m.slice(1))).length;
  }

  // ── Metric rows & warnings ──────────────────────────────────────────────────

  /** Adjust a metric's warning level for a given surface, honoring the limit-warnings display method. */
  surfaceWarnLevel(surface: "statusBar" | "rightPane", level: WarnLevel): WarnLevel {
    if (level === "none") return "none";
    const m = this.settings.limitWarningsDisplayMethod;
    const show = surface === "statusBar" ? m !== "rightPane" : m !== "statusBar";
    return show ? level : "none";
  }

  /** Warning level for a metric given its limit (90% → orange, 100%+ → red). */
  warnLevel(preset: Preset, m: Metrics, key: MetricKey): WarnLevel {
    const limit = preset.limits?.[key];
    if (!limit || limit <= 0) return "none";
    const raw = m[key];
    const value = typeof raw === "number" ? raw : parseFloat(raw);
    const ratio = value / limit;
    if (ratio >= 1) return "red";
    if (ratio >= 0.9) return "orange";
    return "none";
  }

  /** Enabled metrics in display order, with status-bar text, block label/value and warning level. */
  metricRows(preset: Preset, m: Metrics): { key: MetricKey; blockLabel: string; statusText: string; value: string; level: WarnLevel }[] {
    const defs: { key: MetricKey; show: boolean; blockLabel: string; statusText: string; value: string }[] = [
      { key: "wordsWithSpaces",    show: preset.showWordsWithSpaces,    blockLabel: t.toggles.showWordsWithSpaces.label,    statusText: t.statusWords(m.wordsWithSpaces),           value: String(m.wordsWithSpaces) },
      { key: "charsWithSpaces",    show: preset.showCharsWithSpaces,    blockLabel: t.toggles.showCharsWithSpaces.label,    statusText: t.statusChars(m.charsWithSpaces),           value: String(m.charsWithSpaces) },
      { key: "charsWithoutSpaces", show: preset.showCharsWithoutSpaces, blockLabel: t.toggles.showCharsWithoutSpaces.label, statusText: t.statusCharsNoSpaces(m.charsWithoutSpaces), value: String(m.charsWithoutSpaces) },
      { key: "pages",              show: preset.showPages && preset.wordsPerPage > 0, blockLabel: t.toggles.showPages.label,        statusText: t.statusPages(m.pages),                     value: m.pages },
      { key: "lines",              show: preset.showLines,              blockLabel: t.toggles.showLines.label,              statusText: t.statusLines(m.lines),                     value: String(m.lines) },
      { key: "paragraphs",         show: preset.showParagraphs,         blockLabel: t.toggles.showParagraphs.label,         statusText: t.statusParas(m.paragraphs),                value: String(m.paragraphs) },
      { key: "markdownLinks",      show: preset.showMarkdownLinks,      blockLabel: t.toggles.showMarkdownLinks.label,      statusText: t.statusMdLinks(m.markdownLinks),           value: String(m.markdownLinks) },
      { key: "wikiLinks",          show: preset.showWikiLinks,          blockLabel: t.toggles.showWikiLinks.label,          statusText: t.statusWikiLinks(m.wikiLinks),             value: String(m.wikiLinks) },
      { key: "citekeys",           show: preset.showCitekeys,           blockLabel: t.toggles.showCitekeys.label,           statusText: t.statusCitekeys(m.citekeys),               value: String(m.citekeys) },
      { key: "embeds",             show: preset.showEmbeds,             blockLabel: t.toggles.showEmbeds.label,             statusText: t.statusEmbeds(m.embeds),                   value: String(m.embeds) },
      { key: "tables",             show: preset.showTables,             blockLabel: t.toggles.showTables.label,             statusText: t.statusTables(m.tables),                   value: String(m.tables) },
      { key: "tags",               show: preset.showTags,               blockLabel: t.toggles.showTags.label,               statusText: t.statusTags(m.tags),                       value: String(m.tags) },
    ];
    return defs
      .filter((d) => d.show)
      .map((d) => ({ key: d.key, blockLabel: d.blockLabel, statusText: d.statusText, value: d.value, level: this.warnLevel(preset, m, d.key) }));
  }

  private computeMetrics(raw: string, preset: Preset): Metrics {
    const base = this.preprocessBase(raw, preset);
    const preprocessed = this.preprocessText(raw, preset);
    const wordsWithSpaces = this.countWordsWithSpaces(preprocessed);

    return {
      wordsWithSpaces,
      charsWithSpaces: this.countCharsWithSpaces(base),
      charsWithoutSpaces: this.countCharsWithoutSpaces(base),
      pages: (wordsWithSpaces / preset.wordsPerPage).toFixed(1),
      lines: this.countLines(raw),
      paragraphs: this.countParagraphs(raw),
      markdownLinks: this.countMarkdownLinks(raw),
      wikiLinks: this.countWikiLinks(raw),
      citekeys: this.countCitekeys(raw),
      embeds: this.countEmbeds(raw),
      tables: this.countTables(raw),
      tags: this.countTags(raw),
    };
  }

  updateCount() {
    const preset = this.getActivePreset();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (preset && view) {
      const selection = view.editor.getSelection();
      const raw = selection.length > 0 ? selection : view.getViewData();
      this.lastMetrics = this.computeMetrics(raw, preset);
    } else if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
      // No notes open at all — clear. If a note is still open but focus moved to
      // another pane (e.g. our own right pane), keep the last computed metrics.
      this.lastMetrics = null;
    }

    this.renderStatusBar(preset, this.lastMetrics);
    this.renderRightPane();
  }

  private renderStatusBar(preset: Preset | undefined, metrics: Metrics | null) {
    const showStatusBar = this.settings.displayMethod !== "rightPane";
    this.statusBarItem.toggle(showStatusBar);
    if (!showStatusBar) return;

    this.statusBarItem.empty();
    if (!preset || !metrics) return;

    const rows = this.metricRows(preset, metrics);
    if (rows.length === 0) {
      this.statusBarItem.setText(t.statusNoMetrics);
    } else {
      rows.forEach((row, i) => {
        if (i > 0) this.statusBarItem.createSpan({ text: this.settings.separator, cls: "wcp-separator" });
        const span = this.statusBarItem.createSpan({ text: row.statusText });
        const level = this.surfaceWarnLevel("statusBar", row.level);
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
    // Migrate presets saved before per-metric limits existed
    for (const p of this.settings.presets) {
      if (!p.limits) p.limits = {};
      if (!p.stashedLimits) p.stashedLimits = {};
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ── Right pane metrics view ────────────────────────────────────────────────────

class MetricsView extends ItemView {
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
    const rows = preset && metrics ? this.plugin.metricRows(preset, metrics) : [];
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
        this.setLevel(ref.block, this.plugin.surfaceWarnLevel("rightPane", row.level));
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
      this.setLevel(block, this.plugin.surfaceWarnLevel("rightPane", row.level));
      const value = block.createEl("div", { cls: "wcp-metric-value" });
      this.renderValue(value, row.value, "", false);
      block.createEl("div", { text: row.blockLabel, cls: "wcp-metric-label" });
      this.blockRefs.set(row.key, { block, value, text: row.value });
    }
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class WordCountSettingTab extends PluginSettingTab {
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

    // Filled in below; toggling a metric must refresh the limit-warnings dropdown
    // so newly enabled metrics become available there.
    let limitsContainer: HTMLElement | null = null;
    const refreshLimits = () => { if (limitsContainer) this.renderLimits(limitsContainer, preset); };

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
        const metricKey = METRIC_ORDER.find((mk) => METRIC_SHOW_KEY[mk] === key);
        if (metricKey) syncMetricLimit(preset, metricKey);
        refreshLimits();
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

    // ── Limit warnings ────────────────────────────────────────────────────────
    limitsContainer = card.createDiv();
    this.renderLimits(limitsContainer, preset);
  }

  renderLimits(container: HTMLElement, preset: Preset) {
    container.empty();
    this.sectionHeader(container, t.limitsTitle);
    container.createEl("p", { text: t.limitsDesc, cls: "wcp-section-note" });

    // Dropdown to add a limit for an enabled metric that doesn't have one yet
    const enabledKeys = METRIC_ORDER.filter((k) => preset[METRIC_SHOW_KEY[k]]);
    const available = enabledKeys.filter((k) => preset.limits[k] === undefined);

    const addRow = container.createDiv({ cls: "wcp-limit-add" });
    const select = addRow.createEl("select", { cls: "dropdown" });
    select.createEl("option", { text: t.limitSelectMetric, value: "" });
    for (const k of available) {
      select.createEl("option", { text: t.toggles[METRIC_SHOW_KEY[k] as keyof typeof t.toggles].label, value: k });
    }
    select.value = "";
    select.addEventListener("change", handle(async () => {
      const k = select.value as MetricKey;
      if (!k) return;
      preset.limits[k] = 0;
      await this.save();
      this.display();
    }));

    // Existing limit rows
    for (const key of METRIC_ORDER) {
      const limit = preset.limits[key];
      if (limit === undefined) continue;
      const label = t.toggles[METRIC_SHOW_KEY[key] as keyof typeof t.toggles].label;
      new Setting(container)
        .setClass("wcp-limit-item")
        .setName(t.limitLabel(label))
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.setValue(String(limit));
          text.onChange(async (v) => {
            const n = Number(v);
            preset.limits[key] = isFinite(n) && n >= 0 ? n : 0;
            await this.save();
          });
        })
        .addExtraButton((btn) =>
          btn.setIcon("trash-2").setTooltip(t.btnRemoveLimit).onClick(async () => {
            delete preset.limits[key];
            await this.save();
            this.display();
          })
        );
    }
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

class DeleteConfirmModal extends Modal {
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
