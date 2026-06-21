import type { Preset, WarnLevel } from "./metrics";
import { METRIC_ORDER, defaultPreset, ruleLevel } from "./metrics";

// Built-in metric ids (e.g. "wordsWithSpaces", "pages"). They're always computed,
// so they're valid ratio operands but must never appear in `dependencies` — there
// is nothing to install. Used to reject that mistake with a clear message.
const BUILTIN_METRIC_IDS: string[] = METRIC_ORDER;

// ── Community extensions ────────────────────────────────────────────────────────
//
// An extension is a small, *declarative* JSON document that adds either a new
// metric or a new advanced (word-count) setting to a preset. It carries no
// executable code — a metric is a regex + a count mode, a setting is a regex
// find/replace applied while text is preprocessed. This keeps extensions safe to
// download, store and review (no remote-code execution), and serializable so they
// can live in the plugin's data.json.
//
// The repo's /extensions folder holds an index.json plus one JSON file per
// extension; ExtensionManager downloads them and feeds the validated definitions
// into the ExtensionRegistry below, which the counting pipeline (metrics.ts)
// consults at runtime.

// ── Definition types ────────────────────────────────────────────────────────────

export type ExtensionType = "metric" | "setting" | "preset";

/**
 * How a metric's number is derived. Each mode mirrors a generic operation used by
 * the plugin's own built-in counters:
 *  - matches        number of matches                 (wikilinks, tables…)
 *  - captureSum     sum of capture group 1 as a number
 *  - captureUnique  number of *distinct* captured values (distinct tags/citekeys)
 *  - matchedLength  total character length of all matches (character counts)
 *  - split          number of non-empty segments after splitting on a separator
 *                   (words, lines, paragraphs)
 *  - intersect      number of keys (capture group 1) present in BOTH patterns,
 *                   plus any `extra` plain matches (footnotes)
 *  - ratio          a value derived from OTHER metrics: numerator / denominator
 *                   (pages = words / words-per-page, reading time = words / wpm)
 */
export type CountMode =
  | "matches"
  | "captureSum"
  | "captureUnique"
  | "matchedLength"
  | "split"
  | "intersect"
  | "ratio";

/**
 * A `ratio` operand: either a constant number, or the id of another metric whose
 * value is read (a built-in MetricKey like "wordsWithSpaces", or another
 * non-ratio extension metric id). A missing/disabled metric resolves to 0.
 */
export type RatioOperand = string | number;

/** Which text a metric counts over. */
export type CountSource = "raw" | "preprocessed";

/** Where in preprocessing a setting's transform runs. */
export type TransformStage = "pre" | "post";

/** A regex pattern with optional flags — used for the sub-patterns of compound modes. */
export interface SubPattern {
  pattern: string;
  flags?: string;
}

/** The user-facing text fields an extension can translate. */
export interface LocalizedFields {
  name?: string;
  description?: string;
  title?: string;
  label?: string;
  hint?: string;
  statusLabel?: string;
  unit?: string;
}

/**
 * Per-locale overrides of the display fields, keyed by BCP-47 tag (e.g. "ru",
 * "zh-tw"). Any field omitted falls back to the base (English) value. The logic
 * fields (id, count, transform, …) are never localized.
 */
export type I18n = Record<string, LocalizedFields>;

export interface ExtensionManifestBase {
  id: string;            // unique, kebab-case (matches /^[a-z0-9][a-z0-9-]*$/)
  name: string;          // display name (shown in the browse modal)
  description: string;
  author: string;
  // Short title shown in the preset's connect toggle. Required (no fallback) for
  // metric/setting extensions; not used by preset extensions, hence optional here.
  title?: string;
  // ISO date (YYYY-MM-DD) of the last change. A catalogue entry with a newer
  // `updated` than the installed copy surfaces an available update.
  updated?: string;
  // Per-locale translations of the display fields (base values are the default).
  i18n?: I18n;
  // Ids of other extensions this one needs installed (e.g. a ratio metric that
  // reads another metric's value). Installing this extension pulls them in too.
  dependencies?: string[];
  minPluginVersion?: string;
}

export interface CountSpec {
  mode?: CountMode;      // default "matches"
  source?: CountSource;  // default "raw"

