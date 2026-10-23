import { describe, expect, it } from "vitest";
import {
  clampLabelLeft,
  clampLabelTop,
  mapFaceToContent,
  readContainedContentRect
} from "./face-overlay-layout";

describe("face overlay layout", () => {
  it("fits a portrait photo inside a landscape stage with side bars", () => {
    const content = readContainedContentRect(
      { height: 1080, width: 1920 },
      { height: 1600, width: 1200 }
    );

    expect(content).toEqual({ height: 1080, left: 555, top: 0, width: 810 });
    expect(
      mapFaceToContent(
        { box: { bottom: 0.5, left: 0.5, right: 1, top: 0.25 }, id: "f", personName: null },
        content!
      )
    ).toEqual({ height: 270, left: 960, top: 270, width: 405 });
  });

  it("fits a wide photo with bars above and below", () => {
    expect(
      readContainedContentRect({ height: 1080, width: 1920 }, { height: 1000, width: 4000 })
    ).toEqual({ height: 480, left: 0, top: 300, width: 1920 });
  });

  it("has no content before the photo or stage has a size", () => {
    expect(readContainedContentRect({ height: 0, width: 0 }, { height: 10, width: 10 })).toBeNull();
    expect(
      readContainedContentRect({ height: 1080, width: 1920 }, { height: 0, width: 0 })
    ).toBeNull();
  });

  it("keeps labels on screen", () => {
    const nearRight = { height: 100, left: 1850, top: 20, width: 60 };

    expect(clampLabelLeft(nearRight, 200, 1920)).toBe(1708);
    expect(clampLabelLeft({ height: 100, left: 0, top: 20, width: 40 }, 200, 1920)).toBe(12);
    // Below the box when it fits, otherwise above it.
    expect(clampLabelTop(nearRight, 40, 1080)).toBe(128);
    expect(clampLabelTop({ height: 100, left: 0, top: 960, width: 40 }, 40, 1080)).toBe(912);
  });
});
