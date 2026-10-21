import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createVideoBadge, scrollIntoContainer } from "./grid-presentation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("grid presentation", () => {
  it("scrolls a container just enough to reveal the focused element with padding", () => {
    const rect = (top: number, bottom: number, left = 0, right = 100) => ({
      bottom,
      left,
      right,
      top
    });
    const container = {
      getBoundingClientRect: () => rect(100, 500, 0, 1000),
      scrollLeft: 0,
      scrollTop: 50
    } as unknown as HTMLElement;

    scrollIntoContainer(
      container,
      { getBoundingClientRect: () => rect(80, 180) } as unknown as HTMLElement,
      12
    );
    expect(container.scrollTop).toBe(18);

    scrollIntoContainer(
      container,
      { getBoundingClientRect: () => rect(450, 520) } as unknown as HTMLElement,
      12
    );
    expect(container.scrollTop).toBe(50);

    scrollIntoContainer(
      container,
      { getBoundingClientRect: () => rect(0, 10, 950, 1100) } as unknown as HTMLElement,
      20,
      "horizontal"
    );
    expect(container.scrollLeft).toBe(120);
  });
});

describe("video badge", () => {
  it("labels a video's length from its domain milliseconds", () => {
    const documentRef = new Window().document as unknown as Document;
    const video = {
      capturedAt: null,
      durationMs: 64000,
      id: "v",
      livePhotoVideoId: null,
      location: null,
      name: "v.mp4",
      type: "video" as const
    };

    expect(createVideoBadge(documentRef, video).textContent).toBe("1:04");
    expect(createVideoBadge(documentRef, { ...video, durationMs: null }).textContent).toBe("");
  });
});
