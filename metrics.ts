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

  // Reading time: words-per-minute used to estimate the reading-time metric
  readingWpm: number;

  // Metric visibility
  showWordsWithSpaces: boolean;    // space-separated word count
  showCharsWithSpaces: boolean;    // total characters including spaces and linebreaks
  showCharsWithoutSpaces: boolean; // total characters excluding all whitespace
  showPages: boolean;
  showReadingTime: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
  showCitekeys: boolean;
  showEmbeds: boolean;
  showTables: boolean;
  showTags: boolean;
  showFootnotes: boolean;

  // Word count inclusions / exclusions (shared by both word and char metrics)
  countMdLinksAsWords: boolean;
  countWikiLinkDisplayText: boolean;
  ignoreWikiLinks: boolean;
  countCitekeysAsWords: boolean;
  ignoreComments: boolean;
  ignoreCode: boolean;
  ignoreHtmlTags: boolean;

  // Warning/goal rules. A metric may have at most one warning and one goal. A
  // warning colors its metric orange at ≥90% and red at ≥100% of the threshold;
  // a goal colors it green at ≥100% (and a warning can't be set below its paired
  // goal). A rule only has a visible effect while its metric is enabled
  // (metricRows skips disabled metrics).
  rules: LimitRule[];

  // User-defined display order of metrics (reordered by drag-and-drop in the
  // right pane). Unknown or newly-added keys are reconciled by
  // effectiveMetricOrder(), so a partial or stale list is safe.
  metricOrder: MetricKey[];
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
  readingTime: string;
  lines: number;
  paragraphs: number;
  markdownLinks: number;
  wikiLinks: number;
  citekeys: number;
  embeds: number;
  tables: number;
  tags: number;
  footnotes: number;
}

// Metric identifiers match the field names in Metrics
export type MetricKey = keyof Metrics;
export type WarnLevel = "none" | "orange" | "red" | "green";

export type LimitKind = "warning" | "goal";

export interface LimitRule {
  // "" while the rule has just been created and no metric is chosen yet.
  metric: MetricKey | "";
  threshold: number;
  kind: LimitKind;
}

export interface MetricRow {
  key: MetricKey;
  blockLabel: string;
  statusText: string;
  value: string;
  // Small unit shown after the value in the right pane (e.g. "MIN."); omitted for
  // metrics that need no unit.
  unit?: string;
  level: WarnLevel;
}

// Display order and the preset "show" flag that gates each metric
export const METRIC_ORDER: MetricKey[] = [
  "wordsWithSpaces", "charsWithSpaces", "charsWithoutSpaces", "pages", "readingTime",
  "lines", "paragraphs", "markdownLinks", "wikiLinks", "citekeys",
  "embeds", "tables", "tags", "footnotes",
];
export const METRIC_SHOW_KEY: Record<MetricKey, keyof Preset> = {
  wordsWithSpaces: "showWordsWithSpaces",
  charsWithSpaces: "showCharsWithSpaces",
  charsWithoutSpaces: "showCharsWithoutSpaces",
  pages: "showPages",
  readingTime: "showReadingTime",
  lines: "showLines",
  paragraphs: "showParagraphs",
  markdownLinks: "showMarkdownLinks",
  wikiLinks: "showWikiLinks",
  citekeys: "showCitekeys",
  embeds: "showEmbeds",
  tables: "showTables",
  tags: "showTags",
  footnotes: "showFootnotes",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultPreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: crypto.randomUUID(),
    name: t.defaultPresetName,
    wordsPerPage: 250,
    readingWpm: 250,
    showWordsWithSpaces: true,
    showCharsWithSpaces: false,
    showCharsWithoutSpaces: false,
    showPages: true,
    showReadingTime: false,
    showLines: false,
    showParagraphs: false,
    showMarkdownLinks: false,
    showWikiLinks: false,
    showCitekeys: false,
    showEmbeds: false,
    showTables: false,
    showTags: false,
    showFootnotes: false,
    countMdLinksAsWords: false,
    countWikiLinkDisplayText: false,
    ignoreWikiLinks: false,
    countCitekeysAsWords: false,
    ignoreComments: true,
    ignoreCode: true,
    ignoreHtmlTags: false,
    rules: [],
    metricOrder: [...METRIC_ORDER],
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

  // Code — fenced blocks and inline spans
  if (preset.ignoreCode) {
    s = s.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  }

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

  // Citekeys — a citation bracket may wrap a prefix/locator around its @keys,
  // e.g. [see @smith2020, p. 33; also @jones2019]. Markdown links and wikilinks
  // were already resolved above, so a remaining bracket containing an @ is a
  // citation. The prefix/locator prose is always counted as words; the @key
  // tokens are dropped ("Ignore citekeys") or kept.
  const citation = /\[([^\]]*@[^\]]*)\]/g;
  if (preset.countCitekeysAsWords) {
    // Drop each @key along with an adjacent separator / "-" marker, leaving the
    // surrounding prefix and locator text to be counted.
    s = s.replace(citation, (_: string, inner: string) => inner.replace(/[-;,]?\s*@[^\s;,\]]+/g, ""));
  } else {
    s = s.replace(citation, "$1");
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
    // Task checkbox markers must go first and as a whole: otherwise the bullet
    // strip below leaves "[ ]"/"[x]" behind, which split into phantom words and
    // make the count change when a box is checked. (Char counts handle this via
    // substituteListMarkers.)
    .replace(/^[ \t]*- \[[ xX]\] ?/gm, "")
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
  const u = countSpaces ? "\x01\x02"      : "\x01";        // unordered
  const n = countSpaces ? "\x01\x02\x03"  : "\x01\x02";   // numbered
  return base
    // A task checkbox ("- [ ] " or "- [x] ") is a structural marker, not typed
    // content, so it collapses to a single space: one character in
    // chars-with-spaces, and none in chars-without-spaces (the space is stripped).
    .replace(/^- \[[ xX]\] /gm, " ")  // checkbox → single space
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

/** Estimated reading time in minutes (one decimal) for a word count at a given speed. */
function computeReadingTime(words: number, wpm: number): string {
  return (wpm > 0 ? words / wpm : 0).toFixed(1);
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
  // Pandoc citations live in square brackets, may carry a prefix and/or locator,
  // and can bundle several keys, e.g. [see @smith2020, p. 33; also @jones2019]
  // or the suppressed-author form [-@smith2020]. Strip wikilinks and markdown
  // links first so their contents aren't mistaken for citations, then count
  // every @key inside any remaining bracket.
  const cleaned = text
    .replace(/!?\[\[[^\]]*\]\]/g, "")     // wikilinks / embeds
    .replace(/\[[^\]]*\]\([^)]*\)/g, ""); // markdown links
  const brackets = cleaned.match(/\[[^\]]{1,300}\]/g) ?? [];
  let count = 0;
  for (const b of brackets) {
    count += (b.match(/@[^\s;,\]]+/g) ?? []).length;
  }
  return count;
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

