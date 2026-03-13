const ru = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "Новый пресет",
  unnamedPreset: "Без названия",
  newPresetName: (n: number) => `Пресет ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Переключиться на пресет ${name}`,

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoMetrics: "Нет включённых счётчиков",
  statusTooltipSingle: (name: string) => `${name}`,
  statusTooltipCycle: (name: string) => `${name}`,

  // Status bar metric labels
  statusWords: (n: number) => `Слов: ${n}`,
  statusChars: (n: number) => `Символов: ${n}`,
  statusCharsNoSpaces: (n: number) => `Символов (без пробелов): ${n}`,
  statusPages: (n: string) => `Страниц: ${n}`,
  statusLines: (n: number) => `Строк: ${n}`,
  statusParas: (n: number) => `Абзацев: ${n}`,
  statusMdLinks: (n: number) => `MD ссылок: ${n}`,
  statusWikiLinks: (n: number) => `Викиссылок: ${n}`,
  statusCitekeys: (n: number) => `Цитирований: ${n}`,

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Настройки Advanced Word Count",
  settingsDescription: "Данный плагин позволяет создавать сложные пресеты счётчиков слов, которые отображаются в строке состояния. Пресеты можно переключать нажатием на строку состояния или через палитру команд. Плагин создан с ориентацией на использование в академическом контексте, поэтому вы можете тонко настраивать подсчёт [@цитирований] и [[викиссылок]].",
  settingsPresetsName: "Создать пресет",
  settingsPresetsDesc: "Пресеты позволяют индивидуально настраивать наборы метрик для разных писательских целей",
  settingsAddPreset: "Добавить пресет",
  settingsSeparatorName: "Разделитель счётчиков",
  settingsSeparatorDesc: "Введите символы, которые будут визуально разделять метрики в строке состояния",

  // Preset card header
  badgeActive: "Активный",
  btnSetActive: "Использовать пресет",
  btnDeleteTooltip: "Удалить пресет",
  inputNamePlaceholder: "Введите имя пресета",

  // Words per page row
  wppLabel: "Считать",
  wppSuffix: "слов за одну страницу",

  // Section headers
  sectionStatusBar: "Счётчики в строке состояния",
  sectionStatusBarNote: "Выберите, какие метрики будут отображены в строке состояния",
  sectionWordCountOptions: "Слова и символы: расширенные настройки",
  sectionWordCountOptionsNote:
    "Настройте правила подсчёта элементов форматирования при подсчёте слов и символов",

  // ── Delete confirmation modal ──────────────────────────────────────────────
  deleteConfirmTitle: "Удалить пресет",
  deleteConfirmMessage: (name: string) => `Вы уверены, что хотите удалить пресет "${name}"? Это действие нельзя отменить.`,
  deleteConfirmYes: "Да, удалить",
  deleteConfirmNo: "Отменить",

  // ── Status bar metric toggles ──────────────────────────────────────────────
  toggles: {
    showWordsWithSpaces: {
      label: "Слова",
      hint: "Считает слова на основании расширенных настроек",
    },
    showCharsWithSpaces: {
      label: "Символы (с пробелами)",
      hint: "Считает символы и пробелы на основании расширенных настроек",
    },
    showCharsWithoutSpaces: {
      label: "Символы (без пробелов)",
      hint: "Считает символы на основании расширенных настроек, игнорирует пробелы",
    },
    showPages: {
      label: "Страницы",
      hint: "Считает страницы на основании количества слов на страницу, указанного выше",
    },
    showLines: {
      label: "Строки",
      hint: "Считает строки, в том числе пустые",
    },
    showParagraphs: {
      label: "Абзацы",
      hint: "Считает абзацы, исключая пустые строки",
    },
    showMarkdownLinks: {
      label: "Ссылки markdown",
      hint: "Считает ссылки [label](url) и (url)[label]",
    },
    showWikiLinks: {
      label: "Викиссылки",
      hint: "Считает ссылки [[wiki]] и [[wiki|label]]",
    },
    showCitekeys: {
      label: "Цитирования",
      hint: "Считает [@цитирования]",
    },
  },

  // ── Word count option toggles ──────────────────────────────────────────────
  wordCountOptions: {
    countMdLinksAsWords: {
      label: "Считать отображаемый текст ссылок",
      hint: `Выкл.: [label](url) → label и url будут подсчитаны
Вкл.: только label будет подсчитан`,
    },
    ignoreWikiLinks: {
      label: "Игнорировать викиссылки",
      hint: `Выкл.: викиссылки будут подсчитаны
Вкл.: викиссылки будут игнорироваться`,
    },
    countWikiLinkDisplayText: {
      label: "Считать отображаемый текст викиссылок",
      hint: `Выкл.: [[wiki|label]] → wiki и label будут подсчитаны
Вкл.: только label будет подсчитан`,
    },
    countCitekeysAsWords: {
      label: "Игнорировать ключи цитрования",
      hint: `Выкл.: ключи цитирования будут подсчитаны
Вкл.: ключи цитирования будут игнорироваться`,
    },
    ignoreComments: {
      label: "Игнорировать комментарии",
      hint: `Выкл.: текст в %% … %% и <!-- … --> будет подсчитан
Вкл.: комментарии будут игнорироваться`,
    },
  },
} as const;

export type Locale = typeof ru;
export default ru;
