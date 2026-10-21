// @vitest-environment happy-dom
import type { Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TourGuide } from "./tour-guide";

function fixture() {
  const button = document.createElement("button");
  document.body.appendChild(button);
  button.focus();
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 64,
    height: 64
  } as DOMRect);
  vi.spyOn(button, "clientWidth", "get").mockReturnValue(64);
  vi.spyOn(button, "clientHeight", "get").mockReturnValue(64);
  vi.stubGlobal("getComputedStyle", () => ({
    left: "8px",
    right: "8px",
    bottom: "7px",
    height: "4px"
  }));
  const page = {
    locator: () => ({ waitFor: vi.fn().mockResolvedValue(undefined) }),
    evaluate: async (callback: (value: unknown) => unknown, value: unknown) => callback(value),
    isClosed: () => false
  } as unknown as Page;
  return { button, guide: new TourGuide(page) };
}

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recording-only tour highlighting", () => {
  it("highlights the countdown region without modifying the button or stealing focus", async () => {
    const { button, guide } = fixture();
    const original = button.outerHTML;
    await guide.highlight("button", "Next photo countdown", "::after");
    const annotation = document.querySelector<HTMLElement>("[data-capture-annotation]")!;
    const ring = annotation.firstElementChild as HTMLElement;
    expect(annotation.textContent).toBe("Next photo countdown");
    expect(annotation.getAttribute("aria-hidden")).toBe("true");
    expect(annotation.style.pointerEvents).toBe("none");
    expect(ring.style.top).toBe("245px");
    expect(ring.style.height).toBe("20px");
    expect(button.outerHTML).toBe(original);
    expect(document.activeElement).toBe(button);
    await guide.clear();
    expect(document.querySelector("[data-capture-annotation]")).toBeNull();
  });

  it("replaces the previous callout rather than accumulating overlays", async () => {
    const { guide } = fixture();
    await guide.highlight("button", "First");
    await guide.highlight("button", "Second");
    expect(document.querySelectorAll("[data-capture-annotation]")).toHaveLength(1);
    expect(document.querySelector("[data-capture-annotation]")?.textContent).toBe("Second");
  });
});
