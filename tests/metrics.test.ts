import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  metricRows,
  surfaceWarnLevel,
  defaultPreset,
  Preset,
} from "../metrics";

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

  it("excludes fenced and inline code by default", () => {
    expect(count("hello ```js\ncode here``` world").wordsWithSpaces).toBe(2);
    expect(count("hello `inline code` world").wordsWithSpaces).toBe(2);
  });

  it("counts code when ignoreCode is off", () => {
    expect(count("alpha `beta` gamma", { ignoreCode: false }).wordsWithSpaces).toBe(3);
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
});

describe("structural metrics", () => {
  it("computes pages from words per page", () => {
    expect(count("one two three", { wordsPerPage: 2 }).pages).toBe("1.5");
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

  it("counts complete markdown tables", () => {
    expect(count("| H1 | H2 |\n| --- | --- |\n| a | b |").tables).toBe(1);
  });

  it("counts tags, excluding purely numeric ones and mid-word hashes", () => {
    expect(count("#todo #project/work #123 word#notag").tags).toBe(2);
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
