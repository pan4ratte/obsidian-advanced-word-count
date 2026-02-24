import { App, Plugin, PluginSettingTab, Setting, MarkdownView, ButtonComponent } from "obsidian";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;

  // Page
  wordsPerPage: number;

  // Metric visibility
  showWordsWithSpaces: boolean;    // space-separated word count (was showWords)
  showCharsWithSpaces: boolean;    // total characters including spaces
  showPages: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
  showCitekeys: boolean;

  // Word count inclusions / exclusions (shared by both word metrics)
  countMdLinksAsWords: boolean;
  countWikiLinkDisplayText: boolean;
  ignoreWikiLinks: boolean;
  countCitekeysAsWords: boolean;
  ignoreComments: boolean;
}

interface WordCountSettings {
  activePresetId: string;
  presets: Preset[];
}

interface Metrics {
  wordsWithSpaces: number;
  charsWithSpaces: number;
  pages: string;
  lines: number;
  paragraphs: number;
  markdownLinks: number;
  wikiLinks: number;
  citekeys: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultPreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: crypto.randomUUID(),
    name: "Default",
    wordsPerPage: 250,
    showWordsWithSpaces: true,
    showCharsWithSpaces: false,
    showPages: true,
    showLines: false,
    showParagraphs: false,
    showMarkdownLinks: false,
    showWikiLinks: false,
    showCitekeys: false,
    countMdLinksAsWords: false,
    countWikiLinkDisplayText: false,
    ignoreWikiLinks: false,
    countCitekeysAsWords: false,
    ignoreComments: true,
    ...overrides,
  };
}