/**
 * Counts only complete footnotes. Inline footnotes (^[text]) are self-contained
 * and always complete. Reference/definition footnotes ([^label] in the text plus
 * a [^label]: definition line) count once per label only when both halves exist —
 * an orphan reference or an orphan definition is not counted.
 */
function countFootnotes(text: string): number {
  // Inline footnotes are always complete.
  const inline = (text.match(/\^\[[^\]]+\]/g) ?? []).length;

  // Definitions: [^label]: at the start of a line.
  const defined = new Set<string>();
  for (const m of text.matchAll(/^[ \t]*\[\^([^\]\s]+)\]:/gm)) defined.add(m[1]);

  // References: [^label] usages, excluding the bracket of a definition ([^label]:).
  const referenced = new Set<string>();
  for (const m of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
    if (text[m.index + m[0].length] === ":") continue;
    referenced.add(m[1]);
  }

  let complete = 0;
  for (const label of referenced) if (defined.has(label)) complete++;
  return inline + complete;
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
    readingTime: computeReadingTime(wordsWithSpaces, preset.readingWpm),
    lines: countLines(raw),
    paragraphs: countParagraphs(raw),
    markdownLinks: countMarkdownLinks(raw),
    wikiLinks: countWikiLinks(raw),
    citekeys: countCitekeys(raw),
    embeds: countEmbeds(raw),
    tables: countTables(raw),
    tags: countTags(raw),
    footnotes: countFootnotes(raw),
  };
}

// ── Metric ordering ─────────────────────────────────────────────────────────

/**
 * The preset's metric display order, reconciled against the known metrics:
 * unknown keys are dropped, duplicates removed, and any metric missing from the
 * stored list (e.g. one added in a later version) is appended in METRIC_ORDER
 * sequence. Always returns every metric exactly once.
 */
export function effectiveMetricOrder(preset: Preset): MetricKey[] {
  const known = new Set<MetricKey>(METRIC_ORDER);
  const seen = new Set<MetricKey>();
  const order: MetricKey[] = [];
  for (const k of preset.metricOrder ?? []) {
    if (known.has(k) && !seen.has(k)) { order.push(k); seen.add(k); }
  }
  for (const k of METRIC_ORDER) if (!seen.has(k)) order.push(k);
  return order;
}

/** Move `dragged` to just before/after `target`, returning a new ordering. */
export function reorderMetrics(
  order: MetricKey[], dragged: MetricKey, target: MetricKey, place: "before" | "after"
): MetricKey[] {
  if (dragged === target) return order.slice();
  const next = order.filter((k) => k !== dragged);
  const ti = next.indexOf(target);
  if (ti === -1) return order.slice();
  next.splice(place === "before" ? ti : ti + 1, 0, dragged);
  return next;
}

// ── Metric rows & warnings ──────────────────────────────────────────────────