  // Regions deleted from the text before counting, in order. Applies to every
  // mode. Mirrors the citekey counter pre-cleaning wikilinks/links so their
  // contents aren't miscounted.
  strip?: SubPattern[];

  // ── matches | captureSum | captureUnique | matchedLength ─────────────────────
  pattern?: string;      // regex source (compiled global)
  flags?: string;        // safe subset of regex flags: g i m s u
  // Drop matches whose matched text also matches this (e.g. exclude image links
  // with "^!", or numeric-only tags). Mirrors the built-in match filters.
  exclude?: string;
  excludeFlags?: string;

  // ── split ────────────────────────────────────────────────────────────────────
  separator?: string;    // regex to split on; non-empty segments are counted
  separatorFlags?: string;

  // ── intersect ────────────────────────────────────────────────────────────────
  primary?: SubPattern;   // capture group 1 is the key (e.g. footnote references)
  secondary?: SubPattern; // capture group 1 is the key (e.g. footnote definitions)
  extra?: SubPattern;     // plain matches added to the intersection (e.g. inline footnotes)

  // ── ratio ────────────────────────────────────────────────────────────────────
  numerator?: RatioOperand;   // metric id or constant
  denominator?: RatioOperand; // metric id or constant (0 → result is 0)
  decimals?: number;          // rounding, 0–6; default 1
}

export interface MetricExtension extends ExtensionManifestBase {
  type: "metric";
  title: string;         // required for metric extensions (toggle text)
  label: string;         // toggle / block label, e.g. "Sentences"
  hint?: string;         // optional tooltip
  statusLabel?: string;  // status-bar label prefix; defaults to `label`
  unit?: string;         // small unit shown after the value (e.g. "MIN.")
  defaultEnabled?: boolean;
  count: CountSpec;
}

export interface TransformSpec {
  pattern: string;       // regex source
  flags?: string;        // safe subset of regex flags: g i m s u
  replacement: string;   // replacement string ($1, $2, … allowed)
  stage?: TransformStage; // default "pre"
}

export interface SettingExtension extends ExtensionManifestBase {
  type: "setting";
  title: string;         // required for setting extensions (toggle text)
  label: string;
  hint?: string;
  defaultEnabled?: boolean;
  transform: TransformSpec;
}

/**
 * A shareable preset: a full preset configuration (toggles, advanced settings,
 * warning/goal rules, and the per-preset extension enable-flags) plus the ids of
 * every community extension it uses (`dependencies`). Installing one downloads
 * those extensions and adds the preset to the user's preset list — it is NOT a
 * live registry item like a metric/setting. `preset` is kept loosely typed so this
 * schema doesn't couple to the exact Preset shape; the manager merges it over
 * `defaultPreset()` and always assigns a fresh id on install.
 */
export interface PresetExtension extends ExtensionManifestBase {
  type: "preset";
  preset: Record<string, unknown>;
}

export type Extension = MetricExtension | SettingExtension | PresetExtension;

// ── Repo index ──────────────────────────────────────────────────────────────────

/** One row of the repo's extensions/index.json catalogue. */
export interface ExtensionIndexEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  // ISO date of the last change; compared with the installed copy to detect updates.
  updated?: string;
  // Per-locale translations of `name`/`description` for the browse modal.
  i18n?: I18n;
  type: ExtensionType;
  // Ids of other extensions this one requires (mirrors the manifest's
  // `dependencies`); lets the installer resolve the whole tree from the index.
  dependencies?: string[];
  // Path to the extension's JSON, relative to the index. Defaults to `${id}.json`.
  path?: string;
}

export interface ExtensionIndex {
  extensions: ExtensionIndexEntry[];
}

/**
 * Topologically order an install: every (transitive) dependency of `id` first,
 * then `id` itself — so dependencies are always installed before the extensions
 * that rely on them. Dependencies already satisfied by `isInstalled` are pruned
 * (along with their subtree), but the target `id` is always included so it can be
 * (re)installed/updated. Dependency ids absent from `index` are collected in
 * `missing` rather than ordered. Throws on a dependency cycle.
 */
