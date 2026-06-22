# Advanced Word Count plugin

English | [Русский](https://github.com/pan4ratte/obsidian-advanced-word-count/blob/main/README_RU.md)

This plugin allows you to create complex word count presets that are displayed in the status bar or in the right pane tab. You can cycle presets by clicking on the status bar, the right pane header or using command palette. Thanks to community extensions — presets, metrics and advanced settings — the plugin flexibly adapts to writing, academic and other purposes.

<div align="center">
  <img src="media/1-cover.png"width="100%" />
</div>


## Features

### 1. Create multiple word count presets

Each separate preset can have its own list of metrics and methods of counting formatting elements, which makes working on multiple projects easier. You can quickly cycle between presets by clicking on the status bar, the right pane tab header of or from the command palette.

### 2. View word counters in the right pane tab

* Counters can be viewed not only in the status bar, but also in the right pane tab. You can define whether counters are visible in both places or only one.
* Moreover, for any chosen metric you can set up a limit warning and/or a goal: a warning colors the metric orange at ≥90% of the limit and red at ≥100%, while a goal colors it green at ≥100% (a metric can have both at once, and a goal can't be set higher than its warning).
* You can also reorder the metrics in the right pane by dragging them — the new order is applied to the status bar as well (drag-and-drop on mobile devices is experimental for now).

### 3. Track many different counting metrics

* Essentials:

	* Words
	* Pages
	* Characters (with spaces)
	* Characters (without spaces)

* Additional options:

	* Lines (all lines, including blank ones)
	* Paragraphs (blocks of text, empty lines are ignored)
	* Reading time (estimated from a chosen reading speed)
	* Markdown links `(url)[label]` and `[label](url)`
  * Embeds `![[note]]` or `![[file.pdf]]`
  * Footnotes — complete `[^1]` references and inline `^[…]`

* Special "academic" options:

	* Wikilinks `[[wiki]]` and `[[wiki|label]]`
	* Citekeys `[@doe2020]`

### 4. Fine-tune "Words" and "Characters…" counting methods with advanced settings

You can specify, how formatting elements will be counted:

| Advanced option 			       		 | Off 							   											    			    		  | On 			     					   					|
| :------------------------------- | :----------------------------------------------------------- | :-------------------------------- |
| **Count links display text** 	   | `(url)[label]` → label and url will be counted 						  | only label will be counted 		    |
| **Ignore wikilinks** 		         | wikilinks text will be counted	   											 		  | wikilinks will be ignored	  		  |
| **Count wikilinks display text** | `[[wiki\|label]]` → wiki and label will be counted 				  | only label will be counted  		  |
| **Ignore citekeys** 			       | citekeys text will be counted 															  | citekeys will be ignored 				  |
| **Ignore comments**			         | comments `%% … %%` and `<!-- … -->` text will be counted		  | comments will be ignored 	   		  |
| **Ignore HTML tags**		         | HTML tags like `<b> … </b>` etc. will be counted		          | HTML tags will be ignored 	   		|

### 5. Install community extensions: presets, metrics and advanced settings

**Community extensions** are small add-ons, each of which adds one metric, one advanced (word-count) setting, or a whole ready-made preset.

* **The extension store** opens in the plugin settings. Search by name, author or description, filter by type (metrics / advanced settings / presets), and install, update or remove any extension with a single click. Installed extensions are highlighted with your accent colour.
* **Ready-made presets** carry their toggle states, advanced settings, warnings/goals and connected community extensions. Installing one adds it to your presets and downloads the extensions it needs automatically. Made a preset you like? Click the **Share** (↗) icon in its header to export a file you can suggest for the plugin's catalogue.
* **Connecting installed extensions** is done separately for each of your presets — use the **Add metric…** / **Add setting…** dropdown inside a preset.
* **Dependencies are installed automatically:** if an extension depends on another, everything it needs is downloaded with it.
* **Updating extensions** is available manually in the store, or automatically on Obsidian startup when the **Automatically update installed community extensions** setting is enabled.

The official catalogue currently includes:

<!-- BEGIN GENERATED CATALOGUE: do not edit by hand; run "npm run docs:catalogue" -->

**Metrics**

| Name | Description |
| :--- | :---------- |
| Sentences | Counts the number of sentences in a note. |
| Emoji | Counts the number of emoji and other pictographic characters in a note. |
| Reference links | Counts resolved reference-style links — a [text][id] reference that has a matching [id]: URL definition elsewhere in the note. |
| Unique tags | Counts the number of unique #tags in a note, ignoring repeats. |
| Average word length | Calculates the average number of characters per word in a note. |
| Average Markdown links per page | Calculates the average number of Markdown links per page. |
| Average words per sentence | Calculates the average number of words per sentence in a note. |
| Headings | Counts the number of Markdown headings (# … ######) in a note. |
| Tasks (all) | Counts all task checkboxes — checked and unchecked. |
| Completed tasks | Counts only completed task checkboxes (- [x] or - [X]). |
| Incomplete tasks | Counts only incomplete task checkboxes (- [ ]). |
| Unique citekeys | Counts the number of unique @citekeys in a note. |
| Average citations per page | Calculates the average number of citations per page. |
| Tables | Counts the number of complete Markdown tables (header + delimiter row) in a note. |
| Tags | Counts the number of #tags in a note. |

**Advanced settings**

| Name | Description |
| :--- | :---------- |
| Ignore highlights | When counting words and characters, ignores `==highlighted==` spans. |
| Ignore math | When counting words and characters, excludes LaTeX math — block `$$…$$` and inline `$…$`. |
| Ignore tables | When counting words and characters, excludes Markdown table rows. |
| Ignore URLs | When counting words and characters, excludes bare http(s) links. |
| Ignore strikethrough | When counting words and characters, excludes `~~struck-through~~` text. |
| Ignore Dataview fields | When counting words and characters, excludes inline Dataview fields — [key:: value] and (key:: value). |
| Ignore code | When counting words and characters, excludes block and inline code. |

**Presets**

| Name | Description |
| :--- | :---------- |
| Telegram user post | Preset for posts made as a Telegram user: with limit warnings and all metrics set up to count characters the way Telegram does. |
| Telegram rich-text post | Preset for rich-text posts in Telegram: with limit warnings and all metrics set up to count characters the way Telegram does. |

<!-- END GENERATED CATALOGUE -->

Want to build your own? See the [extension contributor guide](https://github.com/pan4ratte/obsidian-advanced-word-count/blob/main/extensions/README.md).


## Installation

### Option 1: Obsidian plugin store

1. In Obsidian settings open the tab "Community plugins" and click "Browse" button.

2. In the search bar type `Advanced Word Count`, click on the result, then "Install" and "Enable" buttons.

Alternatively, you can install the plugin by following the link to the community website: [https://community.obsidian.md/plugins/advanced-word-count](https://community.obsidian.md/plugins/advanced-word-count)

### Option 2: BRAT plugin

If you want to test beta-versions of the plugin or use previous versions, you can do that with `BRAT` plugin:

1. Install `BRAT` plugin from the official Obsidian plugin store.

2. In the `BRAT` settings, find the “Beta plugin list” section and click on the “Add beta plugin” button.

3. In the window that appears, paste the link to the `Advanced Word Count` plugin repository: [https://github.com/pan4ratte/obsidian-advanced-word-count](https://github.com/pan4ratte/obsidian-advanced-word-count)

4. Under “Select a version” choose the desired version and click the “Add plugin” button. The plugin will be automatically installed and will be ready to use.


## Plugin use case

Let's say, you have three different projects, on which you are working simultaneously: two academic papers for different journals with different formatting requirements/limits and you write posts for your Telegram channel.

Journals have different page limits and use different fonts: that means that you will need two different presets and for each of them page count will be different. You can set it up with this plugin. For academic purposes you may want to count citekeys, e.g. number of references: you can set it up too.

At the same time, Telegram has a strict character limit and you may want to count characters in your posts, but in such a way, that, for example, only display text of your links is counted (Telegram does the same). You can set it up with this plugin. Etc, etc…

Without this plugin, it would be a nightmare to constantly change your preset settings and it would not be possible to adjust counters for academic purposes. Advanced Word Count plugin is a flexible tool, that makes your writing nightmares your sweet dreams :)


## About the Author

My name is Mark Ingram (Ingrem), I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach the subject "Information Technologies in Scientific Research", a unique course that I developed myself from scratch. This plugin helps me in my studies and I use it in my teaching, as well as other plugins that I develop and that you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student that came across this page!
