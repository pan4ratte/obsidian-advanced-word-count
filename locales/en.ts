const en = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "New preset",
  unnamedPreset: "Unnamed",
  newPresetName: (n: number) => `Preset ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Switch to ${name} preset`,
  commandOpenView: "Open metrics panel",

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoMetrics: "No metrics enabled",
  statusTooltipSingle: (name: string) => `${name}`,
  statusTooltipCycle: (name: string) => `${name}`,

  // Status bar metric labels
  statusWords: (n: number) => `Words: ${n}`,
  statusChars: (n: number) => `Chars: ${n}`,
  statusCharsNoSpaces: (n: number) => `Chars (no spaces): ${n}`,
  statusPages: (n: string) => `Pages: ${n}`,
  statusLines: (n: number) => `Lines: ${n}`,
  statusParas: (n: number) => `Paras: ${n}`,
  statusMdLinks: (n: number) => `MD Links: ${n}`,
  statusWikiLinks: (n: number) => `Wikilinks: ${n}`,
  statusCitekeys: (n: number) => `Citekeys: ${n}`,
  statusEmbeds: (n: number) => `Embeds: ${n}`,
  statusTables: (n: number) => `Tables: ${n}`,
  statusTags: (n: number) => `Tags: ${n}`,

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Advanced Word Count settings",
  settingsDescription: "This plugin allows you to create complex word count presets that are displayed in the status bar. Cycle presets by clicking on the status bar or using command palette. The plugin is made with academic use cases in mind, so you can fine-tune counting of [@citekeys] and [[wikilinks]].",
  settingsSectionGeneral: "General",
  settingsSectionPresets: "Presets",
  settingsPresetsName: "Create preset",
  settingsPresetsDesc: "Use presets to set individual mertics for different writing purposes",
  settingsAddPreset: "Add preset",
  settingsSeparatorName: "Status bar metrics separator",
  settingsSeparatorDesc: "Specify the look of metrics separator by typing anything",
  settingsHideDefaultName: "Hide default Obsidian word counter",
  settingsHideDefaultDesc: "Disables Obsidian word count core plugin",
  settingsDisplayMethodName: "Counters display method",
  settingsDisplayMethodDesc: "Choose where the enabled metrics are shown",
  displayMethodStatusBar: "Status bar",
  displayMethodRightPane: "Right pane",
  displayMethodBoth: "Status bar + Right pane",
  settingsRightPaneLayoutName: "Right pane metrics layout",
  settingsRightPaneLayoutDesc: "Choose how metric blocks are arranged in the right pane",
  rightPaneLayoutOne: "One column",
  rightPaneLayoutTwo: "Two columns",
  settingsLimitWarningsDisplayName: "Limit warnings display method",
  settingsLimitWarningsDisplayDesc: "Choose where limit warnings are shown",

  // ── Right pane view ────────────────────────────────────────────────────────
  viewTitle: "Advanced Word Count",
  viewNoFile: "Open a note to see metrics",

  // Preset card header
  badgeActive: "Active",
  badgeInactive: "Inactive",
  btnDeleteTooltip: "Delete preset",
  inputNamePlaceholder: "Enter preset name",

  // Words per page row
  wppLabel: "Count",
  wppSuffix: "words as one page",

  // Section headers
  sectionStatusBar: "Counter metrics",
  sectionStatusBarNote: "Choose, which metrics will be displayed in the counter",
  sectionWordCountOptions: "Words and characters: advanced settings",
  sectionWordCountOptionsNote:
    "Fine-tune counting rules of formatting elements when words and characters are counted",

  // Warnings & goals
  limitsTitle: "Warnings and goals",
  limitsDesc: "Warning colors a metric orange when ≥90% is reached and red at ≥100%. Goal colors a metric green at ≥100%",
  warningsSubtitle: "Warnings",
  goalsSubtitle: "Goals",
  addWarning: "New warning",
  addGoal: "New goal",
  limitSelectMetric: "Select a metric…",
  btnRemoveLimit: "Remove",

  // ── Delete confirmation modal ──────────────────────────────────────────────
  deleteConfirmTitle: "Delete preset",
  deleteConfirmMessage: (name: string) => `Are you sure you want to delete "${name}" preset? This action is irreversible.`,
  deleteConfirmYes: "Yes, delete",
  deleteConfirmNo: "Cancel",

  // ── Status bar metric toggles ──────────────────────────────────────────────
  toggles: {
    showWordsWithSpaces: {
      label: "Words",
      hint: "Counts words, based on the advanced settings",
    },
    showCharsWithSpaces: {
      label: "Characters (with spaces)",
      hint: "Counts characters and spaces, based on the advanced settings",
    },
    showCharsWithoutSpaces: {
      label: "Characters (without spaces)",
      hint: "Counts characters, ignores spaces, based on the advanced settings",
    },
    showPages: {
      label: "Pages",
      hint: "Counts pages, based on the number of words per page, specified above",
    },
    showLines: {
      label: "Lines",
      hint: "Counts lines, including blank lines",
    },
    showParagraphs: {
      label: "Blocks",
      hint: "Counts blocks of text, excluding blank lines",
    },
    showMarkdownLinks: {
      label: "Markdown links",
      hint: "Counts [label](url) and (url)[label] links",
    },
    showWikiLinks: {
      label: "Wikilinks",
      hint: "Counts [[wiki]] and [[wiki|label]] links",
    },
    showCitekeys: {
      label: "Citekeys",
      hint: "Counts [@citekey] references",
    },
    showEmbeds: {
      label: "Embeds",
      hint: "Counts ![[...]] embeds",
    },
    showTables: {
      label: "Tables",
      hint: "Counts complete tables",
    },
    showTags: {
      label: "Tags",
      hint: "Counts #tags",
    },
  },

  // ── Word count option toggles ──────────────────────────────────────────────
  wordCountOptions: {
    countMdLinksAsWords: {
      label: "Count links display text",
      hint: `Off: [label](url) → label and url will be counted
On: only label will be counted`,
    },
    ignoreWikiLinks: {
      label: "Ignore wikilinks",
      hint: `Off: wikilinks text will be counted
On: wikilinks will be ignored`,
    },
    countWikiLinkDisplayText: {
      label: "Count wikilinks display text",
      hint: `Off: [[wiki|label]] → wiki and label will be counted
On: only label will be counted`,
    },
    countCitekeysAsWords: {
      label: "Ignore citekeys",
      hint: `Off: citekeys text will be counted
On: citekeys will be ignored`,
    },
    ignoreComments: {
      label: "Ignore comments",
      hint: `Off: comments %% … %% and <!-- … --> text will be counted
On: comments will be ignored`,
    },
    ignoreHtmlTags: {
      label: "Ignore HTML tags",
      hint: `Off: HTML tags like <b> … </b> are counted
On: tags are ignored, only words and symbols inside them are counted`,
    },
  },
} as const;

type Stringified<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
    ? Stringified<T[K]>
    : T[K];
};
export type Locale = Stringified<typeof en>;
export default en;
