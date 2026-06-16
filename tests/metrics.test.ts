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

  it("excludes fenced and inline code", () => {
    expect(count("hello ```js\ncode here``` world").wordsWithSpaces).toBe(2);
    expect(count("hello `inline code` world").wordsWithSpaces).toBe(2);
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
});

describe("metricRows", () => {
  it("returns rows only for enabled metrics, in display order", () => {
    const preset = defaultPreset(); // words + pages enabled by default
    const m = computeMetrics("one two three", preset);
    expect(metricRows(preset, m).map((r) => r.key)).toEqual(["wordsWithSpaces", "pages"]);
  });

  it("flags warning levels at 90% (orange) and 100% (red) of a limit", () => {
    const preset = defaultPreset({ limits: { wordsWithSpaces: 10 } });
    const level = (raw: string) =>
      metricRows(preset, computeMetrics(raw, preset)).find((r) => r.key === "wordsWithSpaces")!.level;

    expect(level("a b c d e")).toBe("none");                  // 5/10
    expect(level("a b c d e f g h i")).toBe("orange");        // 9/10
    expect(level("a b c d e f g h i j")).toBe("red");         // 10/10
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
