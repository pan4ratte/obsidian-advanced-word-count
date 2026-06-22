import { describe, it, expect } from "vitest";
import {
  compileRegex,
  findDependents,
  localize,
  materializePreset,
  presetDependencyIds,
  presetExtensionFrom,
  presetIndexEntryFrom,
  resolveInstallOrder,
  validateExtension,
  ExtensionIndexEntry,
  ExtensionRegistry,
  MetricExtension,
  PresetExtension,
  PresetExportMeta,
  SettingExtension,
} from "../extensions";
import { defaultPreset, Preset } from "../metrics";

// ── Fixtures ────────────────────────────────────────────────────────────────────

const metricExt = (overrides: Partial<MetricExtension> = {}): MetricExtension => ({
  id: "sentence-count",
  storeName: "Sentence count",
  description: "Counts sentences",
  author: "tester",
  type: "metric",
  toggleLabel: "Sentences",
  count: { pattern: "[.!?]+(?=\\s|$)", flags: "g", source: "preprocessed" },
  ...overrides,
});

const settingExt = (overrides: Partial<SettingExtension> = {}): SettingExtension => ({
  id: "ignore-highlights",
  storeName: "Ignore highlights",
  description: "Removes highlights",
  author: "tester",
  type: "setting",
  toggleLabel: "Ignore highlights",
  transform: { pattern: "==[^=]+==", flags: "g", replacement: "" },
  ...overrides,
});

const presetExt = (overrides: Partial<PresetExtension> = {}): PresetExtension => ({
  id: "academic-paper",
  storeName: "Academic paper",
  description: "A preset for academic writing",
  author: "tester",
  type: "preset",
  preset: { showCitekeys: true, extMetrics: { "distinct-citekeys": true } },
  ...overrides,
});

// A preset that opts into the given extension ids.
const flags = (ids: string[]): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = true;
  return out;
};
const withEnabled = (metrics: string[] = [], settings: string[] = []): Preset =>
  defaultPreset({ extMetrics: flags(metrics), extSettings: flags(settings) });

// ── compileRegex ────────────────────────────────────────────────────────────────

describe("compileRegex", () => {
  it("compiles a valid pattern", () => {
    expect(compileRegex("ab+c", "i")).toBeInstanceOf(RegExp);
  });

  it("rejects unsafe flags", () => {
    expect(compileRegex("a", "y")).toBeNull(); // sticky not allowed
    expect(compileRegex("a", "d")).toBeNull(); // indices not allowed
  });

  it("rejects an unparseable pattern", () => {
    expect(compileRegex("(", "")).toBeNull();
  });

  it("forces the global flag when asked", () => {
    expect(compileRegex("a", "", { forceGlobal: true })!.global).toBe(true);
    // De-duplicates so forcing global over an existing g doesn't throw.
    expect(compileRegex("a", "g", { forceGlobal: true })!.global).toBe(true);
  });
});

// ── validateExtension ───────────────────────────────────────────────────────────

