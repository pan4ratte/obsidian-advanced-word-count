import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    // Lint the TypeScript source only. Build/config (*.mjs, *.mts), data (*.json)
    // and tooling scripts (scripts/*.js) aren't plugin code, and the preset's
    // type-aware rules can't run on them (they're outside tsconfig's project, so
    // there are no parser services).
    ignores: ["node_modules/**", "main.js", "**/*.mjs", "**/*.mts", "**/*.json", "scripts/**"],
  },
  // Full Obsidian plugin guideline preset (includes the type-checked
  // @typescript-eslint ruleset and the obsidianmd/* rules).
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Project-specific overrides.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  },
  {
    // Tests and their tooling aren't shipped plugin code. The obsidian-stub
    // deliberately re-exports moment to stand in for the "obsidian" module under
    // test, which the bundled-moment import restriction would otherwise forbid.
    // Tests run in Node (vitest), so Node builtins like fs/path/url are fine here.
    files: ["tests/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": "off",
      "import/no-nodejs-modules": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
]);
