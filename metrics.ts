import { App, EventRef, Workspace } from "obsidian";
import { t } from "./locales";

export const VIEW_TYPE_METRICS = "advanced-word-count-view";

export type DisplayMethod = "statusBar" | "rightPane" | "both";

export type RightPaneLayout = "one" | "two";

// ── Types ─────────────────────────────────────────────────────────────────────

// Undocumented Obsidian internals not present in the public type definitions
export interface ObsidianCommands {
  removeCommand(id: string): void;
  commands: Record<string, { name: string }>;
}
export interface InternalPlugin {
  enabled: boolean;
  enable?: (save?: boolean) => Promise<void> | void;
  disable?: (save?: boolean) => Promise<void> | void;
}
// Method names for toggling core plugins have differed across Obsidian
// versions, so every entry point is treated as optional and probed at runtime.
export interface InternalPlugins {
  getPluginById(id: string): InternalPlugin | null;
  enablePluginAndSave?(id: string): Promise<void>;
  disablePluginAndSave?(id: string): Promise<void>;
  enablePlugin?(id: string): Promise<void>;
  disablePlugin?(id: string): Promise<void>;
  on(name: "change", callback: () => void): EventRef;
}
export interface AppInternal extends App {
  commands: ObsidianCommands;
  internalPlugins: InternalPlugins;
}
export type WorkspaceInternal = Workspace & {
  on(name: string, callback: (...args: unknown[]) => void): EventRef;
};

export interface Preset {
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

export interface WordCountSettings {
  activePresetId: string;
  presets: Preset[];
  separator: string;
  hideDefaultWordCount: boolean;
  displayMethod: DisplayMethod;
  rightPaneLayout: RightPaneLayout;
  limitWarningsDisplayMethod: DisplayMethod;
}

export interface Metrics {
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
export type MetricKey = keyof Metrics;
export type WarnLevel = "none" | "orange" | "red";

export interface MetricRow {
  key: MetricKey;
  blockLabel: string;
  statusText: string;
  value: string;
  level: WarnLevel;
}

// Display order and the preset "show" flag that gates each metric
export const METRIC_ORDER: MetricKey[] = [
  "wordsWithSpaces", "charsWithSpaces", "charsWithoutSpaces", "pages",
  "lines", "paragraphs", "markdownLinks", "wikiLinks", "citekeys",
  "embeds", "tables", "tags",
];
export const METRIC_SHOW_KEY: Record<MetricKey, keyof Preset> = {
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

export function defaultPreset(overrides: Partial<Preset> = {}): Preset {
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

export const DEFAULT_SETTINGS: WordCountSettings = {
  activePresetId: "",
  presets: [],
  separator: "  |  ",
  hideDefaultWordCount: false,
  displayMethod: "statusBar",
  rightPaneLayout: "two",
  limitWarningsDisplayMethod: "both",
};

// When a metric is toggled, move its limit warning between the active `limits`
// and the per-preset `stashedLimits` store so disabling/re-enabling a metric
// hides/restores its warning without losing the configured threshold.
export function syncMetricLimit(preset: Preset, key: MetricKey) {
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

// ── Text pre-processing ───────────────────────────────────────────────────────

function preprocessBase(raw: string, preset: Preset): string {
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

function preprocessText(raw: string, preset: Preset): string {
  // Build the base (no list markers yet), then strip them for word counting.
  let s = preprocessBase(raw, preset);

  s = s
    .replace(/[-*+]\s/g, "")
    .replace(/\d+\.\s/g, "");

  return s;
}

// ── Counters ──────────────────────────────────────────────────────────────────

/** Traditional word count: space-separated tokens after preprocessing. */
function countWordsWithSpaces(preprocessed: string): number {
  const trimmed = preprocessed.trim();
  // split(/\s+/) on a non-empty trimmed string never produces empty tokens
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function substituteListMarkers(base: string, countSpaces: boolean): string {
  const u = countSpaces ? "\x01\x02"      : "\x01";        // unordered / checkbox
  const n = countSpaces ? "\x01\x02\x03"  : "\x01\x02";   // numbered
  return base
    .replace(/^- \[[ x]\] /gm, u)   // checkbox
    .replace(/^[*\-+] /gm,     u)   // unordered
    .replace(/^\d+\. /gm,      n)   // numbered (dot)
    .replace(/^\d+\) /gm,      n);  // numbered (paren)
}

/** Character count including spaces and linebreaks, after preprocessing. */
function countCharsWithSpaces(base: string): number {
  return substituteListMarkers(base, true).length;
}

/** Character count excluding all whitespace, after preprocessing. */
function countCharsWithoutSpaces(base: string): number {
  return substituteListMarkers(base, false).replace(/\s/g, "").length;
}

function countLines(text: string): number {
  return text ? text.split("\n").length : 0;
}

function countParagraphs(text: string): number {
  if (!text) return 0;
  return text
    .replace(/^---[\s\S]*?---\n?/, "")
    .split(/\n{2,}/)
    .filter((b) => b.trim().length > 0).length;
}

function countMarkdownLinks(text: string): number {
  // Capture any leading "!" so image embeds (![alt](url)) can be filtered out —
  // without it the match starts at "[" and the filter below never sees the "!".
  const standard = (text.match(/!?\[[^\]]{0,500}\]\([^)]{0,2000}\)/g) ?? []).filter((m) => !m.startsWith("!"));
  return standard.length + (text.match(/\([^)]{0,500}\)\[[^\]]{0,500}\]/g) ?? []).length;
}

function countWikiLinks(text: string): number {
  // Exclude embeds (![[...]]) — those are counted separately.
  return (text.match(/(?<!!)\[\[[^\]]{0,500}\]\]/g) ?? []).length;
}

function countCitekeys(text: string): number {
  return (text.match(/\[@[^\]]{1,100}\]/g) ?? []).length;
}