describe("validateExtension", () => {
  it("accepts a well-formed metric extension", () => {
    const r = validateExtension(metricExt());
    expect(r.ok).toBe(true);
  });

  it("accepts a well-formed setting extension", () => {
    const r = validateExtension(settingExt());
    expect(r.ok).toBe(true);
  });

  it("rejects non-objects and missing required fields", () => {
    expect(validateExtension(null).ok).toBe(false);
    expect(validateExtension("nope").ok).toBe(false);
    expect(validateExtension({ ...metricExt(), id: "" }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), toggleLabel: undefined }).ok).toBe(false); // toggleLabel is mandatory
    expect(validateExtension({ ...metricExt(), storeName: undefined }).ok).toBe(false);
  });

  it("accepts an optional updated date", () => {
    expect(validateExtension({ ...metricExt(), updated: "2026-06-20" }).ok).toBe(true);
    expect(validateExtension({ ...metricExt(), updated: 20260620 }).ok).toBe(false);
  });

  it("rejects an invalid id or type", () => {
    expect(validateExtension({ ...metricExt(), id: "Bad Id" }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), type: "widget" }).ok).toBe(false);
  });

  it("rejects a metric with a missing or unsafe count regex", () => {
    expect(validateExtension({ ...metricExt(), count: undefined }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), count: { pattern: "(" } }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), count: { pattern: "a", flags: "y" } }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), count: { pattern: "a", mode: "bogus" } }).ok).toBe(false);
  });

  it("rejects a setting with a bad transform", () => {
    expect(validateExtension({ ...settingExt(), transform: undefined }).ok).toBe(false);
    expect(validateExtension({ ...settingExt(), transform: { pattern: "a" } }).ok).toBe(false); // no replacement
    expect(validateExtension({ ...settingExt(), transform: { pattern: "(", replacement: "" } }).ok).toBe(false);
  });

  it("validates the optional dependencies list", () => {
    expect(validateExtension({ ...metricExt(), dependencies: ["word-frequency", "headings"] }).ok).toBe(true);
    expect(validateExtension({ ...metricExt(), dependencies: [] }).ok).toBe(true);
    expect(validateExtension({ ...metricExt(), dependencies: "words" }).ok).toBe(false); // not an array
    expect(validateExtension({ ...metricExt(), dependencies: ["Bad Id"] }).ok).toBe(false); // invalid id
    expect(validateExtension({ ...metricExt(), dependencies: [5] }).ok).toBe(false); // not a string
    // Self-dependency is rejected (id is "sentence-count").
    expect(validateExtension({ ...metricExt(), dependencies: ["sentence-count"] }).ok).toBe(false);
    // Built-in metric ids must not be listed — they're always available as operands.
    expect(validateExtension({ ...metricExt(), dependencies: ["pages"] }).ok).toBe(false);           // lowercase built-in
    expect(validateExtension({ ...metricExt(), dependencies: ["footnotes"] }).ok).toBe(false);       // lowercase built-in
    expect(validateExtension({ ...metricExt(), dependencies: ["wordsWithSpaces"] }).ok).toBe(false); // camelCase built-in
  });

  it("accepts a well-formed preset extension (no toggleLabel required)", () => {
    expect(validateExtension(presetExt()).ok).toBe(true);
    // A preset may carry dependencies (the extensions it uses).
    expect(validateExtension({ ...presetExt(), dependencies: ["distinct-citekeys"] }).ok).toBe(true);
  });

  it("rejects a preset extension without a valid preset object", () => {
    expect(validateExtension({ ...presetExt(), preset: undefined }).ok).toBe(false);
    expect(validateExtension({ ...presetExt(), preset: [] }).ok).toBe(false);
    expect(validateExtension({ ...presetExt(), preset: "nope" }).ok).toBe(false);
  });

  it("validates a preset's embedded warning/goal rules", () => {
    const withRules = (rules: unknown) => ({ ...presetExt(), preset: { rules } });
    expect(validateExtension(withRules([{ metric: "pages", threshold: 5, kind: "warning" }])).ok).toBe(true);
    expect(validateExtension(withRules([{ metric: "pages", threshold: 5, kind: "goal" }])).ok).toBe(true);
    expect(validateExtension(withRules([{ metric: "pages", threshold: 5, kind: "bogus" }])).ok).toBe(false);
    expect(validateExtension(withRules([{ threshold: 5, kind: "warning" }])).ok).toBe(false); // no metric
    expect(validateExtension(withRules([{ metric: "pages", kind: "warning" }])).ok).toBe(false); // no threshold
    expect(validateExtension(withRules("not-an-array")).ok).toBe(false);
  });
});

// ── resolveInstallOrder ───────────────────────────────────────────────────────

