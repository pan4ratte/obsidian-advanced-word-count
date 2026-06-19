import { describe, it, expect } from "vitest";
import {
  compileRegex,
  compareVersions,
  validateExtension,
  ExtensionRegistry,
  MetricExtension,
  SettingExtension,
} from "../extensions";
import { defaultPreset, Preset } from "../metrics";

// ── Fixtures ────────────────────────────────────────────────────────────────────

const metricExt = (overrides: Partial<MetricExtension> = {}): MetricExtension => ({
  id: "sentence-count",
  name: "Sentence count",
  description: "Counts sentences",
  author: "tester",
  version: "1.0.0",
  type: "metric",
  label: "Sentences",
  count: { pattern: "[.!?]+(?=\\s|$)", flags: "g", source: "preprocessed" },
  ...overrides,
});

const settingExt = (overrides: Partial<SettingExtension> = {}): SettingExtension => ({
  id: "ignore-highlights",
  name: "Ignore highlights",
  description: "Removes highlights",
  author: "tester",
  version: "1.0.0",
  type: "setting",
  label: "Ignore highlights",
  transform: { pattern: "==[^=]+==", flags: "g", replacement: "" },
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

// ── compareVersions ─────────────────────────────────────────────────────────────

describe("compareVersions", () => {
  it("orders dotted numeric versions", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1); // numeric, not lexical
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
    expect(validateExtension({ ...metricExt(), label: undefined }).ok).toBe(false);
  });

  it("rejects an invalid id, version or type", () => {
    expect(validateExtension({ ...metricExt(), id: "Bad Id" }).ok).toBe(false);
    expect(validateExtension({ ...metricExt(), version: "v1" }).ok).toBe(false);
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
  const ratioExt = (count: MetricExtension["count"]) => metricExt({ id: "r", label: "R", count });

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
      metricExt({ id: "avg", label: "Avg", count: { mode: "ratio", numerator: "chars", denominator: "words", decimals: 1 } }),
      metricExt({ id: "zero", label: "Zero", count: { mode: "ratio", numerator: "chars", denominator: "missing" } }),
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