export function resolveInstallOrder(
  id: string,
  index: ExtensionIndexEntry[],
  isInstalled: (id: string) => boolean,
): { order: ExtensionIndexEntry[]; missing: string[] } {
  const byId = new Map(index.map((e) => [e.id, e]));
  const order: ExtensionIndexEntry[] = [];
  const missing: string[] = [];
  const done = new Set<string>();    // fully processed (already pushed)
  const path = new Set<string>();    // current DFS path, for cycle detection

  const visit = (cur: string, isTarget: boolean) => {
    if (done.has(cur)) return;
    // Prune already-installed dependencies; the target is always (re)installed.
    if (!isTarget && isInstalled(cur)) return;
    const entry = byId.get(cur);
    if (!entry) {
      if (missing.indexOf(cur) === -1) missing.push(cur);
      return;
    }
    if (path.has(cur)) throw new Error(`dependency cycle through "${cur}"`);
    path.add(cur);
    for (const dep of entry.dependencies || []) visit(dep, false);
    path.delete(cur);
    done.add(cur);
    order.push(entry);
  };

  visit(id, true);
  return { order, missing };
}

/** Installed extensions that list `id` among their dependencies (its dependents). */
export function findDependents(id: string, exts: Extension[]): Extension[] {
  return exts.filter((e) => (e.dependencies || []).indexOf(id) !== -1);
}

// ── Preset extensions (shareable presets) ─────────────────────────────────────────

/**
 * Turn a `PresetExtension`'s payload into a live `Preset`: merge it over the
 * defaults (so every field exists), keep the author's choices, but always assign a
 * fresh id and fall back to the extension's name when the payload omits one.
 */
export function materializePreset(ext: PresetExtension): Preset {
  const base = defaultPreset();
  const payload = ext.preset || {};
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : ext.name;
  return { ...base, ...payload, id: base.id, name };
}

/**
 * The community-extension ids a preset depends on: every *installed* extension it
 * enables (via `extMetrics`/`extSettings`) or references in a warning/goal rule.
 * `isExtension` distinguishes extension ids from built-in metric ids. Used when
 * exporting a preset so the installer knows what to download.
 */
export function presetDependencyIds(preset: Preset, isExtension: (id: string) => boolean): string[] {
  const deps = new Set<string>();
  const addEnabled = (flags: Record<string, boolean> | undefined) => {
    for (const id of Object.keys(flags || {})) if (flags![id] && isExtension(id)) deps.add(id);
  };
  addEnabled(preset.extMetrics);
  addEnabled(preset.extSettings);
  for (const r of preset.rules || []) if (isExtension(r.metric)) deps.add(r.metric);
  return Array.from(deps).sort();
}

/**
 * Build a shareable `PresetExtension` from a live preset — a catalogue-ready file.
 * The runtime `id` is dropped from the payload (a fresh one is generated on
 * install), the manifest `id` is slugified from the name, and `dependencies` lists
 * the extensions the preset uses. `author`/`description` are left blank for the
 * contributor to fill in before opening a pull request.
 */
export function presetExtensionFrom(preset: Preset, dependencies: string[], updated: string): PresetExtension {
  const slug = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const id = /^[a-z0-9]/.test(slug) ? slug : "preset";
  const payload: Record<string, unknown> = { ...preset };
  delete payload.id;
  const ext: PresetExtension = {
    id,
    name: preset.name,
    description: "",
    author: "",
    type: "preset",
    updated,
    preset: payload,
  };
  if (dependencies.length > 0) ext.dependencies = dependencies;
  return ext;
}

// ── A computed extension-metric row (parallel to metrics.ts MetricRow) ──────────

export interface ExtMetricRow {
  id: string;
  label: string;
  statusText: string;
  value: string;
  unit?: string;
  level: WarnLevel;
}

// ── Regex safety ────────────────────────────────────────────────────────────────

// Only these flags are accepted. "y" (sticky) and "d" (indices) are excluded
// because they interact badly with the global counting loop, and anything outside
// the set is rejected outright so a downloaded pattern can't smuggle in surprises.
const ALLOWED_FLAGS = ["g", "i", "m", "s", "u"];

/**
 * Compile a downloaded pattern, returning null if its flags aren't in the safe
 * subset or the source doesn't parse. `forceGlobal` adds the "g" flag (needed for
 * counting every match) without requiring authors to remember it.
 */
