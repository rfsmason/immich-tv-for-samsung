import { describe, expect, it } from "vitest";
import {
  checkContrast,
  composite,
  contrastRatio,
  findUntokenedColours,
  parseColour,
  readTokens,
  resolveToken
} from "./contrast-rules.mjs";

// Every token the pairs read, in a fixture theme that passes; each test then
// breaks one thing.
const passingTokens = `
  --text-primary: #ffffff;
  --text-muted: #e0e0e0;
  --text-secondary: #e0e0e0;
  --text-hint: #e0e0e0;
  --text-placeholder: #c8c8c8;
  --text-emphasis: #ffffff;
  --focus-text: #000000;
  --focus-fill: #ffffff;
  --focus-ring: #000000;
  --focus-halo: #ffffff;
  --selected-fill: #333333;
  --dropdown-fill: #000000;
  --overlay-plate: #000000;
  --viewer-backdrop: #000000;
  --status-error: #ff8a80;
  --status-warning: #ffd54f;
  --status-success: #69f0ae;
  --control-border: #bfbfbf;
  --control-fill: #000000;
  --app-background: #000000;`;

function stylesheet(highOverrides = "", defaults = passingTokens) {
  return `:root {${defaults}\n}\n\n:root[data-contrast="high"] {${passingTokens}${highOverrides}\n}\n\n.thing {\n  color: var(--text-primary);\n}\n`;
}

describe("WCAG contrast arithmetic", () => {
  it("measures black on white as 21:1 and equal colours as 1:1", () => {
    expect(contrastRatio(parseColour("#000"), parseColour("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColour("#777777"), parseColour("#777777"))).toBe(1);
  });

  it("composites translucent colours over their background", () => {
    expect(composite(parseColour("rgba(255, 255, 255, 0.5)"), [0, 0, 0, 1])).toEqual([
      127.5, 127.5, 127.5, 1
    ]);
    expect(parseColour("transparent")).toEqual([0, 0, 0, 0]);
  });

  it("reads token blocks and follows var() references", () => {
    const tokens = readTokens(":root {\n  --a: #123456;\n  --b: var(--a);\n}\n", ":root");
    expect(resolveToken(tokens, "--b")).toBe("#123456");
    expect(() => resolveToken(tokens, "--missing")).toThrow("Unknown colour token");
  });
});

describe("contrast check", () => {
  it("passes a theme that meets every target", () => {
    expect(checkContrast(stylesheet()).flatMap((result) => result.failures)).toEqual([]);
  });

  it("fails high-contrast muted text below 7:1", () => {
    const failures = checkContrast(stylesheet("\n  --text-muted: #777777;")).flatMap(
      (result) => result.failures
    );
    expect(failures).toEqual([expect.stringMatching(/^High contrast: muted text .* below 7:1\.$/)]);
  });

  it("fails a focus ring that disappears against the focused control", () => {
    const failures = checkContrast(stylesheet("\n  --focus-ring: #eeeeee;")).flatMap(
      (result) => result.failures
    );
    expect(failures.some((failure) => failure.includes("focus ring"))).toBe(true);
  });

  it("only fails the default theme for body text below 4.5:1, and reports the rest", () => {
    const faintDefaults = passingTokens
      .replace("--text-hint: #e0e0e0;", "--text-hint: #444444;")
      .replace("--control-border: #bfbfbf;", "--control-border: #222222;");
    const results = checkContrast(stylesheet("", faintDefaults));
    expect(results.flatMap((result) => result.failures)).toEqual([]);
    expect(results.find((result) => result.name.startsWith("hint text")).normal).toBeLessThan(4.5);

    const dimBody = passingTokens.replace("--text-primary: #ffffff;", "--text-primary: #333333;");
    expect(checkContrast(stylesheet("", dimBody)).flatMap((result) => result.failures)).toEqual([
      expect.stringMatching(/^Default theme: primary text .* below 4.5:1\.$/)
    ]);
  });
});

describe("theme colours stay on tokens", () => {
  it("finds raw colours outside the token blocks, but not in media-only rules", () => {
    const css = `${stylesheet()}.label {\n  color: #ff0000;\n}\n\n.asset-viewer-face-box {\n  border: 3px solid #ffffff;\n}\n`;
    expect(findUntokenedColours(css)).toEqual([
      expect.stringMatching(/^line \d+ \(\.label\): color: #ff0000;$/)
    ]);
  });
});
