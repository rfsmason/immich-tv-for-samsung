// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadAppMarkup } from "../test/app-markup";
import { readSplashSupportText, showSplashSupport } from "./splash-support";

function splashLine(): HTMLElement | null {
  return document.querySelector("#splash-screen .splash-support");
}

beforeEach(() => {
  loadAppMarkup();
});

describe("splash support line", () => {
  it("points to Settings in a sideload build", () => {
    showSplashSupport(document, true, false);

    expect(splashLine()?.textContent).toBe("Free to use. You can support development in Settings.");
  });

  it("thanks a supporter in a sideload build", () => {
    showSplashSupport(document, true, true);

    expect(splashLine()?.textContent).toBe("Thank you for supporting Immich TV.");
  });

  it("shows no line in a store build, supporter or not", () => {
    expect(readSplashSupportText(false, false)).toBeNull();
    expect(readSplashSupportText(false, true)).toBeNull();

    showSplashSupport(document, false, true);

    expect(splashLine()).toBeNull();
  });

  it("isn't in the shipped markup, so a store build has none", () => {
    expect(splashLine()).toBeNull();
  });

  it("updates one line in place after a save, and never makes it focusable", () => {
    showSplashSupport(document, true, false);
    showSplashSupport(document, true, true);

    expect(document.querySelectorAll(".splash-support")).toHaveLength(1);
    expect(splashLine()?.textContent).toBe("Thank you for supporting Immich TV.");
    expect(splashLine()?.matches(".focusable, [tabindex]")).toBe(false);
  });
});
