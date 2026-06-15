# Changelog

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