describe("resolveInstallOrder", () => {
  // A minimal catalogue entry; only id/dependencies matter to the resolver.
  const entry = (id: string, dependencies?: string[]): ExtensionIndexEntry => ({
    id, storeName: id, description: "", author: "t", type: "metric", dependencies,
  });
  const ids = (es: ExtensionIndexEntry[]) => es.map((e) => e.id);
  const none = () => false;

  it("orders dependencies before the target, target last", () => {
    const index = [entry("a", ["b", "c"]), entry("b", ["c"]), entry("c")];
    const { order, missing } = resolveInstallOrder("a", index, none);
    expect(ids(order)).toEqual(["c", "b", "a"]);
    expect(missing).toEqual([]);
  });

  it("installs each dependency once across a diamond graph", () => {
    const index = [entry("a", ["b", "c"]), entry("b", ["d"]), entry("c", ["d"]), entry("d")];
    const { order } = resolveInstallOrder("a", index, none);
    expect(order.filter((e) => e.id === "d")).toHaveLength(1);
    expect(ids(order).indexOf("d")).toBe(0); // d first, a last
    expect(ids(order)[ids(order).length - 1]).toBe("a");
  });

  it("prunes already-installed dependencies but always includes the target", () => {
    const index = [entry("a", ["b", "c"]), entry("b"), entry("c")];
    const { order } = resolveInstallOrder("a", index, (id) => id === "b");
    expect(ids(order)).toEqual(["c", "a"]); // b skipped, a reinstalled
  });

  it("collects dependencies missing from the catalogue", () => {
    const index = [entry("a", ["ghost"])];
    const { order, missing } = resolveInstallOrder("a", index, none);
    expect(missing).toEqual(["ghost"]);
    expect(ids(order)).toEqual(["a"]);
  });

  it("throws on a dependency cycle", () => {
    const index = [entry("a", ["b"]), entry("b", ["a"])];
    expect(() => resolveInstallOrder("a", index, none)).toThrow(/cycle/);
  });
});

// ── findDependents ────────────────────────────────────────────────────────────

describe("findDependents", () => {
  it("returns the extensions that depend on the given id", () => {
    const exts = [
      metricExt({ id: "base" }),
      metricExt({ id: "uses-base", dependencies: ["base"] }),
      metricExt({ id: "also-uses-base", dependencies: ["base", "other"] }),
      metricExt({ id: "unrelated" }),
    ];
    expect(findDependents("base", exts).map((e) => e.id)).toEqual(["uses-base", "also-uses-base"]);
    expect(findDependents("other", exts).map((e) => e.id)).toEqual(["also-uses-base"]);
    expect(findDependents("base", [])).toEqual([]);
    expect(findDependents("unrelated", exts)).toEqual([]); // nothing depends on it
  });
});

// ── Preset extensions (shareable presets) ─────────────────────────────────────────

describe("materializePreset", () => {
  it("merges the payload over defaults, with a fresh id and name fallback", () => {
    const ext = presetExt({ storeName: "Paper", preset: { showCitekeys: true, wordsPerPage: 300 } });
    const p = materializePreset(ext);
    expect(p.showCitekeys).toBe(true);        // payload override
    expect(p.wordsPerPage).toBe(300);         // payload override
    expect(p.showWordsWithSpaces).toBe(true); // default preserved
    expect(p.name).toBe("Paper");             // payload has no name → ext.storeName
    expect(typeof p.id).toBe("string");
    expect(p.id.length).toBeGreaterThan(0);
  });

  it("prefers a name embedded in the payload", () => {
    expect(materializePreset(presetExt({ storeName: "Ext", preset: { name: "Payload" } })).name).toBe("Payload");
  });

  it("always assigns a new id, ignoring any id carried in the payload", () => {
    expect(materializePreset(presetExt({ preset: { id: "leftover" } })).id).not.toBe("leftover");
  });
});

describe("presetDependencyIds", () => {
  const isExt = (id: string) => ["distinct-citekeys", "sentence-count", "ignore-math"].indexOf(id) !== -1;

  it("collects enabled extension ids from metrics, settings and rules (sorted, deduped)", () => {
    const preset = defaultPreset({
      extMetrics: { "distinct-citekeys": true, "sentence-count": false },
      extSettings: { "ignore-math": true },
      rules: [{ metric: "sentence-count", threshold: 10, kind: "warning" }],
    });
    // sentence-count is disabled as a metric but referenced by a rule → still pulled in.
    expect(presetDependencyIds(preset, isExt)).toEqual(["distinct-citekeys", "ignore-math", "sentence-count"]);
  });

  it("ignores built-in metric ids and disabled extensions", () => {
    const preset = defaultPreset({
      extMetrics: { "distinct-citekeys": false },
      rules: [{ metric: "pages", threshold: 5, kind: "warning" }], // built-in, not an extension
    });
    expect(presetDependencyIds(preset, isExt)).toEqual([]);
  });
});

