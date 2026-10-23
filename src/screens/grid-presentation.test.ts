import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createVideoBadge, readRowScrollTop, scrollIntoContainer } from "./grid-presentation";

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

describe("whole-row grid scrolling", () => {
  // 300 px rows 22 px apart under 20 px of padding, in a 900 px view.
  const base = { margin: 24, paddingTop: 20, rowHeight: 300, rowPitch: 322, viewHeight: 900 };

  it("leaves rows in view alone", () => {
    expect(readRowScrollTop({ ...base, row: 0, scrollTop: 0 })).toBeNull();
    expect(readRowScrollTop({ ...base, row: 1, scrollTop: 0 })).toBeNull();
  });

  it("scrolls down by whole rows until the row and its margin fit", () => {
    // Row 2 ends at 964 + 24 > 900: one row down.
    expect(readRowScrollTop({ ...base, row: 2, scrollTop: 0 })).toBe(322);
    expect(readRowScrollTop({ ...base, row: 3, scrollTop: 322 })).toBe(644);
    // Even a jump of several rows lands on a whole-row position.
    expect(readRowScrollTop({ ...base, row: 9, scrollTop: 0 })! % 322).toBe(0);
  });

  it("scrolls up so the row rests where the first row starts", () => {
    expect(readRowScrollTop({ ...base, row: 1, scrollTop: 644 })).toBe(322);
    expect(readRowScrollTop({ ...base, row: 0, scrollTop: 322 })).toBe(0);
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