export function compileRegex(
  pattern: string,
  flags = "",
  opts: { forceGlobal?: boolean } = {}
): RegExp | null {
  for (const f of flags) {
    if (ALLOWED_FLAGS.indexOf(f) === -1) return null;
  }
  // De-duplicate flags (new RegExp rejects repeats like "gg").
  let f = "";
  for (const ch of flags) if (f.indexOf(ch) === -1) f += ch;
  if (opts.forceGlobal && f.indexOf("g") === -1) f += "g";
  try {
    return new RegExp(pattern, f);
  } catch {
    return null;
  }
}

/**
 * Every match of a global regex, as RegExpExecArray (so capture groups are
 * available). Guards against zero-width matches stalling the loop.
 */
function collectMatches(re: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * A display field's value for the given locale tags (most specific first),
 * falling back to the base value when no translation exists.
 */
export function localize(
  base: string | undefined, i18n: I18n | undefined, field: keyof LocalizedFields, tags: string[]
): string | undefined {
  if (i18n) {
    for (const tag of tags) {
      const v = i18n[tag] ? i18n[tag][field] : undefined;
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return base;
}

/** Resolve a ratio operand: a constant number, or a metric id read from `values`. */
function resolveOperand(op: RatioOperand | undefined, values: Record<string, number>): number {
  if (typeof op === "number") return op;
  if (typeof op === "string") {
    const v = values[op];
    return typeof v === "number" && !isNaN(v) ? v : 0;
  }
  return 0;
}

// ── Validation ──────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; ext: Extension }
  | { ok: false; error: string };

const fail = (error: string): ValidationResult => ({ ok: false, error });

// Render an untrusted value for an error message without risking "[object Object]".
const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));
// An optional string field is valid when absent or a string.
const optStr = (v: unknown): boolean => v === undefined || typeof v === "string";

const COUNT_MODES = ["matches", "captureSum", "captureUnique", "matchedLength", "split", "intersect", "ratio"];

/** Validate a ratio operand (constant number or metric-id string). Error or null. */
function checkOperand(label: string, v: unknown): string | null {
  if (typeof v === "number") return isFinite(v) ? null : `${label} must be a finite number`;
  if (typeof v === "string") return v.length > 0 ? null : `${label} must be a non-empty metric id`;
  return `${label} must be a metric id (string) or a number`;
}

/** Validate a pattern+flags pair. Returns an error message, or null when valid. */
function checkPattern(label: string, pattern: unknown, flags: unknown, forceGlobal: boolean): string | null {
  if (typeof pattern !== "string" || pattern.length === 0) return `${label} must be a non-empty string`;
  if (flags !== undefined && typeof flags !== "string") return `${label} flags must be a string`;
  if (compileRegex(pattern, typeof flags === "string" ? flags : "", { forceGlobal }) === null) {
    return `${label} is not a valid/safe regex`;
  }
  return null;
}

/** Validate a {pattern, flags?} sub-pattern object. Returns an error or null. */
function checkSub(obj: unknown, label: string): string | null {
  if (typeof obj !== "object" || obj === null) return `${label} must be an object with a "pattern"`;
  const o = obj as Record<string, unknown>;
  return checkPattern(`${label}.pattern`, o.pattern, o.flags, true);
}

/**
 * Validate untrusted JSON (downloaded or pasted) into an Extension. Every field is
 * checked and both regexes are compiled, so an installed extension is always
 * structurally sound and safe to run.
 */
export function validateExtension(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null) return fail("not a JSON object");
  const o = value as Record<string, unknown>;

  for (const k of ["id", "name", "description", "author", "type"]) {
    const v = o[k];
    if (typeof v !== "string" || v.length === 0) return fail(`missing or invalid "${k}"`);
  }
  // `label`/`title` are the toggle texts — required for metric/setting, unused by
  // preset extensions.
  if (o.type === "metric" || o.type === "setting") {
    for (const k of ["label", "title"]) {
      if (typeof o[k] !== "string" || o[k].length === 0) return fail(`missing or invalid "${k}"`);
    }
  }

  const id = o.id as string;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return fail(`invalid id "${id}" (use lowercase letters, digits and hyphens)`);
  }
  if (!optStr(o.updated)) return fail(`"updated" must be a string (ISO date)`);
  if (!optStr(o.minPluginVersion)) return fail(`"minPluginVersion" must be a string`);
  if (!optStr(o.hint)) return fail(`"hint" must be a string`);

  if (o.i18n !== undefined) {
    if (typeof o.i18n !== "object" || o.i18n === null || Array.isArray(o.i18n)) {
      return fail(`"i18n" must be an object keyed by locale tag`);
    }
    const i18n = o.i18n as Record<string, unknown>;
    for (const tag of Object.keys(i18n)) {
      const fields = i18n[tag];
      if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
        return fail(`i18n["${tag}"] must be an object of translated fields`);
      }
      const fo = fields as Record<string, unknown>;
      for (const k of Object.keys(fo)) {
        if (typeof fo[k] !== "string") return fail(`i18n["${tag}"].${k} must be a string`);
      }
    }
  }
  if (o.defaultEnabled !== undefined && typeof o.defaultEnabled !== "boolean") {
    return fail(`"defaultEnabled" must be a boolean`);
  }

  if (o.dependencies !== undefined) {
    if (!Array.isArray(o.dependencies)) return fail(`"dependencies" must be an array of extension ids`);
    for (const dep of o.dependencies) {
      if (typeof dep !== "string") return fail(`"dependencies" must contain extension ids as strings (got ${show(dep)})`);
      if (BUILTIN_METRIC_IDS.indexOf(dep) !== -1) {
        return fail(`"${dep}" is a built-in metric — use it directly as a ratio operand, not as a dependency`);
      }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(dep)) {
        return fail(`"dependencies" must contain valid extension ids (got ${show(dep)})`);
      }
      if (dep === id) return fail(`an extension cannot depend on itself ("${id}")`);
    }
  }

  if (o.type === "metric") {
    if (!optStr(o.statusLabel)) return fail(`"statusLabel" must be a string`);
    if (!optStr(o.unit)) return fail(`"unit" must be a string`);

    const c = o.count;
    if (typeof c !== "object" || c === null) return fail(`metric extension needs a "count" object`);
    const cs = c as Record<string, unknown>;

    const mode = cs.mode === undefined ? "matches" : cs.mode;
    if (typeof mode !== "string" || COUNT_MODES.indexOf(mode) === -1) {
      return fail(`invalid count.mode "${show(cs.mode)}"`);
    }
    if (cs.source !== undefined && cs.source !== "raw" && cs.source !== "preprocessed") {
      return fail(`invalid count.source "${show(cs.source)}"`);
    }

    // strip — optional in every mode.
    if (cs.strip !== undefined) {
      if (!Array.isArray(cs.strip)) return fail(`count.strip must be an array`);
      for (let i = 0; i < cs.strip.length; i++) {
        const e = checkSub(cs.strip[i], `count.strip[${i}]`);
        if (e) return fail(e);
      }
    }

    if (mode === "split") {
      const e = checkPattern("count.separator", cs.separator, cs.separatorFlags, false);
      if (e) return fail(e);
    } else if (mode === "intersect") {
      let e = checkSub(cs.primary, "count.primary");
      if (e) return fail(e);
      e = checkSub(cs.secondary, "count.secondary");
      if (e) return fail(e);
      if (cs.extra !== undefined) {
        e = checkSub(cs.extra, "count.extra");
        if (e) return fail(e);
      }
    } else if (mode === "ratio") {
      let e = checkOperand("count.numerator", cs.numerator);
      if (e) return fail(e);
      e = checkOperand("count.denominator", cs.denominator);
      if (e) return fail(e);
      if (cs.decimals !== undefined &&
          (typeof cs.decimals !== "number" || !Number.isInteger(cs.decimals) || cs.decimals < 0 || cs.decimals > 6)) {
        return fail(`count.decimals must be an integer between 0 and 6`);
      }
    } else {
      // Match-enumeration modes: matches | captureSum | captureUnique | matchedLength
      let e = checkPattern("count.pattern", cs.pattern, cs.flags, true);
      if (e) return fail(e);
      if (cs.exclude !== undefined) {
        e = checkPattern("count.exclude", cs.exclude, cs.excludeFlags, false);
        if (e) return fail(e);
      }
    }
    return { ok: true, ext: value as MetricExtension };
  }

  if (o.type === "setting") {
    const tr = o.transform;
    if (typeof tr !== "object" || tr === null) return fail(`setting extension needs a "transform" object`);
    const ts = tr as Record<string, unknown>;
    if (typeof ts.pattern !== "string" || ts.pattern.length === 0) {
      return fail(`transform.pattern must be a non-empty string`);
    }
    if (typeof ts.replacement !== "string") return fail(`transform.replacement must be a string`);
    if (!optStr(ts.flags)) return fail(`transform.flags must be a string`);
    const flags = typeof ts.flags === "string" ? ts.flags : "";
    if (compileRegex(ts.pattern, flags) === null) {
      return fail(`transform.pattern is not a valid/safe regex`);
    }
    if (ts.stage !== undefined && ts.stage !== "pre" && ts.stage !== "post") {
      return fail(`invalid transform.stage "${show(ts.stage)}"`);
    }
    return { ok: true, ext: value as SettingExtension };
  }

  if (o.type === "preset") {
    const p = o.preset;
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      return fail(`preset extension needs a "preset" object`);
    }
    // Light shape check of the embedded warning/goal rules (the rest of the payload
    // is merged over defaultPreset() on install, so missing fields are harmless).
    const rules = (p as Record<string, unknown>).rules;
    if (rules !== undefined) {
      if (!Array.isArray(rules)) return fail(`preset.rules must be an array`);
      const arr: unknown[] = rules;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        if (typeof r !== "object" || r === null) return fail(`preset.rules[${i}] must be an object`);
        const ro = r as Record<string, unknown>;
        if (typeof ro.metric !== "string" || ro.metric.length === 0) return fail(`preset.rules[${i}].metric must be a non-empty string`);
        if (typeof ro.threshold !== "number" || !isFinite(ro.threshold)) return fail(`preset.rules[${i}].threshold must be a number`);
        if (ro.kind !== "warning" && ro.kind !== "goal") return fail(`preset.rules[${i}].kind must be "warning" or "goal"`);
      }
    }
    return { ok: true, ext: value as PresetExtension };
  }

  return fail(`invalid type "${show(o.type)}" (expected "metric", "setting" or "preset")`);
}

