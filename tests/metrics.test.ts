import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  computeFull,
  metricRows,
  surfaceWarnLevel,
  defaultPreset,
  effectiveMetricOrder,
  reorderMetrics,
  METRIC_ORDER,
  Preset,
} from "../metrics";
import { ExtensionRegistry } from "../extensions";

// Helper: build a preset with overrides and count one input string.
const count = (raw: string, overrides: Partial<Preset> = {}) =>
  computeMetrics(raw, defaultPreset(overrides));

describe("word count (wordsWithSpaces)", () => {
  it("counts space-separated tokens", () => {
    expect(count("hello world foo").wordsWithSpaces).toBe(3);
  });

  it("treats an empty document as zero words", () => {
    expect(count("").wordsWithSpaces).toBe(0);
    expect(count("   \n  ").wordsWithSpaces).toBe(0);
  });

  it("strips YAML frontmatter before counting", () => {
    expect(count("---\ntitle: x\ntags: [a]\n---\nhello world").wordsWithSpaces).toBe(2);
  });

  it("excludes images", () => {
    expect(count("text ![alt text](img.png) more").wordsWithSpaces).toBe(2);
  });

  it("ignores comments by default", () => {
    expect(count("hello %%secret note%% world").wordsWithSpaces).toBe(2);
    expect(count("hello <!-- hidden --> world").wordsWithSpaces).toBe(2);
  });

  it("keeps comment text when ignoreComments is off", () => {
    expect(count("hello %%two words%% end", { ignoreComments: false }).wordsWithSpaces).toBe(4);
  });

  it("does not count task checkbox markers, checked or unchecked", () => {
    // The marker contributes no words, so toggling a box never changes the count.
    expect(count("- [ ] task one").wordsWithSpaces).toBe(2);
    expect(count("- [x] task one").wordsWithSpaces).toBe(2);
    expect(count("- [X] task one").wordsWithSpaces).toBe(2);
    expect(count("- task one").wordsWithSpaces).toBe(2);
    // Empty boxes count as zero words.
    expect(count("- [ ]").wordsWithSpaces).toBe(0);
    expect(count("- [x]").wordsWithSpaces).toBe(0);
    // Nested / multi-line task lists.
    expect(count("a\n  - [ ] item\n  - [x] done").wordsWithSpaces).toBe(3);
  });
});

describe("markdown links", () => {
  it("counts label and URL as words by default", () => {
    expect(count("see [label](http://url.com) end").wordsWithSpaces).toBe(4);
  });

  it("counts only the label when countMdLinksAsWords is on", () => {
    expect(count("see [label](http://url.com) end", { countMdLinksAsWords: true }).wordsWithSpaces).toBe(3);
  });
});

describe("wiki links", () => {
  it("counts every word inside the link by default", () => {
    expect(count("[[Page#Heading|Alias]]").wordsWithSpaces).toBe(3);
  });

  it("counts only the display text when countWikiLinkDisplayText is on", () => {
    expect(count("[[Page#Heading|Alias]]", { countWikiLinkDisplayText: true }).wordsWithSpaces).toBe(1);
    expect(count("[[Page]]", { countWikiLinkDisplayText: true }).wordsWithSpaces).toBe(1);
  });

  it("strips the link entirely when ignoreWikiLinks is on", () => {
    expect(count("before [[Page|Alias]] after", { ignoreWikiLinks: true }).wordsWithSpaces).toBe(2);
  });
});

describe("citekeys", () => {
  it("keeps the citekey as a word by default", () => {
    expect(count("see [@smith2020] here").wordsWithSpaces).toBe(3);
  });

  it("strips the citekey when countCitekeysAsWords is on", () => {
    expect(count("see [@smith2020] here", { countCitekeysAsWords: true }).wordsWithSpaces).toBe(2);
  });

  it("keeps prefix/locator prose but drops the keys when ignoring citekeys", () => {
    // "see" + "p. 33" counted (3 tokens), @smith2020 dropped.
    expect(count("[see @smith2020, p. 33]", { countCitekeysAsWords: true }).wordsWithSpaces).toBe(3);
    // "see" + "also" counted, both keys dropped.
    expect(count("[see @a; also @b]", { countCitekeysAsWords: true }).wordsWithSpaces).toBe(2);
  });

  it("keeps the keys as words when not ignoring citekeys", () => {
    expect(count("[see @smith2020, p. 33]").wordsWithSpaces).toBe(4);
  });
});