describe("presetExtensionFrom", () => {
  const meta = (o: Partial<PresetExportMeta> = {}): PresetExportMeta =>
    ({ name: "Academic Paper!", author: "me", description: "A preset", ...o });

  it("builds a catalogue-ready, valid preset extension from the supplied metadata", () => {
    const preset = defaultPreset({ name: "old name", extMetrics: { "distinct-citekeys": true } });
    const ext = presetExtensionFrom(preset, ["distinct-citekeys"], "2026-06-21", meta());
    expect(ext.type).toBe("preset");
    expect(ext.id).toBe("academic-paper"); // slugified from meta.name
    expect(ext.storeName).toBe("Academic Paper!");
    expect(ext.author).toBe("me");
    expect(ext.description).toBe("A preset");
    expect(ext.dependencies).toEqual(["distinct-citekeys"]);
    expect(ext.preset.id).toBeUndefined();             // runtime id stripped
    expect(ext.preset.name).toBe("Academic Paper!");   // payload name overridden with meta.name
    expect(validateExtension(ext).ok).toBe(true);      // ready to submit as-is
  });

  it("falls back to a safe id when the name has no ascii slug, and omits empty deps", () => {
    const ext = presetExtensionFrom(defaultPreset(), [], "2026-06-21", meta({ name: "Статья" }));
    expect(ext.id).toBe("preset");
    expect(ext.dependencies).toBeUndefined();
  });

  it("omits i18n when none is supplied, and carries it through when given", () => {
    expect(presetExtensionFrom(defaultPreset(), [], "2026-06-21", meta()).i18n).toBeUndefined();
    const i18n = { ru: { storeName: "Научная статья", description: "Описание" } };
    expect(presetExtensionFrom(defaultPreset(), [], "2026-06-21", meta({ i18n })).i18n).toBe(i18n);
  });
});

describe("presetIndexEntryFrom", () => {
  const meta = (o: Partial<PresetExportMeta> = {}): PresetExportMeta =>
    ({ name: "Academic Paper!", author: "me", description: "A preset", ...o });

  it("derives the catalogue entry: subfolder path, shared meta, no payload", () => {
    const i18n = { ru: { storeName: "Научная статья" } };
    const ext = presetExtensionFrom(defaultPreset(), ["distinct-citekeys"], "2026-06-21", meta({ i18n }));
    const entry = presetIndexEntryFrom(ext);
    expect(entry).toMatchObject({
      id: "academic-paper",
      type: "preset",
      path: "presets/academic-paper.json",
      updated: "2026-06-21",
      dependencies: ["distinct-citekeys"],
    });
    expect(entry.i18n).toBe(ext.i18n);                  // same i18n carried over
    expect("preset" in (entry as object)).toBe(false);  // the payload stays out of the index
  });

  it("omits optional fields the preset doesn't carry", () => {
    const entry = presetIndexEntryFrom(presetExtensionFrom(defaultPreset(), [], "2026-06-21", meta({ name: "Plain" })));
    expect(entry.path).toBe("presets/plain.json");
    expect(entry.dependencies).toBeUndefined();
    expect(entry.i18n).toBeUndefined();
  });
});

// ── ExtensionRegistry ───────────────────────────────────────────────────────────