// ── Registry ────────────────────────────────────────────────────────────────────

/**
 * The live set of installed extensions. The counting pipeline holds one instance
 * (built by ExtensionManager from persisted definitions) and queries it for the
 * enabled metrics/settings of a given preset. Compiled regexes are cached and only
 * rebuilt when the definition set changes.
 */
export class ExtensionRegistry {
  private metricDefs = new Map<string, MetricExtension>();
  private settingDefs = new Map<string, SettingExtension>();
  private regexCache = new Map<string, RegExp | null>();
  // Locale tags (most specific first) used to localize display fields. Set by the
  // plugin from the current Obsidian locale; defaults to English-only.
  private localeTags: string[] = ["en"];

  /** Set the active locale tags (e.g. ["ru"] or ["zh-tw", "zh"]). */
  setLocale(tags: string[]): void {
    this.localeTags = tags.length > 0 ? tags : ["en"];
  }

  /** A display field's localized value (falls back to the item's base value). */
  loc(item: { i18n?: I18n } & Partial<LocalizedFields>, field: keyof LocalizedFields): string | undefined {
    return localize(item[field], item.i18n, field, this.localeTags);
  }

  /** Replace the whole set (used when (re)loading from persisted settings). */
  set(exts: Extension[]): void {
    this.metricDefs.clear();
    this.settingDefs.clear();
    this.regexCache.clear();
    for (const e of exts) this.add(e);
  }

