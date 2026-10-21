import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts", "src/test/**"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      // Enforced minimums for the screens and application composition, set a
      // few points below the levels reached in Milestone 11.5 so regressions
      // fail without chasing a number.
      thresholds: {
        "src/app/**": { branches: 74, functions: 82, lines: 84, statements: 84 },
        "src/screens/**": { branches: 72, functions: 86, lines: 83, statements: 83 }
      }
    },
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/capture/**/*.test.{ts,mjs}"]
  }
});
