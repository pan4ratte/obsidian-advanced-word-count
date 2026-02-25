import { App, Modal, Plugin, PluginSettingTab, Setting, MarkdownView, ButtonComponent, setIcon, setTooltip } from "obsidian";
import { t, refreshLocale } from "./locales";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;

  // Page
  wordsPerPage: number;

  // Metric visibility
  showWordsWithSpaces: boolean;    // space-separated word count
  showCharsWithSpaces: boolean;    // total characters including spaces and linebreaks
  showCharsWithoutSpaces: boolean; // total characters excluding all whitespace
  showPages: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
  showCitekeys: boolean;

  // Word count inclusions / exclusions (shared by both word and char metrics)
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
  charsWithoutSpaces: number;
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
    showCharsWithoutSpaces: false,
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

    // Ensure at least one preset exists and activePresetId is valid
    if (this.settings.presets.length === 0) {
      const first = defaultPreset({ name: t.defaultPresetName });
      this.settings.presets.push(first);
      this.settings.activePresetId = first.id;
      await this.saveSettings();
    } else if (!this.getActivePreset()) {
      this.settings.activePresetId = this.settings.presets[0].id;
      await this.saveSettings();
    }

    refreshLocale();
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("wcp-status-bar");
    this.statusBarItem.addEventListener("click", () => this.cyclePreset());

    this.registerAllPresetCommands();

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateCount()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.updateCount()));

    this.addSettingTab(new WordCountSettingTab(this.app, this));
    this.updateCount();
  }

  // ── Preset helpers ────────────────────────────────────────────────────────

  getActivePreset(): Preset | undefined {
    return this.settings.presets.find((p) => p.id === this.settings.activePresetId);
  }

  async activatePreset(id: string) {
    this.settings.activePresetId = id;
    await this.saveSettings();
    this.updateCount();
  }

  cyclePreset() {
    const { presets } = this.settings;
    if (presets.length <= 1) return;
    const idx = presets.findIndex((p) => p.id === this.settings.activePresetId);
    this.activatePreset(presets[(idx + 1) % presets.length].id);
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
    // Collect stale IDs first to avoid mutating the Set during iteration
    const stale = [...this.registeredCommandIds].filter(
      (cmdId) => !this.settings.presets.find((p) => p.id === cmdId.replace("word-count-activate-preset-", ""))
    );
    for (const cmdId of stale) {
      (this.app as any).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
      this.registeredCommandIds.delete(cmdId);
    }

    for (const preset of this.settings.presets) {
      this.registerPresetCommand(preset);
      const cmd = (this.app as any).commands?.commands?.[`${this.manifest.id}:word-count-activate-preset-${preset.id}`];
      if (cmd) cmd.name = t.commandActivatePreset(preset.name);
    }
  }

  // ── Text pre-processing ───────────────────────────────────────────────────

  private preprocessBase(raw: string, preset: Preset): string {
    let s = raw;

    // Frontmatter
    s = s.replace(/^---[\s\S]*?---\n?/, "");

    // Comments (stripped first so their content never leaks into counts)
    if (preset.ignoreComments) {
      s = s.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
    }

    // Code blocks (always excluded)
    s = s.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

    // Images (always excluded)
    s = s.replace(/!\[.*?\]\(.*?\)/g, "");

    // Markdown links — keep label text or strip
    if (preset.countMdLinksAsWords) {
      s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
      s = s.replace(/\([^)]*\)\[([^\]]*)\]/g, "$1");
    } else {
      s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, label, url) => `${label} ${url.trim()}`.trim());
      s = s.replace(/\(([^)]*)\)\[([^\]]*)\]/g, (_, url, label) => `${label} ${url.trim()}`.trim());
    }

    // Wiki links
    if (preset.ignoreWikiLinks) {
      // Strip entirely
      s = s.replace(/\[\[.*?\]\]/g, "");
    } else if (preset.countWikiLinkDisplayText) {
      // [[Page|Alias]] → "Alias", [[Page]] → "Page"
      s = s.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, page, alias) =>
        (alias.trim() || page.trim()).replace(/#.*$/, "").trim()
      );
    } else {
      // Count every word inside: [[Page#Heading|Alias]] → "Page Heading Alias"
      s = s.replace(/\[\[([^\]]*)\]\]/g, (_, inner) =>
        inner.replace(/[|#]/g, " ").trim()
      );
    }

    // Citekeys — keep as word token or strip
    if (preset.countCitekeysAsWords) {
      s = s.replace(/\[@([^\]]+)\]/g, "$1");
    } else {
      s = s.replace(/\[@[^\]]*\]/g, "");
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

  preprocessText(raw: string, preset: Preset): string {
    // Build the base (no list markers yet), then strip them for word counting.
    let s = this.preprocessBase(raw, preset);

    s = s
      .replace(/[-*+]\s/g, "")
      .replace(/\d+\.\s/g, "");

    return s;
  }

  // ── Counters ──────────────────────────────────────────────────────────────

  /** Traditional word count: space-separated tokens after preprocessing. */
  countWordsWithSpaces(preprocessed: string): number {
    const trimmed = preprocessed.trim();
    // split(/\s+/) on a non-empty trimmed string never produces empty tokens
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  private substituteListMarkers(base: string, countSpaces: boolean): string {
    const u = countSpaces ? "\x01\x02"      : "\x01";        // unordered / checkbox
    const n = countSpaces ? "\x01\x02\x03"  : "\x01\x02";   // numbered
    return base
      .replace(/^- \[[ x]\] /gm, u)   // checkbox
      .replace(/^[*\-+] /gm,     u)   // unordered
      .replace(/^\d+\. /gm,      n)   // numbered (dot)
      .replace(/^\d+\) /gm,      n);  // numbered (paren)
  }

  /** Character count including spaces and linebreaks, after preprocessing. */
  countCharsWithSpaces(base: string): number {
    return this.substituteListMarkers(base, true).length;
  }

  /** Character count excluding all whitespace, after preprocessing. */
  countCharsWithoutSpaces(base: string): number {
    return this.substituteListMarkers(base, false).replace(/\s/g, "").length;
  }

  countLines(text: string): number {
    return text ? text.split("\n").length : 0;
  }

  countParagraphs(text: string): number {
    if (!text) return 0;
    return text
      .replace(/^---[\s\S]*?---\n?/, "")
      .split(/\n{2,}/)
      .filter((b) => b.trim().length > 0).length;
  }

  countMarkdownLinks(text: string): number {
    const standard = (text.match(/\[.*?\]\(.*?\)/g) ?? []).filter((m) => !m.startsWith("!"));
    return standard.length + (text.match(/\(.*?\)\[.*?\]/g) ?? []).length;
  }

  countWikiLinks(text: string): number {
    return (text.match(/\[\[.*?\]\]/g) ?? []).length;
  }

  countCitekeys(text: string): number {
    return (text.match(/\[@[^\]]+\]/g) ?? []).length;
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  buildStatusText(preset: Preset, m: Metrics): string {
    const parts: string[] = (
      [
        [preset.showWordsWithSpaces,    t.statusWords(m.wordsWithSpaces)],
        [preset.showCharsWithSpaces,    t.statusChars(m.charsWithSpaces)],
        [preset.showCharsWithoutSpaces, t.statusCharsNoSpaces(m.charsWithoutSpaces)],
        [preset.showPages,              t.statusPages(m.pages)],
        [preset.showLines,              t.statusLines(m.lines)],
        [preset.showParagraphs,         t.statusParas(m.paragraphs)],
        [preset.showMarkdownLinks,      t.statusMdLinks(m.markdownLinks)],
        [preset.showWikiLinks,          t.statusWikiLinks(m.wikiLinks)],
        [preset.showCitekeys,           t.statusCitekeys(m.citekeys)],
      ] as [boolean, string][]
    ).filter(([show]) => show).map(([, text]) => text);

    return parts.join("  |  ");
  }

  updateCount() {
    const preset = this.getActivePreset();
    if (!preset) { this.statusBarItem.setText(t.statusNoPreset); return; }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { this.statusBarItem.setText(""); return; }

    const raw = view.getViewData();
    const base = this.preprocessBase(raw, preset);
    const preprocessed = this.preprocessText(raw, preset);
    const wordsWithSpaces = this.countWordsWithSpaces(preprocessed);

    const metrics: Metrics = {
      wordsWithSpaces,
      charsWithSpaces: this.countCharsWithSpaces(base),
      charsWithoutSpaces: this.countCharsWithoutSpaces(base),
      pages: (wordsWithSpaces / preset.wordsPerPage).toFixed(1),
      lines: this.countLines(raw),
      paragraphs: this.countParagraphs(raw),
      markdownLinks: this.countMarkdownLinks(raw),
      wikiLinks: this.countWikiLinks(raw),
      citekeys: this.countCitekeys(raw),
    };

    const multiPreset = this.settings.presets.length > 1;
    const label = multiPreset ? `[${preset.name}]  ` : "";
    const stats = this.buildStatusText(preset, metrics);
    this.statusBarItem.setText(label + (stats || t.statusNoMetrics));
    setTooltip(
      this.statusBarItem,
      multiPreset ? t.statusTooltipCycle(preset.name) : t.statusTooltipSingle(preset.name),
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
    containerEl.createEl("p", { text: t.settingsDescription, cls: "wcp-section-note" });

    new Setting(containerEl)
      .setName(t.settingsPresetsName)
      .setDesc(t.settingsPresetsDesc)
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText(t.settingsAddPreset).setCta().onClick(async () => {
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
    const card = containerEl.createDiv({ cls: `wcp-preset-card${isActive ? " is-active" : ""}` });

    // ── Header ──────────────────────────────────────────────────────────────
    const header = card.createDiv({ cls: "wcp-preset-header" });

    if (isActive) header.createEl("span", { text: t.badgeActive, cls: "wcp-active-badge" });

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

    const delBtn = header.createEl("button");
    setIcon(delBtn, "trash-2");
    setTooltip(delBtn, t.btnDeleteTooltip, { placement: "top" });
    delBtn.addClass("wcp-btn", "wcp-btn-delete");
    delBtn.addEventListener("click", () => {
      new DeleteConfirmModal(this.plugin.app, preset.name, async () => {
        this.plugin.removePresetCommand(preset);
        this.plugin.settings.presets = this.plugin.settings.presets.filter((p) => p.id !== preset.id);
        if (this.plugin.settings.activePresetId === preset.id) {
          this.plugin.settings.activePresetId = this.plugin.settings.presets[0]?.id ?? "";
        }
        await this.save();
        this.display();
      }).open();
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
    card.createEl("p", { text: t.sectionStatusBarNote, cls: "wcp-section-note" });

    const visGrid = card.createDiv({ cls: "wcp-toggle-grid" });
    for (const key of Object.keys(t.toggles) as (keyof typeof t.toggles)[]) {
      this.renderToggleChip(visGrid, preset, key as keyof Preset, t.toggles[key].label, t.toggles[key].hint);
    }

    // ── Word count options ──────────────────────────────────────────────────
    this.sectionHeader(card, t.sectionWordCountOptions);
    card.createEl("p", { text: t.sectionWordCountOptionsNote, cls: "wcp-section-note" });

    const wcGrid = card.createDiv({ cls: "wcp-toggle-grid-wide" });
    for (const key of Object.keys(t.wordCountOptions) as (keyof typeof t.wordCountOptions)[]) {
      this.renderToggleChip(wcGrid, preset, key as keyof Preset, t.wordCountOptions[key].label, t.wordCountOptions[key].hint);
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  sectionHeader(parent: HTMLElement, text: string) {
    parent.createEl("p", { text, cls: "wcp-section-header" });
  }

  renderToggleChip(parent: HTMLElement, preset: Preset, key: keyof Preset, label: string, hint?: string) {
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

// ── Delete confirmation modal ─────────────────────────────────────────────────

class DeleteConfirmModal extends Modal {
  private presetName: string;
  private onConfirm: () => void;

  constructor(app: App, presetName: string, onConfirm: () => void) {
    super(app);
    this.presetName = presetName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t.deleteConfirmTitle });
    contentEl.createEl("p", { text: t.deleteConfirmMessage(this.presetName) });

    const btnRow = contentEl.createDiv({ cls: "wcp-modal-buttons" });

    btnRow.createEl("button", { text: t.deleteConfirmNo })
      .addEventListener("click", () => this.close());

    const confirmBtn = btnRow.createEl("button", { text: t.deleteConfirmYes });
    confirmBtn.addClass("mod-warning");
    confirmBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
