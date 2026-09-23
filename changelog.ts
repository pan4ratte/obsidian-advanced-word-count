import { App, Component, MarkdownRenderer, Modal, setIcon, setTooltip } from "obsidian";
import { localeTags, t } from "./locales";
// Imported as text (esbuild's ".md" loader, see markdown.d.ts) and shipped inside
// main.js, so the plugin can show the notes for the release it is running.
import changelogEn from "./CHANGELOG.md";
import changelogRu from "./CHANGELOG_RU.md";

// Translated changelogs by locale tag; any other language falls back to English.
// A translation covers the newest release only, with older ones left in English.
const CHANGELOGS: Record<string, string> = {
  ru: changelogRu,
};

/** The changelog in the interface language. */
function changelogContent(): string {
  for (const tag of localeTags()) if (CHANGELOGS[tag]) return CHANGELOGS[tag];
  return changelogEn;
}

// Borrowed from the sibling Citation Suite plugin: the changelog window, and the
// notice at the head of the settings that announces what the running release brought.

/**
 * The changelog, rendered as the markdown it is written in.
 *
 * `MarkdownRenderer.render` wants a component to hang the renderer's own children
 * off, and the modal is not one: a `Component` of its own is loaded for the life
 * of the modal and unloaded with it, or the links it registers outlive the window.
 */
export class ChangelogModal extends Modal {
  private readonly renderComponent = new Component();

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    // Deliberately not Obsidian's `markdown-rendered` beside it: that one sizes
    // markdown for reading a note and would override every size in styles.css.
    contentEl.addClass("wcp-markdown-modal");
    this.renderComponent.load();
    // No source path: nothing in the changelog resolves against a vault note.
    void MarkdownRenderer.render(this.app, changelogContent(), contentEl, "", this.renderComponent);
  }

  onClose() {
    this.renderComponent.unload();
    this.contentEl.empty();
  }
}

export interface ChangelogNoticeOptions {
  app: App;
  /** The release running now, which is also what dismissing remembers. */
  version: string;
  /** The release whose "what's new" notice was dismissed. */
  dismissedVersion: string;
  onDismiss(): void;
}

/**
 * What this release brought, as a card under the plugin description, until it is
 * dismissed. Dismissing closes the space up behind the card rather than blinking
 * it out of a gap.
 */
export function renderChangelogNotice(parent: HTMLElement, options: ChangelogNoticeOptions): void {
  if (options.dismissedVersion === options.version) return;

  const card = parent.createDiv({ cls: "wcp-changelog-notice" });
  setIcon(card.createSpan({ cls: "wcp-changelog-icon" }), "sparkles");
  card.createSpan({ cls: "wcp-changelog-notice-text", text: t.changelogUpdated(options.version) });
  // A labelled button, so what opens the changelog says so — the version itself
  // is plain text.
  // The buttons share a wrapper so that, on a narrow pane, they drop together onto
  // a line of their own under the text rather than squeezing it.
  const actions = card.createDiv({ cls: "wcp-changelog-actions" });
  const openBtn = actions.createEl("button", { cls: "wcp-changelog-open", text: t.changelogSeeWhatsNew });
  openBtn.addEventListener("click", () => new ChangelogModal(options.app).open());

  const dismiss = actions.createEl("button", { cls: "wcp-changelog-dismiss", text: t.changelogDismiss });
  setTooltip(dismiss, t.changelogBannerDismiss);
  dismiss.addEventListener("click", () => {
    options.onDismiss();
    if (card.win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      card.remove();
      return;
    }
    const style = card.win.getComputedStyle(card);
    const animation = card.animate(
      {
        height: [`${card.getBoundingClientRect().height}px`, "0px"],
        marginBottom: [style.marginBottom, "0px"],
        opacity: [1, 0],
      },
      { duration: 180, easing: "ease-in-out" }
    );
    animation.onfinish = () => card.remove();
  });
}