describe("character counts", () => {
  it("counts characters with and without whitespace", () => {
    const m = count("ab cd");
    expect(m.charsWithSpaces).toBe(5);
    expect(m.charsWithoutSpaces).toBe(4);
  });

  it("strips HTML markup but keeps inner text when ignoreHtmlTags is on", () => {
    expect(count("<b>hi</b>").charsWithSpaces).toBe(9);
    expect(count("<b>hi</b>", { ignoreHtmlTags: true }).charsWithSpaces).toBe(2);
  });

  it("counts a task checkbox marker as a single space", () => {
    // The marker collapses to one space, so "- [ ] a" is counted like " a".
    expect(count("- [ ] a").charsWithSpaces).toBe(2);
    expect(count("- [x] a").charsWithSpaces).toBe(2);
    // Being whitespace, the marker adds nothing to chars-without-spaces.
    expect(count("- [ ] a").charsWithoutSpaces).toBe(1);
  });
});

describe("structural metrics", () => {
  it("computes pages from words per page", () => {
    expect(count("one two three", { wordsPerPage: 2 }).pages).toBe("1.5");
  });

  it("estimates reading time in minutes from the chosen reading speed", () => {
    const words = Array(500).fill("a").join(" "); // 500 words
    expect(count(words, { readingWpm: 250 }).readingTime).toBe("2.0"); // average
    expect(count(words, { readingWpm: 400 }).readingTime).toBe("1.3"); // fast (1.25→1.3)
    expect(count(words, { readingWpm: 150 }).readingTime).toBe("3.3"); // complex (3.33→3.3)
    expect(count("").readingTime).toBe("0.0");
  });

  it("counts lines", () => {
    expect(count("a\nb\nc").lines).toBe(3);
  });

  it("counts paragraphs separated by blank lines", () => {
    expect(count("para one\n\npara two\n\npara three").paragraphs).toBe(3);
  });

  it("counts markdown links", () => {
    expect(count("see [docs](https://x.com) now").markdownLinks).toBe(1);
  });

  it("does not count image embeds as markdown links", () => {
    expect(count("![alt](img.png)").markdownLinks).toBe(0);
    expect(count("text [docs](url) and ![alt](img.png)").markdownLinks).toBe(1);
  });

  it("counts each @key, including prefixes and several bundled in one bracket", () => {
    expect(count("[@smith2020]").citekeys).toBe(1);
    expect(count("[@smith2020; @jones2019]").citekeys).toBe(2);
    expect(count("text [@a; @b; @c] more").citekeys).toBe(3);
    // Locator text after a key isn't mistaken for another key.
    expect(count("[@smith2020, p. 33]").citekeys).toBe(1);
    // Pandoc prefixes and the suppressed-author form.
    expect(count("[see @smith2020]").citekeys).toBe(1);
    expect(count("[see @smith2020, p. 33; also @jones2019]").citekeys).toBe(2);
    expect(count("[-@smith2020]").citekeys).toBe(1);
    // Wikilinks and markdown links are not citations even if they contain "@".
    expect(count("[[@wiki]] and [mail @me](http://x.com)").citekeys).toBe(0);
  });

  it("counts wiki links but not embeds", () => {
    expect(count("[[A]] and ![[B]]").wikiLinks).toBe(1);
  });

  it("counts embeds", () => {
    expect(count("[[A]] and ![[B]]").embeds).toBe(1);
  });

  it("counts markdown image embeds, including file:/// and angle-bracketed URLs", () => {
    expect(count("![alt](img.png)").embeds).toBe(1);
    expect(count("![cover.jpg](<file:///C:\\Users\\user\\Desktop\\cover.jpg>)").embeds).toBe(1);
    // Wiki and markdown embeds combine without double-counting.
    expect(count("![[B]] and ![alt](img.png)").embeds).toBe(2);
    // A plain markdown link (no leading !) is not an embed.
    expect(count("[docs](https://x.com)").embeds).toBe(0);
  });

  it("counts HTML embeds (img and other embedded-content tags)", () => {
    expect(count('<img src="x.png">').embeds).toBe(1);
    expect(count('<img src="x.png" />').embeds).toBe(1);
    expect(count('<IMG SRC="x.png">').embeds).toBe(1); // case-insensitive
    expect(count('<iframe src="https://x.com"></iframe>').embeds).toBe(1); // opening tag only
    expect(count("<video controls><source src='a.mp4'></video>").embeds).toBe(1); // wraps inner tags
    expect(count('<embed src="a.pdf"> <audio src="a.mp3"> <object data="a.svg"></object>').embeds).toBe(3);
    // Not embeds: non-embed HTML, and tags whose name only starts with an embed name.
    expect(count("<div>text</div>").embeds).toBe(0);
    expect(count("<image>").embeds).toBe(0);
    // Combines with wiki + markdown embeds.
    expect(count('![[B]] ![alt](img.png) <img src="x.png">').embeds).toBe(3);
  });

  it("counts only complete footnotes", () => {
    // Reference + matching definition = one complete footnote.
    expect(count("text[^1] more\n\n[^1]: the definition").footnotes).toBe(1);
    // A reference repeated for the same label still counts once.
    expect(count("a[^1] b[^1]\n\n[^1]: def").footnotes).toBe(1);
    // Two distinct complete footnotes.
    expect(count("a[^1] b[^2]\n\n[^1]: one\n[^2]: two").footnotes).toBe(2);
    // Inline footnotes are self-contained and always complete.
    expect(count("an inline ^[footnote here] yes").footnotes).toBe(1);
  });

  it("ignores incomplete footnotes (orphan reference or definition)", () => {
    // Reference with no definition.
    expect(count("text[^1] with no definition").footnotes).toBe(0);
    // Definition with no reference.
    expect(count("[^1]: orphan definition").footnotes).toBe(0);
    // Only the matched label counts; the orphan reference does not.
    expect(count("a[^1] b[^2]\n\n[^1]: only one defined").footnotes).toBe(1);
  });
});

