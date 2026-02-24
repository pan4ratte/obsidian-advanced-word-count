const en = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "New preset",
  unnamedPreset: "Unnamed",
  newPresetName: (n: number) => `Preset ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Switch to ${name}`,

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoPreset: "No preset",
  statusNoMetrics: "No metrics enabled",
  statusTooltipSingle: (name: string) => `Preset: ${name}`,
  statusTooltipCycle: (name: string) => `Active preset: ${name} — Click to cycle`,

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

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Advanced Word Count settings",
  settingsPresetsName: "Create preset",
  settingsPresetsDesc: "Use presets to set individual mertics for different writing purposes",
  settingsAddPreset: "+ Add preset",

  // Preset card header
  badgeActive: "ACTIVE",
  btnSetActive: "Set as active preset",
  btnDelete: "✕",
  btnDeleteTooltip: "Delete preset",
  inputNamePlaceholder: "Enter preset name",

  // Words per page row
  wppLabel: "Count ",
  wppSuffix: "words as one page",

  // Section headers
  sectionStatusBar: "Status bar metrics",
  sectionWordCountOptions: "Word count: advanced settings",
  sectionWordCountOptionsNote:
    "Control, what formatting elements are kept or stripped before counting words.",

  // ── Status bar metric toggles ──────────────────────────────────────────────
  toggles: {
    showWordsWithSpaces: {
      label: "Words",
      hint: "Counts words, based on the advanced settings",
    },
    showCharsWithSpaces: {
      label: "Characters (with spaces)",
      hint: "Total character count including spaces and linebreaks, based on the advanced settings",
    },
    showCharsWithoutSpaces: {
      label: "Characters (without spaces)",
      hint: "Total character count excluding all whitespace (spaces, tabs, linebreaks), based on the advanced settings",
    },
    showPages: {
      label: "Pages",
      hint: "Based on the number of words per page, specified above",
    },
    showLines: {
      label: "Lines",
      hint: "Total lines, including blank lines",
    },
    showParagraphs: {
      label: "Paragraphs",
      hint: "Blocks of text, excluding blank lines",
    },
    showMarkdownLinks: {
      label: "Markdown links",
      hint: "Counts [label](url) and (url)[label] links",
    },
    showWikiLinks: {
      label: "Wikilinks",
      hint: "Counts [[wiki]] style links",
    },
    showCitekeys: {
      label: "Citekeys",
      hint: "Counts [@citekey] references",
    },
  },

  // ── Word count option toggles ──────────────────────────────────────────────
  wordCountOptions: {
    countMdLinksAsWords: {
      label: "Count links display text",
      hint: "Off: MD links are not counted / On: [label](url) → label text is counted",
    },
    ignoreWikiLinks: {
      label: "Ignore wikilinks",
      hint: "Off: [[label]]  → label text is counted / On: wikilinks are ignored",
    },
    countWikiLinkDisplayText: {
      label: "Count wikilinks display text",
      hint: "On: [[Page|Alias]] → 'Alias' counts; [[Page]] → 'Page' counts. Has no effect if 'Ignore wikilinks' is on.",
    },
    countCitekeysAsWords: {
      label: "Count citekeys",
      hint: "Off: all citekeys are ignored / On: [@doe2020] counts as a word",
    },
    ignoreComments: {
      label: "Ignore comments",
      hint: "Off: comments (%% … %%) and (<!-- … -->) are counted / On: comments are ignored",
    },
  },
} as const;

export type Locale = typeof en;
export default en;