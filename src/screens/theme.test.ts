// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyContrastTheme } from "./theme";

describe("contrast theme", () => {
  it("marks the root element for high contrast and removes the mark again", () => {
    applyContrastTheme(document, true);
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");

    applyContrastTheme(document, false);
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
  });
});
