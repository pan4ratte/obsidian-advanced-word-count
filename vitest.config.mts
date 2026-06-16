import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // The real "obsidian" package is type-only with no runtime JS, so redirect
      // imports to a stub when running tests. See tests/obsidian-stub.ts.
      obsidian: fileURLToPath(new URL("./tests/obsidian-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