describe("metricRows", () => {
  it("returns rows only for enabled metrics, in display order", () => {
    const preset = defaultPreset(); // words + pages enabled by default
    const m = computeMetrics("one two three", preset);
    expect(metricRows(preset, m).map((r) => r.key)).toEqual(["wordsWithSpaces", "pages"]);
  });

  it("honors a preset's custom metric order", () => {
    // Put pages before words; rows follow the stored order.
    const preset = defaultPreset({ metricOrder: ["pages", "wordsWithSpaces", ...METRIC_ORDER] });
    const m = computeMetrics("one two three", preset);
    expect(metricRows(preset, m).map((r) => r.key)).toEqual(["pages", "wordsWithSpaces"]);
  });

  it("composes status text from the metric's label and value", () => {
    const preset = defaultPreset({ showReadingTime: true });
    const rows = metricRows(preset, computeMetrics("one two three", preset));
    const status = (key: string) => rows.find((r) => r.key === key)!.statusText;

    expect(status("wordsWithSpaces")).toBe("Words: 3");
    // The reading-time unit belongs to the value, so it survives a relabel.
    expect(status("readingTime")).toBe("Reading time: 0.0 min");
  });

  it("applies custom labels to the status bar and the right-pane block", () => {
    const preset = defaultPreset();
    const m = computeMetrics("one two three", preset);
    const rows = metricRows(preset, m, undefined, undefined, {
      wordsWithSpaces: { status: "W", block: "Word count" },
    });
    const words = rows.find((r) => r.key === "wordsWithSpaces")!;

    expect(words.statusText).toBe("W: 3");
    expect(words.blockLabel).toBe("Word count");
    // Metrics without an override keep their own labels.
    expect(rows.find((r) => r.key === "pages")!.statusText).toBe("Pages: 0.0");
  });

  it("drops the label entirely when a custom label is empty", () => {
    const preset = defaultPreset({ showReadingTime: true });
    const m = computeMetrics("one two three", preset);
    const rows = metricRows(preset, m, undefined, undefined, {
      wordsWithSpaces: { status: "", block: "" },
      readingTime: { status: "" },
    });

    expect(rows.find((r) => r.key === "wordsWithSpaces")!.statusText).toBe("3");
    expect(rows.find((r) => r.key === "wordsWithSpaces")!.blockLabel).toBe("");
    // The value keeps its unit — only the label goes.
    expect(rows.find((r) => r.key === "readingTime")!.statusText).toBe("0.0 min");
  });

  it("applies custom labels to extension metrics too", () => {
    const reg = new ExtensionRegistry();
    reg.set([{
      id: "sentence-count", storeName: "Sentences", description: "", author: "t",
      type: "metric", toggleLabel: "Sentences", statusBarLabel: "Sent.",
      count: { mode: "split", separator: "[.!?]+\\s+" },
    }]);
    const preset = defaultPreset({ extMetrics: { "sentence-count": true } });
    const full = computeFull("One. Two. Three!", preset, reg);

    const plain = metricRows(preset, full.values, reg, full.ext)
      .find((r) => r.key === "sentence-count")!;
    expect(plain.statusText).toBe("Sent.: 3");
    expect(plain.blockLabel).toBe("Sentences");

    const relabelled = metricRows(preset, full.values, reg, full.ext, {
      "sentence-count": { status: "", block: "Phrases" },
    }).find((r) => r.key === "sentence-count")!;
    expect(relabelled.statusText).toBe("3");
    expect(relabelled.blockLabel).toBe("Phrases");
  });

  it("flags warning levels at 90% (orange) and 100% (red) of a warning threshold", () => {
    const preset = defaultPreset({ rules: [{ metric: "wordsWithSpaces", threshold: 10, kind: "warning" }] });
    const level = (raw: string) =>
      metricRows(preset, computeMetrics(raw, preset)).find((r) => r.key === "wordsWithSpaces")!.level;

    expect(level("a b c d e")).toBe("none");                  // 5/10
    expect(level("a b c d e f g h i")).toBe("orange");        // 9/10
    expect(level("a b c d e f g h i j")).toBe("red");         // 10/10
  });

  it("colors a goal green only once its threshold is reached", () => {
    const preset = defaultPreset({ rules: [{ metric: "wordsWithSpaces", threshold: 5, kind: "goal" }] });
    const level = (raw: string) =>
      metricRows(preset, computeMetrics(raw, preset)).find((r) => r.key === "wordsWithSpaces")!.level;

    expect(level("a b c")).toBe("none");          // 3/5 — goals stay neutral below 100%
    expect(level("a b c d e")).toBe("green");     // 5/5
    expect(level("a b c d e f")).toBe("green");   // 6/5
  });

  it("ignores a rule whose metric is not selected yet", () => {
    const preset = defaultPreset({ rules: [{ metric: "", threshold: 5, kind: "goal" }] });
    const rows = metricRows(preset, computeMetrics("a b c d e", preset));
    expect(rows.every((r) => r.level === "none")).toBe(true);
  });

  it("combines a goal and a warning on the same metric, warning zone winning over green", () => {
    const preset = defaultPreset({
      rules: [
        { metric: "wordsWithSpaces", threshold: 10, kind: "goal" },
        { metric: "wordsWithSpaces", threshold: 20, kind: "warning" },
      ],
    });
    const words = (n: number) => Array(n).fill("a").join(" ");
    const level = (n: number) =>
      metricRows(preset, computeMetrics(words(n), preset)).find((r) => r.key === "wordsWithSpaces")!.level;

    expect(level(5)).toBe("none");    // below goal
    expect(level(10)).toBe("green");  // goal reached, well below warning
    expect(level(15)).toBe("green");  // still below 90% of warning
    expect(level(18)).toBe("orange"); // ≥90% of warning — warning wins over green
    expect(level(20)).toBe("red");    // ≥warning
    expect(level(25)).toBe("red");
  });

  it("supports a fractional pages threshold", () => {
    // wordsPerPage 2 → N words = N/2 pages, so 3 words = 1.5 pages.
    const preset = defaultPreset({ wordsPerPage: 2, rules: [{ metric: "pages", threshold: 1.5, kind: "goal" }] });
    const level = (raw: string) =>
      metricRows(preset, computeMetrics(raw, preset)).find((r) => r.key === "pages")!.level;

    expect(level("a b")).toBe("none");    // 1.0 pages
    expect(level("a b c")).toBe("green"); // 1.5 pages — exactly the goal
  });
});