describe("ExtensionRegistry", () => {
  it("registers, lists and removes extensions", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt(), settingExt()]);
    expect(reg.metricList().map((d) => d.id)).toEqual(["sentence-count"]);
    expect(reg.settingList().map((d) => d.id)).toEqual(["ignore-highlights"]);
    expect(reg.has("sentence-count")).toBe(true);

    reg.remove("sentence-count");
    expect(reg.has("sentence-count")).toBe(false);
    expect(reg.isEmpty()).toBe(false);
    reg.remove("ignore-highlights");
    expect(reg.isEmpty()).toBe(true);
  });

  it("does not register preset extensions as live metrics/settings", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt(), settingExt(), presetExt()]);
    expect(reg.metricList().map((d) => d.id)).toEqual(["sentence-count"]);
    expect(reg.settingList().map((d) => d.id)).toEqual(["ignore-highlights"]);
    expect(reg.has("academic-paper")).toBe(false); // presets aren't registry items
  });

  it("counts matches for an enabled metric, and skips disabled ones", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt()]);
    const text = "One sentence. Two! Three?";

    const on = reg.computeMetrics(withEnabled(["sentence-count"]), text, text);
    expect(on["sentence-count"]).toBe(3);

    const off = reg.computeMetrics(defaultPreset(), text, text);
    expect(off["sentence-count"]).toBeUndefined();
  });

  it("honors defaultEnabled when the preset has no explicit flag", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt({ defaultEnabled: true })]);
    const text = "A. B.";
    expect(reg.computeMetrics(defaultPreset(), text, text)["sentence-count"]).toBe(2);
  });

  it("respects the count source (raw vs preprocessed)", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt({ id: "raw-dots", count: { pattern: "\\.", flags: "g", source: "raw" } })]);
    const preset = withEnabled(["raw-dots"]);
    expect(reg.computeMetrics(preset, "a.b.c", "no dots here")["raw-dots"]).toBe(2);
  });

  it("supports captureSum mode", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      metricExt({ id: "weighted", count: { pattern: "\\[(\\d+)\\]", flags: "g", mode: "captureSum", source: "raw" } }),
    ]);
    const text = "a[3] b[4] c[10]";
    expect(reg.computeMetrics(withEnabled(["weighted"]), text, text)["weighted"]).toBe(17);
  });

  it("applies only enabled setting transforms for the matching stage", () => {
    const reg = new ExtensionRegistry();
    reg.set([settingExt()]);
    const text = "keep ==drop this== keep";

    expect(reg.applySettings(text, withEnabled([], ["ignore-highlights"]), "pre")).toBe("keep  keep");
    // Disabled → untouched.
    expect(reg.applySettings(text, defaultPreset(), "pre")).toBe(text);
    // Wrong stage → untouched (this transform defaults to "pre").
    expect(reg.applySettings(text, withEnabled([], ["ignore-highlights"]), "post")).toBe(text);
  });

  it("builds metric rows with warning/goal levels from the preset rules", () => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt()]);
    const preset = withEnabled(["sentence-count"]);
    preset.rules = [{ metric: "sentence-count", threshold: 10, kind: "warning" }];

    const rows = reg.metricRows(preset, { "sentence-count": 9 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "sentence-count", label: "Sentences", value: "9", level: "orange" });
    expect(rows[0].statusText).toBe("Sentences: 9");

    expect(reg.metricRows(preset, { "sentence-count": 10 })[0].level).toBe("red");
  });
});

// ── Count modes ─────────────────────────────────────────────────────────────────

describe("ExtensionRegistry count modes", () => {
  // Build a registry with one metric whose count spec is given, and count `text`.
  const count = (id: string, spec: MetricExtension["count"], text: string): number => {
    const reg = new ExtensionRegistry();
    reg.set([metricExt({ id, count: spec })]);
    return reg.computeMetrics(withEnabled([id]), text, text)[id];
  };

  it("captureUnique counts distinct captured values", () => {
    expect(count("u", { pattern: "#([a-z]+)", flags: "g", mode: "captureUnique", source: "raw" }, "#a #b #a #c")).toBe(3);
  });

  it("captureUnique honors an exclude filter on the whole match", () => {
    // Numeric-only tags are dropped; repeats counted once.
    expect(
      count("u", { pattern: "#(\\w+)", flags: "g", mode: "captureUnique", source: "raw", exclude: "^#\\d+$" }, "#a #1 #a #b"),
    ).toBe(2);
  });

  it("matchedLength sums the length of every match", () => {
    expect(count("L", { pattern: "==[^=]+==", flags: "g", mode: "matchedLength", source: "raw" }, "x ==ab== y ==cde==")).toBe(13);
  });

  it("split counts non-empty segments", () => {
    expect(count("s", { separator: ",\\s*", separatorFlags: "g", mode: "split", source: "raw" }, "a, b, c")).toBe(3);
    expect(count("s", { separator: ",", mode: "split", source: "raw" }, "a,b,")).toBe(2); // trailing empty ignored
  });

  it("matches honors an exclude filter (markdown links, not images)", () => {
    const spec: MetricExtension["count"] = { pattern: "!?\\[[^\\]]*\\]\\([^)]*\\)", flags: "g", exclude: "^!", source: "raw" };
    expect(count("md", spec, "see [a](u) and ![img](p)")).toBe(1);
  });

  it("strip removes regions before counting", () => {
    // Without strip both @-tokens count; stripping the wikilink leaves one.
    const spec = (strip?: { pattern: string }[]): MetricExtension["count"] =>
      ({ pattern: "@\\w+", flags: "g", source: "raw", strip });
    expect(count("a", spec(), "[[@wiki]] real @key")).toBe(2);
    expect(count("b", spec([{ pattern: "\\[\\[[^\\]]*\\]\\]" }]), "[[@wiki]] real @key")).toBe(1);
  });

  describe("intersect (footnote-style paired counting)", () => {
    const footnotes: MetricExtension["count"] = {
      mode: "intersect",
      source: "raw",
      primary: { pattern: "\\[\\^([^\\]\\s]+)\\](?!:)", flags: "g" },
      secondary: { pattern: "^[ \\t]*\\[\\^([^\\]\\s]+)\\]:", flags: "gm" },
      extra: { pattern: "\\^\\[[^\\]]+\\]", flags: "g" },
    };

    const fn = (text: string) => count("fn", footnotes, text);

    it("matches the built-in footnote counter on the same cases", () => {
      expect(fn("text[^1] more\n\n[^1]: the definition")).toBe(1);   // ref + def
      expect(fn("a[^1] b[^1]\n\n[^1]: def")).toBe(1);                 // repeated ref counts once
      expect(fn("a[^1] b[^2]\n\n[^1]: one\n[^2]: two")).toBe(2);      // two complete
      expect(fn("an inline ^[footnote here] yes")).toBe(1);           // inline via extra
      expect(fn("text[^1] with no definition")).toBe(0);             // orphan reference
      expect(fn("[^1]: orphan definition")).toBe(0);                 // orphan definition
      expect(fn("a[^1] b[^2]\n\n[^1]: only one defined")).toBe(1);   // one of two matched
    });
  });
});