function countEmbeds(text: string): number {
  return (text.match(/!\[\[[^\]]{0,500}\]\]/g) ?? []).length;
}

/** Counts complete Markdown tables (a header row followed by a delimiter row). */
function countTables(text: string): number {
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
function countTags(text: string): number {
  const matches = text.match(/(?<![\p{L}\p{N}_#])#[\p{L}\p{N}_/-]+/gu) ?? [];
  return matches.filter((m) => /[^\p{N}]/u.test(m.slice(1))).length;
}

export function computeMetrics(raw: string, preset: Preset): Metrics {
  const base = preprocessBase(raw, preset);
  const preprocessed = preprocessText(raw, preset);
  const wordsWithSpaces = countWordsWithSpaces(preprocessed);

  return {
    wordsWithSpaces,
    charsWithSpaces: countCharsWithSpaces(base),
    charsWithoutSpaces: countCharsWithoutSpaces(base),
    pages: (wordsWithSpaces / preset.wordsPerPage).toFixed(1),
    lines: countLines(raw),
    paragraphs: countParagraphs(raw),
    markdownLinks: countMarkdownLinks(raw),
    wikiLinks: countWikiLinks(raw),
    citekeys: countCitekeys(raw),
    embeds: countEmbeds(raw),
    tables: countTables(raw),
    tags: countTags(raw),
  };
}

// ── Metric rows & warnings ──────────────────────────────────────────────────

/** Adjust a metric's warning level for a given surface, honoring the limit-warnings display method. */
export function surfaceWarnLevel(method: DisplayMethod, surface: "statusBar" | "rightPane", level: WarnLevel): WarnLevel {
  if (level === "none") return "none";
  const show = surface === "statusBar" ? method !== "rightPane" : method !== "statusBar";
  return show ? level : "none";
}

/** Warning level for a metric given its limit (90% → orange, 100%+ → red). */
function warnLevel(preset: Preset, m: Metrics, key: MetricKey): WarnLevel {
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
export function metricRows(preset: Preset, m: Metrics): MetricRow[] {
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
    .map((d) => ({ key: d.key, blockLabel: d.blockLabel, statusText: d.statusText, value: d.value, level: warnLevel(preset, m, d.key) }));
}
