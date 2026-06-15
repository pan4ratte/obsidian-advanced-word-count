# Advanced Word Count plugin

English | [Русский](https://github.com/pan4ratte/obsidian-advanced-word-count/blob/main/README_RU.md)

This plugin allows you to create complex word count presets that are displayed in the status bar or in the right pane tab. You can cycle presets by clicking on the status bar, the right pane header or using command palette. The plugin is made with academic use cases in mind, so you can fine-tune counting of `[@citekeys]` and `[[wikilinks]]`.

<div align="center">
  <img src="media/1-cover.png"width="100%" />
</div>


## Features

### 1. Create multiple word count presets

Each separate preset can have its own list of metrics and methods of counting formatting elements, which makes working on multiple projects easier. You can quickly cycle between presets by clicking on the status bar, the right pane tab header of or from the command palette.

### 2. View word counters in the right pane tab

Counters can be viewed not only in the status bar, but also in the right pane tab. You can define whether counters are visible in both places or only one. Moreover, optionally for any chosen metric a limit warning can be set up. To do that, choose a metric in the preset and set a limit: when ≥90% of limit is reached, that metric is colored orange and when ≥100% is reached, it is colored red.

### 3. Track many different counting metrics

* Essentials:

	* Words
	* Pages
	* Characters (with spaces)
	* Characters (without spaces)

* Additional options:

	* Lines (all lines, including blank lines)
	* Paragraphs (blocks of text, empty lines are ignored)
	* Markdown links `(url)[label]` and `[label](url)`
  * Embeds `![[note]]` or `![[file.pdf]]`
  * Complete (rendered) tables
  * Any `#tags` that are valid in Obsidian

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


## Plugin use case

Let's say, you have three different projects, on which you are working simultaneously: two academic papers for different journals with different formatting requirements/limits and you write posts for your Telegram channel.

Journals have different page limits and use different fonts: that means that you will need two different presets and for each of them page count will be different. You can set it up with this plugin. For academic purposes you may want to count citekeys, e.g. number of references: you can set it up too.

At the same time, Telegram has a strict character limit and you may want to count characters in your posts, but in such a way, that, for example, only display text of your links is counted (Telegram does the same). You can set it up with this plugin. Etc, etc…

Without this plugin, it would be a nightmare to constantly change your preset settings and it would not be possible to adjust counters for academic purposes. Advanced Word Count plugin is a flexible tool, that makes your writing nightmares your sweet dreams :)


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


## About the Author

My name is Mark Ingram (Ingrem), I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach the subject "Information Technologies in Scientific Research", a unique course that I developed myself from scratch. This plugin helps me in my studies and I use it in my teaching, as well as other plugins that I develop and that you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student that came across this page!