// ── Ratio mode ──────────────────────────────────────────────────────────────────

describe("ratio mode", () => {
  const ratioExt = (count: MetricExtension["count"]) => metricExt({ id: "r", toggleLabel: "R", count });

  it("validates operands and decimals", () => {
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: "a", denominator: "b" })).ok).toBe(true);
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: 100, denominator: "b" })).ok).toBe(true);
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: "a" })).ok).toBe(false); // missing denominator
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: {} as never, denominator: "b" })).ok).toBe(false);
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: "a", denominator: "b", decimals: 9 })).ok).toBe(false);
    expect(validateExtension(ratioExt({ mode: "ratio", numerator: "a", denominator: "b", decimals: 1.5 })).ok).toBe(false);
  });

  it("computeMetrics skips ratio metrics (they run in the second pass)", () => {
    const reg = new ExtensionRegistry();
    reg.set([ratioExt({ mode: "ratio", numerator: "x", denominator: "y" })]);
    expect(reg.computeMetrics(withEnabled(["r"]), "text", "text")).toEqual({});
    expect(reg.hasRatios()).toBe(true);
  });

  it("computeRatios divides, rounds, and guards zero/missing operands", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      metricExt({ id: "avg", toggleLabel: "Avg", count: { mode: "ratio", numerator: "chars", denominator: "words", decimals: 1 } }),
      metricExt({ id: "zero", toggleLabel: "Zero", count: { mode: "ratio", numerator: "chars", denominator: "missing" } }),
    ]);
    const out = reg.computeRatios(withEnabled(["avg", "zero"]), { chars: 47, words: 10 });
    expect(out.avg).toBe(4.7);
    expect(out.zero).toBe(0); // unknown denominator → 0
  });

  it("does not compute disabled ratio metrics", () => {
    const reg = new ExtensionRegistry();
    reg.set([ratioExt({ mode: "ratio", numerator: "chars", denominator: "words" })]);
    expect(reg.computeRatios(defaultPreset(), { chars: 4, words: 2 })).toEqual({});
  });
});

// ── Ratio operands from installed-but-not-connected dependencies ──────────────────