  add(ext: Extension): void {
    if (ext.type === "metric") this.metricDefs.set(ext.id, ext);
    else if (ext.type === "setting") this.settingDefs.set(ext.id, ext);
    // Preset extensions aren't live registry items — they install as user presets.
  }

  remove(id: string): void {
    this.metricDefs.delete(id);
    this.settingDefs.delete(id);
  }

  has(id: string): boolean {
    return this.metricDefs.has(id) || this.settingDefs.has(id);
  }
  isEmpty(): boolean {
    return this.metricDefs.size === 0 && this.settingDefs.size === 0;
  }
  metricList(): MetricExtension[] {
    return Array.from(this.metricDefs.values());
  }
  settingList(): SettingExtension[] {
    return Array.from(this.settingDefs.values());
  }
  getMetric(id: string): MetricExtension | undefined {
    return this.metricDefs.get(id);
  }
  getSetting(id: string): SettingExtension | undefined {
    return this.settingDefs.get(id);
  }

  /** A metric extension is on when the preset opts in, falling back to its default. */
  metricEnabled(preset: Preset, id: string): boolean {
    const def = this.metricDefs.get(id);
    if (!def) return false;
    const flag = preset.extMetrics ? preset.extMetrics[id] : undefined;
    return flag !== undefined ? flag : def.defaultEnabled === true;
  }

