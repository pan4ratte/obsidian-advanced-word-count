import { App, Plugin, PluginSettingTab, Setting, MarkdownView } from "obsidian";

interface WordCountSettings {
  // Page config
  wordsPerPage: number;

  // Metric visibility toggles
  showWords: boolean;
  showPages: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
}

const DEFAULT_SETTINGS: WordCountSettings = {
  wordsPerPage: 250,
  showWords: true,
  showPages: true,
  showLines: false,
  showParagraphs: false,
  showMarkdownLinks: false,
  showWikiLinks: false,
};

interface Metrics {
  words: number;
  pages: string;
  lines: number;
  paragraphs: number;
  markdownLinks: number;
  wikiLinks: number;
}

export default class WordCountPlugin extends Plugin {
  settings: WordCountSettings;
  statusBarItem: HTMLElement;

  async onload() {
    await this.loadSettings();

    this.statusBarItem = this.addStatusBarItem();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateCount())
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.updateCount())
    );

    this.addSettingTab(new WordCountSettingTab(this.app, this));
    this.updateCount();
  }

  // ── Counters ────────────────────────────────────────────────────────────────

  countWords(text: string): number {
    const cleaned = text
      .replace(/^---[\s\S]*?---\n?/, "")       // frontmatter
      .replace(/```[\s\S]*?```/g, " ")          // fenced code blocks
      .replace(/`[^`]*`/g, " ")                // inline code
      .replace(/!\[.*?\]\(.*?\)/g, " ")         // images
      .replace(/\[.*?\]\(.*?\)/g, " ")          // md links — keep label words
      .replace(/\[\[.*?\]\]/g, " ")             // wiki links
      .replace(/#{1,6}\s/g, " ")               // headings
      .replace(/(\*\*|__)(.*?)\1/g, "$2")      // bold
      .replace(/(\*|_)(.*?)\1/g, "$2")         // italic
      .replace(/~~(.*?)~~/g, "$1")             // strikethrough
      .replace(/>\s/g, " ")                    // blockquotes
      .replace(/[-*+]\s/g, " ")                // unordered lists
      .replace(/\d+\.\s/g, " ")               // ordered lists
      .replace(/\|/g, " ")                     // table pipes
      .trim();

    if (!cleaned) return 0;
    return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
  }

  countLines(text: string): number {
    if (!text) return 0;
    return text.split("\n").length;
  }

  countParagraphs(text: string): number {
    if (!text) return 0;
    // Strip frontmatter first
    const stripped = text.replace(/^---[\s\S]*?---\n?/, "");
    // Split on one or more blank lines; filter blocks that have actual content
    return stripped
      .split(/\n{2,}/)
      .filter((block) => block.trim().length > 0).length;
  }

  countMarkdownLinks(text: string): number {
    // Matches both [label](url) and (url)[label] variants
    const standard = text.match(/\[.*?\]\(.*?\)/g) ?? [];
    const reversed = text.match(/\(.*?\)\[.*?\]/g) ?? [];
    // Exclude images which start with !
    const filtered = standard.filter((m) => !m.startsWith("!"));
    return filtered.length + reversed.length;
  }

  countWikiLinks(text: string): number {
    return (text.match(/\[\[.*?\]\]/g) ?? []).length;
  }

  // ── Status bar ──────────────────────────────────────────────────────────────

  buildStatusText(metrics: Metrics): string {
    const s = this.settings;
    const parts: string[] = [];

    if (s.showWords)         parts.push(`Words: ${metrics.words}`);
    if (s.showPages)         parts.push(`Pages: ${metrics.pages}`);
    if (s.showLines)         parts.push(`Lines: ${metrics.lines}`);
    if (s.showParagraphs)    parts.push(`Paras: ${metrics.paragraphs}`);
    if (s.showMarkdownLinks) parts.push(`MD Links: ${metrics.markdownLinks}`);
    if (s.showWikiLinks)     parts.push(`Wiki Links: ${metrics.wikiLinks}`);

    return parts.join("  |  ");
  }

  updateCount() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.statusBarItem.setText("");
      return;
    }

    const text = view.getViewData();

    const words = this.countWords(text);
    const metrics: Metrics = {
      words,
      pages: (words / this.settings.wordsPerPage).toFixed(1),
      lines: this.countLines(text),
      paragraphs: this.countParagraphs(text),
      markdownLinks: this.countMarkdownLinks(text),
      wikiLinks: this.countWikiLinks(text),
    };

    const display = this.buildStatusText(metrics);
    this.statusBarItem.setText(display || "No metrics enabled");
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateCount();
  }
}

// ── Settings Tab ─────────────────────────────────────────────────────────────

class WordCountSettingTab extends PluginSettingTab {
  plugin: WordCountPlugin;

  constructor(app: App, plugin: WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  addToggle(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof WordCountSettings
  ) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings[key] as boolean)
          .onChange(async (value) => {
            (this.plugin.settings[key] as boolean) = value;
            await this.plugin.saveSettings();
          })
      );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Page config ────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Word Count & Pages" });

    new Setting(containerEl)
      .setName("Words per page")
      .setDesc(
        "How many words equal one page. Common values: 250 (standard), 300 (academic), 500 (technical)."
      )
      .addText((text) =>
        text
          .setPlaceholder("250")
          .setValue(String(this.plugin.settings.wordsPerPage))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.wordsPerPage = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // ── Metric toggles ─────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Status Bar Metrics" });
    containerEl.createEl("p", {
      text: "Choose which metrics appear in the status bar.",
      cls: "setting-item-description",
    });

    this.addToggle(
      containerEl,
      "Word count",
      "Show the total number of words in the note.",
      "showWords"
    );

    this.addToggle(
      containerEl,
      "Page count",
      "Show the estimated number of pages based on words-per-page above.",
      "showPages"
    );

    this.addToggle(
      containerEl,
      "Line count",
      "Show the total number of lines (including blank lines).",
      "showLines"
    );

    this.addToggle(
      containerEl,
      "Paragraph count",
      "Show the number of paragraphs (blocks of text separated by blank lines).",
      "showParagraphs"
    );

    this.addToggle(
      containerEl,
      "Markdown link count",
      "Show the number of Markdown links — both [label](url) and (url)[label] formats.",
      "showMarkdownLinks"
    );

    this.addToggle(
      containerEl,
      "Wiki link count",
      "Show the number of Obsidian wiki-links [[like this]].",
      "showWikiLinks"
    );
  }
}