describe("ratio operands from installed dependencies", () => {
  // sentence-count is an ordinary split metric; words-per-sentence is a ratio that
  // divides the built-in word count by it and declares it as a dependency.
  const sentences = metricExt({
    id: "sentence-count", toggleLabel: "Sentences",
    count: { mode: "split", source: "raw", separator: "[.!?]+(?=\\s|$)" },
  });
  const wps = metricExt({
    id: "words-per-sentence", toggleLabel: "Words per sentence", dependencies: ["sentence-count"],
    count: { mode: "ratio", numerator: "wordsWithSpaces", denominator: "sentence-count", decimals: 1 },
  });
  const text = "One two three. Four five."; // two sentences

  it("computes a dependency's value even when it isn't connected to the preset", () => {
    const reg = new ExtensionRegistry();
    reg.set([sentences, wps]);
    const preset = withEnabled(["words-per-sentence"]); // the dependency is NOT enabled
    const ext = reg.computeMetrics(preset, text, text);
    expect(ext["sentence-count"]).toBe(2);                          // available as an operand…
    expect(reg.metricEnabled(preset, "sentence-count")).toBe(false); // …but not connected
  });

  it("resolves the ratio from the dependency, and does not display the dependency", () => {
    const reg = new ExtensionRegistry();
    reg.set([sentences, wps]);
    const preset = withEnabled(["words-per-sentence"]);
    const ext = reg.computeMetrics(preset, text, text);
    const ratios = reg.computeRatios(preset, { ...ext, wordsWithSpaces: 5 });
    expect(ratios["words-per-sentence"]).toBe(2.5); // 5 words ÷ 2 sentences

    // Only the connected ratio is shown; the dependency stays hidden.
    const rows = reg.metricRows(preset, { ...ext, "words-per-sentence": 2.5 });
    expect(rows.map((r) => r.id)).toEqual(["words-per-sentence"]);
  });

  it("computes an operand even if the dependencies field is omitted (operands are inspected too)", () => {
    const wpsNoDep = metricExt({
      id: "words-per-sentence", toggleLabel: "Words per sentence",
      count: { mode: "ratio", numerator: "wordsWithSpaces", denominator: "sentence-count", decimals: 1 },
    });
    const reg = new ExtensionRegistry();
    reg.set([sentences, wpsNoDep]);
    expect(reg.computeMetrics(withEnabled(["words-per-sentence"]), text, text)["sentence-count"]).toBe(2);
  });

  it("leaves an unrelated installed metric uncomputed when nothing needs it", () => {
    const reg = new ExtensionRegistry();
    reg.set([sentences, wps]);
    // Nothing enabled → no metrics computed at all (no spurious dependency values).
    expect(reg.computeMetrics(defaultPreset(), text, text)).toEqual({});
  });
});

// ── Localization ────────────────────────────────────────────────────────────────

describe("localization", () => {
  const i18n = { ru: { toggleLabel: "Заголовки", hint: "Считает заголовки" }, "zh-tw": { toggleLabel: "標題" } };

  it("localize picks the most specific tag, then falls back to base", () => {
    expect(localize("Headings", i18n, "toggleLabel", ["ru"])).toBe("Заголовки");
    expect(localize("Headings", i18n, "toggleLabel", ["en"])).toBe("Headings"); // no ru → base
    expect(localize("Counts…", i18n, "hint", ["zh-tw", "zh"])).toBe("Counts…"); // zh-tw lacks hint → base
    expect(localize("Headings", i18n, "toggleLabel", ["zh-tw", "zh"])).toBe("標題"); // full tag before base
    expect(localize("Headings", undefined, "toggleLabel", ["ru"])).toBe("Headings"); // no i18n → base
  });

  it("rejects i18n whose field values aren't strings", () => {
    const m = metricExt({ i18n: { ru: { toggleLabel: 5 } } as never });
    expect(validateExtension(m).ok).toBe(false);
  });

  it("registry.loc localizes metric rows and display fields for the active locale", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      metricExt({
        id: "headings", toggleLabel: "Headings", statusBarLabel: "Headings",
        count: { pattern: "^#", flags: "gm" },
        i18n: { ru: { toggleLabel: "Заголовки", statusBarLabel: "Заголовков" } },
      }),
    ]);
    const preset = defaultPreset({ extMetrics: { headings: true } });

    reg.setLocale(["ru"]);
    const row = reg.metricRows(preset, { headings: 3 })[0];
    expect(row.label).toBe("Заголовки");
    expect(row.statusText).toBe("Заголовков: 3");
    expect(reg.loc({ ...metricExt(), i18n: { ru: { toggleLabel: "Заголовки" } }, toggleLabel: "Headings" }, "toggleLabel")).toBe("Заголовки");

    reg.setLocale(["en"]);
    expect(reg.metricRows(preset, { headings: 3 })[0].label).toBe("Headings");
  });
});
