const ru = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "Новый пресет",
  unnamedPreset: "Без названия",
  newPresetName: (n: number) => `Пресет ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Переключиться на пресет ${name}`,
  commandOpenView: "Открыть панель счётчиков",

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoMetrics: "Нет включённых счётчиков",
  statusTooltipSingle: (name: string) => `${name}`,
  statusTooltipCycle: (name: string) => `${name}`,

  // Status bar metric labels
  statusLabels: {
    wordsWithSpaces: "Слов",
    charsWithSpaces: "Символов",
    charsWithoutSpaces: "Символов (без пробелов)",
    pages: "Страниц",
    readingTime: "Время чтения",
    lines: "Строк",
    paragraphs: "Абзацев",
    markdownLinks: "MD ссылок",
    wikiLinks: "Викиссылок",
    citekeys: "Цитирований",
    embeds: "Вложений",
    footnotes: "Сносок",
  },
  statusReadingTimeUnit: "мин",

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Настройки Advanced Word Count",
  settingsDescription: "Данный плагин позволяет создавать сложные пресеты счётчиков слов для строки состояния или правой боковой панели, переключаться между ними одним нажатием, ставить цели и предупреждения о достижении лимитов и многое другое. Благодаря расширениям сообщества — пресетам, метрикам и расширенным настройкам — плагин гибко настраивается под писательские, научные и другие цели.",
  settingsSectionGeneral: "Основные",
  settingsSectionPresets: "Пресеты и расширения",
  settingsPresetsStoreName: "Управление пресетами и расширениями",
  settingsPresetsStoreDesc: "Создавайте собственные пресеты счётчиков или устанавливайте пресеты, метриками и настройки сообщества.",
  settingsAddPreset: "Создать пресет",
  settingsSeparatorName: "Разделитель метрик в строке состояния",
  settingsSeparatorDesc: "Введите символы, которые будут визуально разделять метрики в строке состояния",
  settingsHideDefaultName: "Скрыть стандартный счётчик слов Obsidian",
  settingsHideDefaultDesc: "Отключает встроенный плагин подсчёта слов Obsidian",
  settingsDisplayMethodName: "Способ отображения счётчиков",
  settingsDisplayMethodDesc: "Выберите, где будут отображаться пресеты счётчиков",
  displayMethodStatusBar: "Строка состояния",
  displayMethodRightPane: "Правая панель",
  displayMethodBoth: "Строка состояния + Правая панель",
  settingsRightPaneLayoutName: "Макет счётчиков в правой панели",
  settingsRightPaneLayoutDesc: "Выберите, каким образом метрики будут отображаться в правой панели",
  rightPaneLayoutOne: "Один столбец",
  rightPaneLayoutTwo: "Два столбца",
  settingsLimitWarningsDisplayName: "Способ отображения предупреждений о лимитах",
  settingsLimitWarningsDisplayDesc: "Выберите, где будут показаны предупреждения о лимитах",

  // ── Right pane view ────────────────────────────────────────────────────────
  viewTitle: "Advanced Word Count",
  viewNoFile: "Откройте заметку, чтобы увидеть метрики",

  // Preset card header
  badgeActive: "Активный",
  badgeInactive: "Неактивный",
  btnShareTooltip: "Поделиться пресетом (экспорт файлов для предложения в каталог)",
  btnDeleteTooltip: "Удалить пресет",
  inputNamePlaceholder: "Введите имя пресета",
  presetExportedNotice: (name: string) =>
    `Пресет "${name}" экспортирован: файл пресета + запись для индекса.`,

  // Preset export dialog
  exportModalTitle: "Поделиться пресетом",
  exportFieldName: "Название пресета (на английском)",
  exportFieldAuthor: "Автор",
  exportAuthorPlaceholder: "Ваше имя или ник",
  exportFieldDescription: "Описание (на английском)",
  exportLocalizedNote: "Заполнение полей ниже не обязательно: если оставить их пустыми, будет использован английский текст.",
  exportFieldNameRu: "Название пресета (на русском)",
  exportFieldDescriptionRu: "Описание (на русском)",
  exportInstruction: "После экспорта вы получите два файла и сможете добавить свой пресет в магазин сообщества: загрузите файл пресета в репозиторий как есть, а содержимое файла записи вставьте в конец файла index.json в репозитории.",
  exportConfirm: "Экспортировать",
  exportCancel: "Отмена",
  exportOpenRepo: "Открыть репозиторий",
  exportMissingFields: "Сначала заполните название пресета, автора и описание.",

  // Words per page row
  wppLabel: "Считать",
  wppSuffix: "слов за одну страницу",

  // Reading time speed selector
  readingTimeUnit: "МИН.",
  readingTimeLabel: "Рассчитать время чтения для:",
  readingSpeedAverage: "Средний читатель (250 сл/мин)",
  readingSpeedFast: "Быстрый читатель (400 сл/мин)",
  readingSpeedComplex: "Сложный текст (150 сл/мин)",

  // Section headers
  sectionStatusBar: "Метрики",
  sectionStatusBarNote: "Выберите, какие метрики будут отображены в счётчике или подключите расширения сообщества, установленные из магазина",
  sectionWordCountOptions: "Слова и символы: расширенные настройки",
  sectionWordCountOptionsNote:"Настройте правила подсчёта элементов форматирования при подсчёте слов и символов или подключите расширения сообщества, установленные из магазина",

  // Warnings & goals
  limitsTitle: "Предупреждения и цели",
  limitsDesc: "Предупреждение окрашивает метрику в оранжевый при достижении ≥90%, в красный при ≥100%. Цель окрашивает метрику в зелёный при ≥100%",
  warningsSubtitle: "Предупреждения",
  goalsSubtitle: "Цели",
  addWarning: "Новое предупреждение",
  addGoal: "Новая цель",
  limitSelectMetric: "Выберите метрику…",
  btnRemoveLimit: "Удалить",

  // ── Delete confirmation modal ──────────────────────────────────────────────
  deleteConfirmTitle: "Удалить пресет",
  deleteConfirmMessage: (name: string) => `Вы уверены, что хотите удалить пресет "${name}"? Это действие нельзя отменить.`,
  deleteConfirmYes: "Да, удалить",
  deleteConfirmNo: "Отменить",

  // ── Extensions ─────────────────────────────────────────────────────────────
  settingsBrowseExtensions: "Магазин расширений",
  settingsAutoUpdateExtensionsName: "Автоматически обновлять расширения сообщества",
  settingsAutoUpdateExtensionsDesc:"Проверять обновления устанавленных расширений сообщества при запуске Obsidian",
  extAutoUpdatedNotice: (count: number) => {
    const m10 = count % 10, m100 = count % 100;
    const word = m10 === 1 && m100 !== 11 ? "расширение"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "расширения"
      : "расширений";
    return `Обновлено ${count} ${word}`;
  },

  // ── Пользовательские названия ──────────────────────────────────────────────
  settingsCustomLabelsName: "Изменить названия метрик",
  settingsCustomLabelsDesc: "Поменяйте названия любых метрик на удобные вам",
  settingsCustomLabelsButton: "Менеджер лейблов",
  labelsModalTitle: "Менеджер лейблов метрик",
  labelsModalNote: "Переименуйте любую метрику или очистите поле, чтобы полностью убрать её название.",
  labelsSearchPlaceholder: "Поиск метрик…",
  labelsFilterAll: "Все",
  labelsFilterBuiltin: "Встроенные",
  labelsFilterDownloaded: "Загруженные",
  labelsTypeBuiltin: "Встроенная метрика",
  labelsTypeDownloaded: "Загруженная метрика",
  labelsFieldStatusBar: "Строка состояния",
  labelsFieldRightPane: "Правая панель",
  labelsNoLabelPlaceholder: "Без названия",
  labelsReset: "Вернуть исходное",
  labelsNoResults: "Нет метрик по вашему запросу",

  // Browse modal
  extModalTitle: "Магазин расширений",
  extSearchPlaceholder: "Поиск расширений…",
  extLoading: "Загружаем расширения…",
  extLoadError: "Не удалось загрузить расширения: проверьте подключение и попробуйте снова",
  extRetry: "Повторить",
  extNoResults: "Нет расширений по вашему запросу",
  extEmptyCatalogue: "Пока нет доступных расширений",
  extInstall: "Установить",
  extInstallPreset: "Добавить пресет",
  extUpdate: "Обновить",
  extInstalling: "Установка…",
  extTypeMetric: "Метрика",
  extTypeSetting: "Настройка",
  extTypePreset: "Пресет",
  extUninstall: "Удалить",
  extByAuthor: (author: string) => `Автор: ${author}`,
  extInstalledNotice: (name: string) => `Установлено: "${name}"`,
  extInstalledWithDepsNotice: (name: string, deps: number) => {
    const m10 = deps % 10, m100 = deps % 100;
    const word = m10 === 1 && m100 !== 11 ? "зависимость"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "зависимости"
      : "зависимостей";
    return `Установлено: "${name}" и ${deps} ${word}`;
  },
  extPresetInstalledNotice: (name: string, exts: number) => {
    if (exts === 0) return `Добавлен пресет "${name}"`;
    const m10 = exts % 10, m100 = exts % 100;
    const word = m10 === 1 && m100 !== 11 ? "расширение"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "расширения"
      : "расширений";
    return `Добавлен пресет "${name}" и ${exts} ${word}`;
  },
  extInstallFailed: (msg: string) => `Ошибка установки: ${msg}`,
  extUninstalledNotice: (name: string) => `Удалено: "${name}"`,
  extUninstallFailed: (msg: string) => `Ошибка удаления: ${msg}`,
  extUninstallConfirmTitle: "Удалить расширение?",
  extUninstallConfirmMessage: (name: string, dependents: string) =>
    `Расширение "${name}" требуется для ${dependents}. После удаления ${dependents.indexOf(",") === -1 ? "оно может" : "они могут"} перестать работать.`,
  extUninstallConfirmYes: "Всё равно удалить",
  extUninstallConfirmNo: "Отмена",

  // Browse modal — type filter chips
  extFilterAll: "Все",
  extFilterMetrics: "Метрики",
  extFilterSettings: "Расширенные настройки",
  extFilterPresets: "Пресеты",
  extFilterLocal: "Локальные",

  // Browse modal — "Local" filter (test a self-developed extension from a file)
  extLocalIntroTitle: "Протестируйте расширение сообщества локально",
  extLocalIntroDesc:
    "Используйте эту страницу, чтобы добавить в плагин разрабатываемые вами метрики или настройки. После этого вы сможете протестировать расширение локально",
  extLocalAdd: "Добавить из файла",
  extLocalInstalledNotice: (name: string) => `Добавлено локальное расширение "${name}"`,
  extLocalInstallFailed: (msg: string) => `Не удалось добавить расширение: ${msg}`,

  // Per-preset connect (dropdowns in the metric / setting section headers)
  connectAddMetric: "Расширения сообщества…",
  connectAddSetting: "Подключить настройку…",
  connectInstallFirst: "Расширения сообщетсва…",

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
    showReadingTime: {
      label: "Время чтения",
      hint: "Оценивает время чтения в минутах на основе количества слов и выбранной скорости чтения",
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
    showEmbeds: {
      label: "Вложения",
      hint: "Считает вложения ![[...]], ![](...) и HTML-вложения (<img>, <iframe>, <video>, …)",
    },
    showFootnotes: {
      label: "Сноски",
      hint: "Считает только полные сноски ([^1] с определением [^1]: или строчные ^[…])",
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
      hint: `Выкл.: текст викиссылок будет подсчитан
Вкл.: викиссылки будут игнорироваться`,
    },
    countWikiLinkDisplayText: {
      label: "Считать отображаемый текст викиссылок",
      hint: `Выкл.: [[wiki|label]] → wiki и label будут подсчитаны
Вкл.: только label будет подсчитан`,
    },
    countCitekeysAsWords: {
      label: "Игнорировать ключи цитрования",
      hint: `Выкл.: текст ключей цитрования будет подсчитан
Вкл.: ключи цитирования будут игнорироваться`,
    },
    ignoreComments: {
      label: "Игнорировать комментарии",
      hint: `Выкл.: текст в %% … %% и <!-- … --> будет подсчитан
Вкл.: комментарии будут игнорироваться`,
    },
    ignoreHtmlTags: {
      label: "Игнорировать HTML-теги",
      hint: `Выкл.: HTML-теги вида <b> … </b> подсчитываются
Вкл.: теги игнорируются, считаются только слова и символы внутри них`,
    },
  },
} as const;

// The canonical `Locale` type is derived from en.ts (the structural reference);
// other locales just export their object as the default.
export default ru;