const DEFAULT_SETTINGS: WordCountSettings = {
  activePresetId: "",
  presets: [],
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class WordCountPlugin extends Plugin {
  settings: WordCountSettings;
  statusBarItem: HTMLElement;
  private registeredCommandIds: Set<string> = new Set();

  async onload() {
    await this.loadSettings();

    if (this.settings.presets.length === 0) {
      const first = defaultPreset({ name: "Default" });
      this.settings.presets.push(first);
      this.settings.activePresetId = first.id;
      await this.saveSettings();
    }

    if (!this.getActivePreset()) {
      this.settings.activePresetId = this.settings.presets[0].id;
      await this.saveSettings();
    }

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("wcp-status-bar");
    this.statusBarItem.addEventListener("click", () => this.cyclePreset());

    this.registerAllPresetCommands();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateCount())
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.updateCount())
    );

    this.addSettingTab(new WordCountSettingTab(this.app, this));
    this.updateCount();
  }

  // ── Preset helpers ────────────────────────────────────────────────────────

  getActivePreset(): Preset | undefined {
    return this.settings.presets.find(
      (p) => p.id === this.settings.activePresetId
    );
  }

  async activatePreset(id: string) {
    this.settings.activePresetId = id;
    await this.saveSettings();
    this.updateCount();
  }

  cyclePreset() {
    const presets = this.settings.presets;
    if (presets.length <= 1) return;
    const idx = presets.findIndex((p) => p.id === this.settings.activePresetId);
    const next = presets[(idx + 1) % presets.length];
    this.activatePreset(next.id);
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
      name: `Activate preset: ${preset.name}`,
      callback: () => this.activatePreset(preset.id),
    });
    this.registeredCommandIds.add(cmdId);
  }

  removePresetCommand(preset: Preset) {
    const cmdId = `word-count-activate-preset-${preset.id}`;
    (this.app as any).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
    this.registeredCommandIds.delete(cmdId);
  }

  refreshPresetCommands() {
    for (const cmdId of this.registeredCommandIds) {
      const presetId = cmdId.replace("word-count-activate-preset-", "");
      if (!this.settings.presets.find((p) => p.id === presetId)) {
        (this.app as any).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
        this.registeredCommandIds.delete(cmdId);
      }
    }
    for (const preset of this.settings.presets) {
      this.registerPresetCommand(preset);
      const fullId = `${this.manifest.id}:word-count-activate-preset-${preset.id}`;
      const cmd = (this.app as any).commands?.commands?.[fullId];
      if (cmd) cmd.name = `Activate preset: ${preset.name}`;
    }
  }

  // ── Text pre-processing ───────────────────────────────────────────────────
  //
  // Single pipeline shared by BOTH word metrics. All "include as words"
  // options are applied here, so the two counters below always agree on
  // what counts as text.

  preprocessText(raw: string, preset: Preset): string {
    let t = raw;

    // Frontmatter
    t = t.replace(/^---[\s\S]*?---\n?/, "");

    // Comments (stripped first so their content never leaks into counts)
    if (preset.ignoreComments) {
      t = t.replace(/%%[\s\S]*?%%/g, " ");
      t = t.replace(/<!--[\s\S]*?-->/g, " ");
    }

    // Code blocks (always excluded)
    t = t.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

    // Images (always excluded)
    t = t.replace(/!\[.*?\]\(.*?\)/g, " ");

    // Markdown links — keep label text or strip
    if (preset.countMdLinksAsWords) {
      t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // [label](url) → label
      t = t.replace(/\([^)]*\)\[([^\]]*)\]/g, "$1"); // (url)[label] → label
    } else {
      t = t.replace(/\[.*?\]\(.*?\)/g, " ");
      t = t.replace(/\(.*?\)\[.*?\]/g, " ");
    }

    // Wiki links
    if (preset.ignoreWikiLinks) {
      // Strip entirely — overrides display-text setting
      t = t.replace(/\[\[.*?\]\]/g, " ");
    } else if (preset.countWikiLinkDisplayText) {
      // [[Page|Alias]] → "Alias", [[Page]] → "Page"
      t = t.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, page, alias) =>
        (alias.trim() || page.trim()).replace(/#.*$/, "").trim()
      );
    } else {
      t = t.replace(/\[\[.*?\]\]/g, " ");
    }

    // Citekeys — keep as word token or strip
    if (preset.countCitekeysAsWords) {
      t = t.replace(/\[@([^\]]+)\]/g, "$1");
    } else {
      t = t.replace(/\[@[^\]]*\]/g, " ");
    }

    // Strip remaining Markdown decoration
    t = t
      .replace(/#{1,6}\s/g, " ")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/>\s/g, " ")
      .replace(/[-*+]\s/g, " ")
      .replace(/\d+\.\s/g, " ")
      .replace(/\|/g, " ");

    return t;
  }

  // ── Counters ──────────────────────────────────────────────────────────────

  /** Traditional word count: space-separated tokens after preprocessing. */
  countWordsWithSpaces(preprocessed: string): number {
    const trimmed = preprocessed.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter((w) => w.length > 0).length;
  }


  /** Total character count including spaces, after preprocessing. */
  countCharsWithSpaces(preprocessed: string): number {
    return preprocessed.replace(/\n/g, "").length;
  }

  countLines(text: string): number {
    return text ? text.split("\n").length : 0;
  }

  countParagraphs(text: string): number {
    if (!text) return 0;
    const stripped = text.replace(/^---[\s\S]*?---\n?/, "");
    return stripped.split(/\n{2,}/).filter((b) => b.trim().length > 0).length;
  }

  countMarkdownLinks(text: string): number {
    const standard = (text.match(/\[.*?\]\(.*?\)/g) ?? []).filter(
      (m) => !m.startsWith("!")
    );
    const reversed = text.match(/\(.*?\)\[.*?\]/g) ?? [];
    return standard.length + reversed.length;
  }

  countWikiLinks(text: string): number {
    return (text.match(/\[\[.*?\]\]/g) ?? []).length;
  }

  countCitekeys(text: string): number {
    return (text.match(/\[@[^\]]+\]/g) ?? []).length;
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  buildStatusText(preset: Preset, m: Metrics): string {
    const parts: string[] = [];
    if (preset.showWordsWithSpaces)    parts.push(`Words: ${m.wordsWithSpaces}`);
    if (preset.showCharsWithSpaces)      parts.push(`Chars: ${m.charsWithSpaces}`);
    if (preset.showPages)              parts.push(`Pages: ${m.pages}`);
    if (preset.showLines)              parts.push(`Lines: ${m.lines}`);
    if (preset.showParagraphs)         parts.push(`Paras: ${m.paragraphs}`);
    if (preset.showMarkdownLinks)      parts.push(`MD Links: ${m.markdownLinks}`);
    if (preset.showWikiLinks)          parts.push(`Wiki Links: ${m.wikiLinks}`);
    if (preset.showCitekeys)           parts.push(`Citekeys: ${m.citekeys}`);
    return parts.join("  |  ");
  }

  updateCount() {
    const preset = this.getActivePreset();
    if (!preset) { this.statusBarItem.setText("No preset"); return; }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { this.statusBarItem.setText(""); return; }

    const raw = view.getViewData();
    const preprocessed = this.preprocessText(raw, preset);

    const wordsWithSpaces = this.countWordsWithSpaces(preprocessed);

    const metrics: Metrics = {
      wordsWithSpaces,
      charsWithSpaces: this.countCharsWithSpaces(preprocessed),
      // Page count is driven by the space-separated word count
      pages: (wordsWithSpaces / preset.wordsPerPage).toFixed(1),
      lines: this.countLines(raw),
      paragraphs: this.countParagraphs(raw),
      markdownLinks: this.countMarkdownLinks(raw),
      wikiLinks: this.countWikiLinks(raw),
      citekeys: this.countCitekeys(raw),
    };

    const label = this.settings.presets.length > 1 ? `[${preset.name}]  ` : "";
    const stats = this.buildStatusText(preset, metrics);
    this.statusBarItem.setText(label + (stats || "No metrics enabled"));
    this.statusBarItem.title =
      this.settings.presets.length > 1
        ? `Active preset: ${preset.name} — Click to cycle`
        : `Preset: ${preset.name}`;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class WordCountSettingTab extends PluginSettingTab {
  plugin: WordCountPlugin;

  constructor(app: App, plugin: WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async save() {
    this.plugin.refreshPresetCommands();
    await this.plugin.saveSettings();
    this.plugin.updateCount();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Word Count & Pages" });

    new Setting(containerEl)
      .setName("Presets")
      .setDesc("Each preset has its own metrics and becomes a command palette command.")
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText("+ Add preset")
          .setCta()
          .onClick(async () => {
            const preset = defaultPreset({
              name: `Preset ${this.plugin.settings.presets.length + 1}`,
            });
            this.plugin.settings.presets.push(preset);
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

    const card = containerEl.createDiv({ cls: "wcp-preset-card" });
    if (isActive) card.addClass("is-active");

    // ── Header ──────────────────────────────────────────────────────────────
    const header = card.createDiv({ cls: "wcp-preset-header" });

    if (isActive) {
      header.createEl("span", { text: "ACTIVE", cls: "wcp-active-badge" });
    }

    const nameInput = header.createEl("input", { type: "text" });
    nameInput.value = preset.name;
    nameInput.placeholder = "Preset name";
    nameInput.addClass("wcp-name-input");
    nameInput.addEventListener("change", async () => {
      preset.name = nameInput.value.trim() || "Unnamed";
      await this.save();
    });

    if (!isActive) {
      const actBtn = header.createEl("button", { text: "Set active", cls: "wcp-btn" });
      actBtn.addEventListener("click", async () => {
        await this.plugin.activatePreset(preset.id);
        this.display();
      });
    }

    const canDelete = this.plugin.settings.presets.length > 1;
    const delBtn = header.createEl("button", { text: "✕" });
    delBtn.title = "Delete preset";
    delBtn.addClass("wcp-btn", "wcp-btn-delete");
    if (!canDelete) delBtn.addClass("is-disabled");
    delBtn.addEventListener("click", async () => {
      if (!canDelete) return;
      this.plugin.removePresetCommand(preset);
      this.plugin.settings.presets = this.plugin.settings.presets.filter(
        (p) => p.id !== preset.id
      );
      if (this.plugin.settings.activePresetId === preset.id) {
        this.plugin.settings.activePresetId = this.plugin.settings.presets[0].id;
      }
      await this.save();
      this.display();
    });

    // ── Words per page ──────────────────────────────────────────────────────
    const wppRow = card.createDiv({ cls: "wcp-wpp-row" });
    wppRow.createEl("span", { text: "Words per page:", cls: "wcp-wpp-label" });

    const wppInput = wppRow.createEl("input", { type: "number" });
    wppInput.value = String(preset.wordsPerPage);
    wppInput.min = "1";
    wppInput.addClass("wcp-wpp-input");
    wppInput.addEventListener("change", async () => {
      const n = parseInt(wppInput.value);
      if (!isNaN(n) && n > 0) { preset.wordsPerPage = n; await this.save(); }
    });
    wppRow.createEl("span", { text: "words = 1 page", cls: "wcp-wpp-suffix" });

    // ── Status bar metrics ──────────────────────────────────────────────────
    this.sectionHeader(card, "Status bar metrics");

    const visGrid = card.createDiv({ cls: "wcp-toggle-grid" });

    const visToggles: { key: keyof Preset; label: string; hint: string }[] = [
      {
        key: "showWordsWithSpaces",
        label: "Words (with spaces)",
        hint: "Space-separated word count, same as most word processors. Page count is based on this metric.",
      },
      {
        key: "showCharsWithSpaces",
        label: "Chars (with spaces)",
        hint: "Total character count including spaces. 'hello world' counts as 11.",
      },
      { key: "showPages",         label: "Page count",       hint: "Estimated pages = words ÷ words-per-page." },
      { key: "showLines",         label: "Line count",       hint: "Total lines including blank lines." },
      { key: "showParagraphs",    label: "Paragraph count",  hint: "Blocks of text separated by blank lines." },
      { key: "showMarkdownLinks", label: "Markdown links",   hint: "Count of [label](url) and (url)[label] links." },
      { key: "showWikiLinks",     label: "Wiki links",       hint: "Count of [[wiki]] style links." },
      { key: "showCitekeys",      label: "Citekeys",         hint: "Count of [@citekey] citation references." },
    ];

    for (const t of visToggles) {
      this.renderToggleChip(visGrid, preset, t.key, t.label, t.hint);
    }

    // ── Word count — include as words ───────────────────────────────────────
    this.sectionHeader(card, "Word count — include as words");

    const note = card.createEl("p", {
      text: "These options apply to both word metrics above. They control what text is kept or stripped before counting.",
    });
    note.addClass("wcp-section-note");

    const wcGrid = card.createDiv({ cls: "wcp-toggle-grid-wide" });

    const wcToggles: { key: keyof Preset; label: string; hint: string }[] = [
      {
        key: "countMdLinksAsWords",
        label: "MD link labels",
        hint: "On: [label](url) → label text counts. Off: entire link is stripped.",
      },
      {
        key: "ignoreWikiLinks",
        label: "Ignore wiki links entirely",
        hint: "Strip [[…]] completely. When on, the display text option below has no effect.",
      },
      {
        key: "countWikiLinkDisplayText",
        label: "Wiki link display text",
        hint: "On: [[Page|Alias]] → 'Alias' counts; [[Page]] → 'Page' counts. Has no effect if 'Ignore wiki links' is on.",
      },
      {
        key: "countCitekeysAsWords",
        label: "Citekey tokens",
        hint: "On: [@doe2020] → 'doe2020' counts as a word. Off: stripped entirely.",
      },
      {
        key: "ignoreComments",
        label: "Ignore comments",
        hint: "Strip Obsidian comments (%% … %%) and HTML comments (<!-- … -->) before counting.",
      },
    ];

    for (const t of wcToggles) {
      this.renderToggleChip(wcGrid, preset, t.key, t.label, t.hint);
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  sectionHeader(parent: HTMLElement, text: string) {
    parent.createEl("p", { text, cls: "wcp-section-header" });
  }

  renderToggleChip(
    parent: HTMLElement,
    preset: Preset,
    key: keyof Preset,
    label: string,
    hint?: string
  ) {
    const row = parent.createDiv({ cls: "wcp-toggle-chip" });
    if (hint) row.title = hint;

    row.createEl("span", { text: label, cls: "wcp-toggle-label" });

    const toggle = row.createDiv({ cls: "checkbox-container" });
    if (preset[key]) toggle.addClass("is-enabled");

    row.addEventListener("click", async () => {
      (preset[key] as boolean) = !(preset[key] as boolean);
      toggle.toggleClass("is-enabled", preset[key] as boolean);
      await this.save();
    });
  }
}