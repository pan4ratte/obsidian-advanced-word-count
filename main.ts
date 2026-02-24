import { App, Plugin, PluginSettingTab, Setting, MarkdownView, ButtonComponent, setTooltip } from "obsidian";
import { t, refreshLocale } from "./locales";

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
    name: t.defaultPresetName,
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
      const first = defaultPreset({ name: t.defaultPresetName });
      this.settings.presets.push(first);
      this.settings.activePresetId = first.id;
      await this.saveSettings();
    }

    if (!this.getActivePreset()) {
      this.settings.activePresetId = this.settings.presets[0].id;
      await this.saveSettings();
    }

    refreshLocale();
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
      name: t.commandActivatePreset(preset.name),
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
      if (cmd) cmd.name = t.commandActivatePreset(preset.name);
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
    if (preset.showWordsWithSpaces)    parts.push(t.statusWords(m.wordsWithSpaces));
    if (preset.showCharsWithSpaces)      parts.push(t.statusChars(m.charsWithSpaces));
    if (preset.showPages)              parts.push(t.statusPages(m.pages));
    if (preset.showLines)              parts.push(t.statusLines(m.lines));
    if (preset.showParagraphs)         parts.push(t.statusParas(m.paragraphs));
    if (preset.showMarkdownLinks)      parts.push(t.statusMdLinks(m.markdownLinks));
    if (preset.showWikiLinks)          parts.push(t.statusWikiLinks(m.wikiLinks));
    if (preset.showCitekeys)           parts.push(t.statusCitekeys(m.citekeys));
    return parts.join("  |  ");
  }

  updateCount() {
    const preset = this.getActivePreset();
    if (!preset) { this.statusBarItem.setText(t.statusNoPreset); return; }

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
    this.statusBarItem.setText(label + (stats || t.statusNoMetrics));
    setTooltip(
      this.statusBarItem,
      this.settings.presets.length > 1
        ? t.statusTooltipCycle(preset.name)
        : t.statusTooltipSingle(preset.name),
      { placement: "top" }
    );
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
    containerEl.createEl("h2", { text: t.settingsHeading });

    new Setting(containerEl)
      .setName(t.settingsPresetsName)
      .setDesc(t.settingsPresetsDesc)
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText(t.settingsAddPreset)
          .setCta()
          .onClick(async () => {
            const preset = defaultPreset({
              name: t.newPresetName(this.plugin.settings.presets.length + 1),
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
      header.createEl("span", { text: t.badgeActive, cls: "wcp-active-badge" });
    }

    const nameInput = header.createEl("input", { type: "text" });
    nameInput.value = preset.name;
    nameInput.placeholder = t.inputNamePlaceholder;
    nameInput.addClass("wcp-name-input");
    nameInput.addEventListener("change", async () => {
      preset.name = nameInput.value.trim() || t.unnamedPreset;
      await this.save();
    });

    if (!isActive) {
      const actBtn = header.createEl("button", { text: t.btnSetActive, cls: "wcp-btn" });
      actBtn.addEventListener("click", async () => {
        await this.plugin.activatePreset(preset.id);
        this.display();
      });
    }

    const canDelete = this.plugin.settings.presets.length > 1;
    const delBtn = header.createEl("button", { text: t.btnDelete });
    setTooltip(delBtn, t.btnDeleteTooltip, { placement: "top" });
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
    wppRow.createEl("span", { text: t.wppLabel, cls: "wcp-wpp-label" });

    const wppInput = wppRow.createEl("input", { type: "number" });
    wppInput.value = String(preset.wordsPerPage);
    wppInput.min = "1";
    wppInput.addClass("wcp-wpp-input");
    wppInput.addEventListener("change", async () => {
      const n = parseInt(wppInput.value);
      if (!isNaN(n) && n > 0) { preset.wordsPerPage = n; await this.save(); }
    });
    wppRow.createEl("span", { text: t.wppSuffix, cls: "wcp-wpp-suffix" });

    // ── Status bar metrics ──────────────────────────────────────────────────
    this.sectionHeader(card, t.sectionStatusBar);

    const visGrid = card.createDiv({ cls: "wcp-toggle-grid" });

    const visToggles: { key: keyof typeof t.toggles; }[] = [
      { key: "showWordsWithSpaces" },
      { key: "showCharsWithSpaces" },
      { key: "showPages" },
      { key: "showLines" },
      { key: "showParagraphs" },
      { key: "showMarkdownLinks" },
      { key: "showWikiLinks" },
      { key: "showCitekeys" },
    ];

    for (const { key } of visToggles) {
      this.renderToggleChip(visGrid, preset, key, t.toggles[key].label, t.toggles[key].hint);
    }

    // ── Word count — include as words ───────────────────────────────────────
    this.sectionHeader(card, t.sectionWordCountOptions);

    const note = card.createEl("p", {
      text: t.sectionWordCountOptionsNote,
    });
    note.addClass("wcp-section-note");

    const wcGrid = card.createDiv({ cls: "wcp-toggle-grid-wide" });

    const wcToggles: { key: keyof typeof t.wordCountOptions; }[] = [
      { key: "countMdLinksAsWords" },
      { key: "ignoreWikiLinks" },
      { key: "countWikiLinkDisplayText" },
      { key: "countCitekeysAsWords" },
      { key: "ignoreComments" },
    ];

    for (const { key } of wcToggles) {
      this.renderToggleChip(wcGrid, preset, key, t.wordCountOptions[key].label, t.wordCountOptions[key].hint);
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
    if (hint) setTooltip(row, hint, { placement: "top" });

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