describe("metric ordering", () => {
  it("appends unknown/missing metrics in canonical order and drops invalid keys", () => {
    const preset = defaultPreset({ metricOrder: ["pages", "bogus", "pages"] });
    const order = effectiveMetricOrder(preset);
    // "pages" first (deduped), invalid "bogus" gone, every other metric appended once.
    expect(order[0]).toBe("pages");
    expect(order).toEqual([...new Set(order)]);                 // no duplicates
    expect([...order].sort()).toEqual([...METRIC_ORDER].sort()); // exactly the known metrics
  });

  it("falls back to the canonical order when none is stored", () => {
    const preset = defaultPreset({ metricOrder: undefined as never });
    expect(effectiveMetricOrder(preset)).toEqual([...METRIC_ORDER]);
  });

  it("moves a metric before or after a target", () => {
    const order = ["a", "b", "c", "d"];
    expect(reorderMetrics(order, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
    expect(reorderMetrics(order, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    // Dropping onto itself is a no-op.
    expect(reorderMetrics(order, "b", "b", "before")).toEqual(order);
  });

  it("includes enabled extension metrics in the order, after built-ins", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      {
        id: "x-metric", storeName: "X", description: "", author: "t",
        type: "metric", toggleLabel: "X", count: { pattern: "x", flags: "g" },
      },
    ]);
    const on = effectiveMetricOrder(defaultPreset({ extMetrics: { "x-metric": true } }), reg);
    expect(on[on.length - 1]).toBe("x-metric"); // appended after built-ins
    expect(on.filter((k) => k === "x-metric")).toHaveLength(1);
    // A disabled extension metric is not part of the order.
    expect(effectiveMetricOrder(defaultPreset(), reg)).not.toContain("x-metric");
  });
});

describe("extensions integration", () => {
  // A registry with one setting extension (strip highlights) and one metric
  // extension (count sentences on preprocessed text).
  const registry = () => {
    const reg = new ExtensionRegistry();
    reg.set([
      {
        id: "ignore-highlights", storeName: "Ignore highlights", description: "", author: "t",
        type: "setting", toggleLabel: "Ignore highlights",
        transform: { pattern: "==[^=]+==", flags: "g", replacement: "" },
      },
      {
        id: "sentence-count", storeName: "Sentence count", description: "", author: "t",
        type: "metric", toggleLabel: "Sentences",
        count: { pattern: "[.!?]+(?=\\s|$)", flags: "g", source: "preprocessed" },
      },
    ]);
    return reg;
  };

  it("applies an enabled setting transform to word/char counts", () => {
    const reg = registry();
    const raw = "keep ==hidden words here== keep";
    // Off: highlighted words are still counted (5 words).
    expect(computeMetrics(raw, defaultPreset(), reg).wordsWithSpaces).toBe(5);
    // On: the highlighted span is stripped before counting (2 words).
    const preset = defaultPreset({ extSettings: { "ignore-highlights": true } });
    expect(computeMetrics(raw, preset, reg).wordsWithSpaces).toBe(2);
  });

  it("ignore-backslash-commands strips whole-line commands but not inline ones", () => {
    const reg = new ExtensionRegistry();
    reg.set([{
      id: "ignore-backslash-commands", storeName: "Ignore backslash commands",
      description: "", author: "t", type: "setting",
      toggleLabel: "Ignore backslash commands",
      transform: {
        pattern: "^\\\\[a-zA-Z]+\\*?(?:\\[[^\\]\\n]*\\]|\\{[^\\}\\n]*\\})*[ \\t]*$",
        flags: "gm", replacement: "",
      },
    }]);
    const preset = defaultPreset({ extSettings: { "ignore-backslash-commands": true } });

    // Whole-line commands are stripped.
    expect(computeMetrics("word\n\\pagebreak\nword", preset, reg).wordsWithSpaces).toBe(2);
    // Commands with arguments on their own line are stripped too.
    expect(computeMetrics("word\n\\vspace{2cm}\nword", preset, reg).wordsWithSpaces).toBe(2);
    // Optional argument + mandatory argument.
    expect(computeMetrics("\\setlength[opt]{\\parindent}{0pt}", preset, reg).wordsWithSpaces).toBe(0);
    // Starred variant.
    expect(computeMetrics("word\n\\section*{Title}\nword", preset, reg).wordsWithSpaces).toBe(2);
    // Inline (not whole line) → NOT stripped.
    expect(computeMetrics("see \\pagebreak here", preset, reg).wordsWithSpaces).toBe(3);
    // Off: command line counts as a word.
    expect(computeMetrics("word\n\\pagebreak\nword", defaultPreset(), reg).wordsWithSpaces).toBe(3);
  });

  it("computeFull returns enabled extension metric values", () => {
    const reg = registry();
    const preset = defaultPreset({ extMetrics: { "sentence-count": true } });
    const full = computeFull("One. Two! Three?", preset, reg);
    expect(full.ext["sentence-count"]).toBe(3);
    // Built-in metrics are unaffected and still present.
    expect(full.values.wordsWithSpaces).toBe(3);
  });

  it("does not compute disabled extension metrics", () => {
    const reg = registry();
    const full = computeFull("One. Two.", defaultPreset(), reg);
    expect(full.ext["sentence-count"]).toBeUndefined();
  });

  it("computes a ratio metric from built-in values", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      {
        id: "avg-word-length", storeName: "Avg word length", description: "", author: "t",
        type: "metric", toggleLabel: "Avg word length",
        count: { mode: "ratio", numerator: "charsWithoutSpaces", denominator: "wordsWithSpaces", decimals: 1 },
      },
    ]);
    const preset = defaultPreset({ extMetrics: { "avg-word-length": true } });
    // "alpha beta" → 9 chars without spaces ÷ 2 words = 4.5
    expect(computeFull("alpha beta", preset, reg).ext["avg-word-length"]).toBe(4.5);
  });

  it("computes a ratio that references another extension metric", () => {
    const reg = new ExtensionRegistry();
    reg.set([
      {
        id: "sentence-count", storeName: "Sentence count", description: "", author: "t",
        type: "metric", toggleLabel: "Sentences",
        count: { mode: "split", source: "preprocessed", separator: "[.!?]+(?=\\s|$)" },
      },
      {
        id: "words-per-sentence", storeName: "Words per sentence", description: "", author: "t",
        type: "metric", toggleLabel: "Words per sentence",
        count: { mode: "ratio", numerator: "wordsWithSpaces", denominator: "sentence-count", decimals: 1 },
      },
    ]);
    // "a b. c d." → 4 words ÷ 2 sentences = 2.0
    const both = defaultPreset({ extMetrics: { "sentence-count": true, "words-per-sentence": true } });
    expect(computeFull("a b. c d.", both, reg).ext["words-per-sentence"]).toBe(2);
    // The denominator extension is installed but NOT connected to the preset: its
    // value is still computed as an operand, so the ratio resolves without the
    // dependency being shown (the only requirement is that it's installed).
    const onlyRatio = defaultPreset({ extMetrics: { "words-per-sentence": true } });
    const full = computeFull("a b. c d.", onlyRatio, reg);
    expect(full.ext["words-per-sentence"]).toBe(2);
    // …and the dependency does not appear among the displayed metric rows.
    expect(metricRows(onlyRatio, full.values, reg, full.ext).map((r) => r.key))
      .not.toContain("sentence-count");
  });

  it("metricRows lists enabled extension metrics after built-ins", () => {
    const reg = registry();
    const preset = defaultPreset({ extMetrics: { "sentence-count": true } });
    const full = computeFull("One. Two!", preset, reg);
    const keys = metricRows(preset, full.values, reg, full.ext).map((r) => r.key);
    expect(keys).toEqual(["wordsWithSpaces", "pages", "sentence-count"]);
  });

  it("metricRows honors a stored order that places an extension metric first", () => {
    const reg = registry();
    const preset = defaultPreset({
      extMetrics: { "sentence-count": true },
      metricOrder: ["sentence-count", ...METRIC_ORDER],
    });
    const full = computeFull("One. Two!", preset, reg);
    expect(metricRows(preset, full.values, reg, full.ext)[0].key).toBe("sentence-count");
  });

  it("metricRows carries a warning level on an extension metric row", () => {
    const reg = registry();
    const preset = defaultPreset({
      extMetrics: { "sentence-count": true },
      rules: [{ metric: "sentence-count", threshold: 2, kind: "warning" }],
    });
    const full = computeFull("One. Two!", preset, reg); // 2 sentences → 100% → red
    const row = metricRows(preset, full.values, reg, full.ext).find((r) => r.key === "sentence-count");
    expect(row?.level).toBe("red");
  });
});

describe("surfaceWarnLevel", () => {
  it("shows a level on both surfaces when method is 'both'", () => {
    expect(surfaceWarnLevel("both", "statusBar", "red")).toBe("red");
    expect(surfaceWarnLevel("both", "rightPane", "red")).toBe("red");
  });

  it("hides the level on the surface the method excludes", () => {
    expect(surfaceWarnLevel("rightPane", "statusBar", "red")).toBe("none");
    expect(surfaceWarnLevel("statusBar", "rightPane", "red")).toBe("none");
  });

  it("never upgrades a 'none' level", () => {
    expect(surfaceWarnLevel("both", "statusBar", "none")).toBe("none");
  });
});