  settingEnabled(preset: Preset, id: string): boolean {
    const def = this.settingDefs.get(id);
    if (!def) return false;
    const flag = preset.extSettings ? preset.extSettings[id] : undefined;
    return flag !== undefined ? flag : def.defaultEnabled === true;
  }

  // Compiled regexes are cached by their content (flags + pattern + forceGlobal),
  // so sub-patterns are shared across modes and never go stale when the def set
  // changes.
  private compiled(pattern: string, flags: string | undefined, forceGlobal: boolean): RegExp | null {
    const key = (forceGlobal ? "1" : "0") + "\x00" + (flags || "") + "\x00" + pattern;
    if (!this.regexCache.has(key)) {
      this.regexCache.set(key, compileRegex(pattern, flags, { forceGlobal }));
    }
    return this.regexCache.get(key) || null;
  }

  /**
   * Apply every enabled setting transform whose stage matches, in registration
   * order. Called from preprocessing (metrics.ts) so the transforms affect word
   * and character counts exactly like the built-in advanced options.
   */
  applySettings(text: string, preset: Preset, stage: TransformStage): string {
    let s = text;
    for (const def of this.settingDefs.values()) {
      if ((def.transform.stage || "pre") !== stage) continue;
      if (!this.settingEnabled(preset, def.id)) continue;
      const re = this.compiled(def.transform.pattern, def.transform.flags, false);
      if (re) s = s.replace(re, def.transform.replacement);
    }
    return s;
  }

  /** The text a metric counts over, after its `strip` regions are removed. */
  private workingText(spec: CountSpec, raw: string, preprocessed: string): string {
    let text = (spec.source || "raw") === "preprocessed" ? preprocessed : raw;
    if (spec.strip) {
      for (const s of spec.strip) {
        const re = this.compiled(s.pattern, s.flags, true);
        if (re) text = text.replace(re, "");
      }
    }
    return text;
  }

  private evalCount(def: MetricExtension, raw: string, preprocessed: string): number {
    const spec = def.count;
    const text = this.workingText(spec, raw, preprocessed);
    const mode = spec.mode || "matches";

    if (mode === "split") {
      if (!spec.separator) return 0;
      const sep = this.compiled(spec.separator, spec.separatorFlags, false);
      if (!sep) return 0;
      let n = 0;
      for (const part of text.split(sep)) if (part.trim().length > 0) n++;
      return n;
    }

    if (mode === "intersect") {
      if (!spec.primary || !spec.secondary) return 0;
      const primary = this.compiled(spec.primary.pattern, spec.primary.flags, true);
      const secondary = this.compiled(spec.secondary.pattern, spec.secondary.flags, true);
      if (!primary || !secondary) return 0;
      const keysOf = (re: RegExp): Set<string> => {
        const set = new Set<string>();
        for (const m of collectMatches(re, text)) set.add(m[1] !== undefined ? m[1] : m[0]);
        return set;
      };
      const refs = keysOf(primary);
      const defs = keysOf(secondary);
      let n = 0;
      for (const k of refs) if (defs.has(k)) n++;
      if (spec.extra) {
        const ex = this.compiled(spec.extra.pattern, spec.extra.flags, true);
        if (ex) n += collectMatches(ex, text).length;
      }
      return n;
    }

    // Match-enumeration modes.
    if (!spec.pattern) return 0;
    const re = this.compiled(spec.pattern, spec.flags, true);
    if (!re) return 0;
    let matches = collectMatches(re, text);

    if (spec.exclude) {
      // String.search ignores a regex's global lastIndex, so the cached exclude
      // regex stays stateless across matches.
      const ex = this.compiled(spec.exclude, spec.excludeFlags, false);
      if (ex) matches = matches.filter((m) => m[0].search(ex) === -1);
    }

    if (mode === "captureSum") {
      let sum = 0;
      for (const m of matches) {
        const v = parseFloat(m[1] || "");
        if (!isNaN(v)) sum += v;
      }
      return sum;
    }
    if (mode === "captureUnique") {
      const set = new Set<string>();
      for (const m of matches) set.add(m[1] !== undefined ? m[1] : m[0]);
      return set.size;
    }
    if (mode === "matchedLength") {
      let len = 0;
      for (const m of matches) len += m[0].length;
      return len;
    }
    return matches.length;
  }

