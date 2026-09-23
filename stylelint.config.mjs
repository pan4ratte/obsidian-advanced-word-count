// Official Obsidian CSS ruleset: the rules the community plugin review scanner
// runs over styles.css, on top of stylelint-config-standard. Same setup as the
// sibling Citation Suite plugin.
/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-obsidianmd"],
  rules: {
    // -webkit-user-select stays beside user-select: iOS WebKit (Obsidian mobile)
    // still needs the prefix to stop a long-press from selecting text.
    "property-no-vendor-prefix": [true, { ignoreProperties: ["-webkit-user-select"] }],
    // The preset checks browser support against a newer Electron than the review
    // scanner has reported against (Obsidian 1.11.4, Electron 39). The older
    // target is checked here so nothing the scanner flags passes locally. The
    // options restate the preset's own, since a rule's options are replaced
    // rather than merged.
    "plugin/no-unsupported-browser-features": [
      true,
      {
        severity: "warning",
        browsers: ["electron >= 39"],
        ignore: ["css-nesting", "css-cascade-layers"],
      },
    ],
  },
};