/** Adjust a metric's warning level for a given surface, honoring the limit-warnings display method. */
export function surfaceWarnLevel(method: DisplayMethod, surface: "statusBar" | "rightPane", level: WarnLevel): WarnLevel {
  if (level === "none") return "none";
  const show = surface === "statusBar" ? method !== "rightPane" : method !== "statusBar";
  return show ? level : "none";
}

/**
 * Warning level for a metric, combining its (optional) warning and goal rules.
 * Warning: 90% → orange, 100%+ → red. Goal: 100%+ → green. A metric may have one
 * of each; since a warning can't be below its goal, the warning zone (orange/red
 * as you approach/exceed the cap) takes precedence over the goal's green.
 */
function warnLevel(preset: Preset, m: Metrics, key: MetricKey): WarnLevel {
  const raw = m[key];
  const value = typeof raw === "number" ? raw : parseFloat(raw);

  const warning = preset.rules.find((r) => r.metric === key && r.kind === "warning");
  if (warning && warning.threshold > 0) {
    const ratio = value / warning.threshold;
    if (ratio >= 1) return "red";
    if (ratio >= 0.9) return "orange";
  }

  const goal = preset.rules.find((r) => r.metric === key && r.kind === "goal");
  if (goal && goal.threshold > 0 && value / goal.threshold >= 1) return "green";

  return "none";
}

/** Enabled metrics in display order, with status-bar text, block label/value and warning level. */
export function metricRows(preset: Preset, m: Metrics): MetricRow[] {
  const defs: { key: MetricKey; show: boolean; blockLabel: string; statusText: string; value: string; unit?: string }[] = [
    { key: "wordsWithSpaces",    show: preset.showWordsWithSpaces,    blockLabel: t.toggles.showWordsWithSpaces.label,    statusText: t.statusWords(m.wordsWithSpaces),           value: String(m.wordsWithSpaces) },
    { key: "charsWithSpaces",    show: preset.showCharsWithSpaces,    blockLabel: t.toggles.showCharsWithSpaces.label,    statusText: t.statusChars(m.charsWithSpaces),           value: String(m.charsWithSpaces) },
    { key: "charsWithoutSpaces", show: preset.showCharsWithoutSpaces, blockLabel: t.toggles.showCharsWithoutSpaces.label, statusText: t.statusCharsNoSpaces(m.charsWithoutSpaces), value: String(m.charsWithoutSpaces) },
    { key: "pages",              show: preset.showPages && preset.wordsPerPage > 0, blockLabel: t.toggles.showPages.label,        statusText: t.statusPages(m.pages),                     value: m.pages },
    { key: "readingTime",        show: preset.showReadingTime,        blockLabel: t.toggles.showReadingTime.label,        statusText: t.statusReadingTime(m.readingTime),         value: m.readingTime, unit: t.readingTimeUnit },
    { key: "lines",              show: preset.showLines,              blockLabel: t.toggles.showLines.label,              statusText: t.statusLines(m.lines),                     value: String(m.lines) },
    { key: "paragraphs",         show: preset.showParagraphs,         blockLabel: t.toggles.showParagraphs.label,         statusText: t.statusParas(m.paragraphs),                value: String(m.paragraphs) },
    { key: "markdownLinks",      show: preset.showMarkdownLinks,      blockLabel: t.toggles.showMarkdownLinks.label,      statusText: t.statusMdLinks(m.markdownLinks),           value: String(m.markdownLinks) },
    { key: "wikiLinks",          show: preset.showWikiLinks,          blockLabel: t.toggles.showWikiLinks.label,          statusText: t.statusWikiLinks(m.wikiLinks),             value: String(m.wikiLinks) },
    { key: "citekeys",           show: preset.showCitekeys,           blockLabel: t.toggles.showCitekeys.label,           statusText: t.statusCitekeys(m.citekeys),               value: String(m.citekeys) },
    { key: "embeds",             show: preset.showEmbeds,             blockLabel: t.toggles.showEmbeds.label,             statusText: t.statusEmbeds(m.embeds),                   value: String(m.embeds) },
    { key: "tables",             show: preset.showTables,             blockLabel: t.toggles.showTables.label,             statusText: t.statusTables(m.tables),                   value: String(m.tables) },
    { key: "tags",               show: preset.showTags,               blockLabel: t.toggles.showTags.label,               statusText: t.statusTags(m.tags),                       value: String(m.tags) },
    { key: "footnotes",          show: preset.showFootnotes,          blockLabel: t.toggles.showFootnotes.label,          statusText: t.statusFootnotes(m.footnotes),             value: String(m.footnotes) },
  ];
  const order = effectiveMetricOrder(preset);
  return defs
    .filter((d) => d.show)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((d) => ({ key: d.key, blockLabel: d.blockLabel, statusText: d.statusText, value: d.value, unit: d.unit, level: warnLevel(preset, m, d.key) }));
}