  /**
   * Non-ratio metric ids that an enabled metric needs computed as an operand but
   * which aren't themselves enabled in the preset — i.e. installed dependencies of
   * an enabled extension. Collected from each enabled metric's declared
   * `dependencies` and from the operands of enabled `ratio` metrics. This lets a
   * ratio like words-per-sentence work when its dependency (sentence-count) is
   * merely installed, without the user having to connect — and thereby display —
   * the dependency in the preset. Only installed, non-ratio ids are returned
   * (built-ins are always in the value map already; ratio-of-ratio is unsupported).
   */
  private requiredMetricIds(preset: Preset): Set<string> {
    const required = new Set<string>();
    const need = (id: unknown) => {
      if (typeof id !== "string") return;
      const dep = this.metricDefs.get(id);
      if (dep && dep.count.mode !== "ratio") required.add(id);
    };
    for (const def of this.metricDefs.values()) {
      if (!this.metricEnabled(preset, def.id)) continue;
      for (const id of def.dependencies || []) need(id);
      if (def.count.mode === "ratio") {
        need(def.count.numerator);
        need(def.count.denominator);
      }
    }
    return required;
  }

  /**
   * Values for every enabled *text-based* metric extension, keyed by id, plus any
   * non-ratio metric required as a dependency/operand of an enabled metric (see
   * requiredMetricIds) so ratios resolve without their dependencies being connected
   * to the preset. `ratio` metrics are derived from other metrics and are computed
   * afterwards by computeRatios (which needs the built-in values too).
   */
  computeMetrics(preset: Preset, raw: string, preprocessed: string): Record<string, number> {
    const required = this.requiredMetricIds(preset);
    const out: Record<string, number> = {};
    for (const def of this.metricDefs.values()) {
      if (def.count.mode === "ratio") continue;
      if (!this.metricEnabled(preset, def.id) && !required.has(def.id)) continue;
      out[def.id] = this.evalCount(def, raw, preprocessed);
    }
    return out;
  }

  /** True when any installed metric extension is a ratio (lets callers skip the
   *  second pass entirely when there are none). */
  hasRatios(): boolean {
    for (const def of this.metricDefs.values()) if (def.count.mode === "ratio") return true;
    return false;
  }

  /**
   * Values for every enabled `ratio` metric, derived from `values` — a numeric map
   * of all metric ids (built-ins flattened to numbers, plus the text-based
   * extension values from computeMetrics). An operand naming a missing or disabled
   * metric resolves to 0; a zero denominator yields 0.
   */
  computeRatios(preset: Preset, values: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const def of this.metricDefs.values()) {
      if (def.count.mode !== "ratio") continue;
      if (!this.metricEnabled(preset, def.id)) continue;
      const num = resolveOperand(def.count.numerator, values);
      const den = resolveOperand(def.count.denominator, values);
      const decimals = typeof def.count.decimals === "number" ? def.count.decimals : 1;
      const factor = Math.pow(10, decimals);
      out[def.id] = den === 0 ? 0 : Math.round((num / den) * factor) / factor;
    }
    return out;
  }

  /**
   * Display rows for the enabled metric extensions, mirroring metrics.ts
   * metricRows. Warning/goal levels reuse the same rule engine, so an extension
   * metric can carry limits just like a built-in one.
   */
  metricRows(preset: Preset, ext: Record<string, number>): ExtMetricRow[] {
    const rows: ExtMetricRow[] = [];
    for (const def of this.metricDefs.values()) {
      if (!this.metricEnabled(preset, def.id)) continue;
      const value = ext[def.id] || 0;
      const valStr = String(value);
      const label = this.loc(def, "label") ?? def.label;
      const statusLabel = this.loc(def, "statusLabel") ?? def.statusLabel ?? label;
      rows.push({
        id: def.id,
        label,
        statusText: `${statusLabel}: ${valStr}`,
        value: valStr,
        unit: this.loc(def, "unit") ?? def.unit,
        level: ruleLevel(preset, value, def.id),
      });
    }
    return rows;
  }
}
