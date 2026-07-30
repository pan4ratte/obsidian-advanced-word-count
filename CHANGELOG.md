# Changelog

## 4.3.0

**This version requires Obsidian 1.13.0 or newer.** Earlier releases stay available to older Obsidian versions automatically.

### Enhancements and bug fixes

* **Fixed the settings tab on Obsidian 1.13 and newer,** where the presets section was not shown at all. The whole tab is now built with the declarative settings API that 1.13 introduced.
* **The settings search now finds this plugin's settings.** Typing "separator", "display method" or "extensions store" into the search box at the top of Obsidian's settings jumps straight to the matching setting.

## 4.2.0

### New features

* **Custom labels.** A new "Set custom labels" was added to the plugin settings. Opens a manager where every metric you have — built-in or downloaded — can be renamed to your liking. You can also clear a field to drop the label entirely and show only the number, or reset a metric back to its original names at any time. Labels apply to all of your presets, and a label left untouched keeps following your Obsidian language.

### New community extensions

* **New metric: Comments.** Counts HTML (`<!-- … -->`) and Obsidian (`%% … %%`) comments in a note.
* **New setting: Count Telegram emoji as one symbol.** Counts a custom Telegram emoji written as `[😢](tg://emoji?id=…)` as a single symbol instead of the whole Markdown link. Adds support for the emojis of the [Publish to Telegram](https://github.com/pan4ratte/obsidian-publish-to-telegram) plugin.

### Enhancements and bug fixes

* Fixed a bug where the update extension button didn't go away after the update.
* Fixed notifications localiations.
* Changed *Unique citekeys* metric name to "References" for clarity.
* Russian status-bar label fixes for the *Comments* and *Pandoc footnotes* metrics.

This update completes a feature request by @mjakubowiak


## 4.1.1

### New community extensions

* **New metric: Pandoc footnotes.** Counts Markdown footnotes combined with `@citekey` citation groups that will generate footnotes after Pandoc export. Complete footnotes (`[^1]` with a `[^1]: …` definition, or inline `^[…]`) are counted, plus each body citation bracket (`[@key]`) — however many keys it bundles, it becomes one footnote when exported with a footnote citation style (e.g. Chicago notes). Citations already inside a footnote aren't double-counted. Useful if you export with a footnote citation style.
* **New setting: Ignore backslash commands.** When enabled, lines consisting solely of a backslash command — such as `\pagebreak` or `\newpage` — are excluded from word and character counts.

### Enhancements and bug fixes

* **Community store desktop UX improvements.** Added mouse scroll for the filters row in the extensions store. Plus, various interaction and layout improvements were implemented.
* **Mobile UI optimizations.** Several CSS fixes for a better experience on mobile.


## 4.1.0

### New features

* **New metric: HTTP(S) links.** A community metric that counts every `http(s)` link in a note, wherever it appears — bare, inside a Markdown link, in angle brackets or any other brackets.
* **New preset: Scientific article.** A ready-made preset with the basic metrics and a page goal for academic writing, including the *Average citations per page* metric.
* **Test extensions locally.** A new **Local** filter in the extensions store lets extension developers load a metric or setting straight from a JSON file on disk — no fork or upload needed — then connect it to a preset and test it against real notes. Locally added extensions are listed under the filter and can be removed at any time.

### Enhancements and bug fixes

* **Embeds metric updated to count HTML embeds.** Now it also recognises HTML embedded content — `<img>`, `<iframe>`, `<embed>`, `<object>`, `<video>` and `<audio>` — alongside the Obsidian wiki (`![[…]]`) and Markdown image (`![](…)`) forms.
* **Store search matches translations.** Searching the extensions store now also matches localized names and descriptions, so you can find extensions by the text shown in your Obsidian language.

### Other

* Contribution guide updated with instructions for testing extensions live, including the new Local filter.


## 4.0.0

### Major update: Community extensions store

**Community extensions** are small, declarative add-ons that extend the plugin with no executable code, so they're safe to download, review and store.

* **Extensions store.** A new catalogue in the plugin settings (the **Presets** section → **Browse extensions**). Search by name, author or description, filter by type, and install, update or uninstall any extension with a single click.
* **Metric and setting extensions.** Install new counter metrics and additional word/character advanced counting options, then connect them to any preset — they behave exactly like the built-in ones (limit warnings, goals, drag-to-reorder, status bar and right pane).
* **Ready-made presets.** Some catalogue entries are complete presets (for example, the Telegram post presets) that carry their toggles, warnings/goals and the extensions they use. Installing one adds the preset and downloads everything it needs. Made a preset you like? Use the **Share** (↗) button to export it for the catalogue.
* **Dependencies handled for you.** Installing an extension automatically pulls in anything it relies on; removing one that others depend on warns you first.
* **Automatic updates.** Turn on "Automatically update installed community extensions" option to refresh them quietly on startup, or update them by hand from the store.
* **Localized.** Extension names and labels appear in your Obsidian language whenever a translation is provided.

### Breaking changes

* **Tables, Tags and Ignore code are now community extensions.** These three used to be built in; they've moved to the catalogue to keep the core lean. After updating, install them from **Browse extensions** to keep using them. Your presets remember whether each was enabled and reconnect it automatically as soon as the extension is installed — no reconfiguration needed.

### Bug fixes

* **Embeds.** The Embeds metric now also counts Markdown image embeds (`![alt](url)`) alongside Obsidian wiki embeds (`![[…]]`), so notes using image-style embeds are no longer undercounted.


## 3.1.0

### New features

* **Set goals.** Add a goal to any enabled metric to track progress toward a target — the metric turns green once it reaches ≥100% of the goal.
* **Goals and warnings together.** A metric can now carry both a goal and a warning at the same time; a goal cannot be set higher than its paired warning.
* **Right pane metrics reordering.** Rearrange the metrics in the right pane by dragging them, and the new order is applied to the status bar as well. Mobile/touch devices support is experimental for now.
* **New metric: Footnotes.** Counts complete footnotes — both inline (`^[…]`) and reference/definition pairs (`[^1]` with a matching `[^1]: …`).
* **New metric: Reading time.** Estimates reading time from the word count, with a per-preset selector: Average reader (250 WPM), Fast reader (400 WPM) or Complex text (150 WPM).
* **New advanced setting: Ignore code.** Excludes both inline code and fenced code blocks from the word and character counts.

### UI/UX enhancements and bug fixes

* **Better citekey counting.** Several `@keys` in a single `[bracket]` are now each counted, and Pandoc-style prefixes and locators (e.g. `[see @smith2020, p. 33]`) are recognised.
* Fixed task checkbox markers (`- [ ]` / `- [x]`) being miscounted in the word count.
* Fixed task checkbox markers being miscounted in the characters-with-spaces metric.
* Fixed embeds being counted as markdown links.

### Other

* Internal architecture rewritten and covered with an automated test suite.


## 3.0.1

### Hotfix release

* Fixed a bug where the right pane tab was force-focused on Obsidian startup, overriding the last saved workspace state (especially inconvenient on mobile).
* The plugin no longer creates a default preset on first launch.
* Locales correction.


## 3.0.0

### Major update

* **Display metrics in the right pane.** Now you can view your counters in the status bar, the right pane tab or both with "Counters display method" setting. The right pane layout can be arranged in one or two columns and has fancy design and subtle animations.
* **Limit warnings.** Add a limit warning for any of the enabled metric in the preset. The metric is highlighted as it approaches it: orange at ≥90% of the limit and red at ≥100%. A separate "Limit warnings display method" setting controls whether warnings appear in the status bar, the right pane, or both.
* **New counter metrics: Embeds, Tables, Tags**: Count `![[]]` embeds, complete tables and all Obsidian-compatible `#tags`.
* **New advanced setting: Ignore HTML tags.** A new advanced counting option strips HTML tags, counting only the words and symbols inside them.
* **Hide the default Obsidian word counter.** A new toggle disables the built-in word count core plugin so you don't get a duplicate counter. It switches itself off automatically if you re-enable the core plugin from Obsidian's own settings.

### UI/UX enhancements and bug fixes

* Settings are now split into General and Presets sections.
* Newly created presets are added to the top of the list.
* The preset status badge is now an icon with a tooltip; inactive presets show a faded, clickable badge that activates the preset, replacing the separate "Set as active preset" button.
* Cycle presets, by clicking their name in the right pane.
* Fixed a bug when status bar metric separator was displayed incorrectly.
* Updated dependencies.
