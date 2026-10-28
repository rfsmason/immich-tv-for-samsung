// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteKeys } from "../../platform/tizen/keys";
import { loadAppMarkup } from "../../test/app-markup";
import { createViewerSeek, seekCommitDelayMs, seekEndMarginSeconds } from "./viewer-seek";

function fixture(duration = 600, currentTime = 100) {
  vi.useFakeTimers();
  let clock = 0;
  const element = (tag = "span") => document.body.appendChild(document.createElement(tag));
  const bar = element("div");
  const video = element("video") as HTMLVideoElement;
  let committed = currentTime;
  const sets: number[] = [];

  bar.tabIndex = -1;
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => committed,
    set: (value: number) => {
      sets.push(value);
      committed = value;
    }
  });
  const videoId = { current: "v" as string | null };
  const elements = {
    assetViewerPlayerDuration: element(),
    assetViewerPlayerElapsed: element(),
    assetViewerPlayerProgress: element(),
    assetViewerPlayerSeek: bar,
    assetViewerVideo: video
  };
  const seek = createViewerSeek({
    currentVideoId: () => videoId.current,
    elements,
    now: () => clock,
    windowRef: { clearTimeout, setTimeout } as Pick<Window, "clearTimeout" | "setTimeout">
  });
  // A held key: one press now, then a repeat every `everyMs` for `forMs`.
  const hold = (direction: -1 | 1, forMs: number, everyMs = 100) => {
    seek.skip(direction, "right", false);
    for (let at = everyMs; at <= forMs; at += everyMs) {
      clock += everyMs;
      seek.skip(direction, "right", true);
    }
  };

  return {
    advance(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    bar,
    elements,
    hold,
    seek,
    sets,
    videoId
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = "";
});

describe("skipping through a video", () => {
  it("shows each step's target at once and commits one seek per burst", () => {
    const f = fixture();

    f.seek.skip(1, "right", false);
    f.seek.skip(1, "right", false);
    f.seek.skip(1, "right", false);
    expect(f.seek.isPending()).toBe(true);
    expect(f.elements.assetViewerPlayerElapsed.textContent).toBe("2:10");
    expect(f.bar.getAttribute("aria-valuenow")).toBe("130");
    expect(f.bar.getAttribute("aria-valuetext")).toBe("Video position, 2:10 of 10:00");
    expect(f.sets).toEqual([]);

    f.advance(seekCommitDelayMs - 1);
    expect(f.sets).toEqual([]);
    f.advance(1);
    expect(f.sets).toEqual([130]);
    expect(f.seek.isPending()).toBe(false);
  });

  it("commits at once when the key is released", () => {
    const f = fixture();

    f.seek.skip(-1, "left", false);
    f.seek.release(remoteKeys.left);
    expect(f.sets).toEqual([90]);
    f.advance(seekCommitDelayMs);
    expect(f.sets).toEqual([90]);
  });

  it("takes 10 s steps under a second's hold, 30 s steps to 3 s, then 60 s steps", () => {
    const tenSecondSteps = fixture(3600, 0);
    tenSecondSteps.hold(1, 900);
    tenSecondSteps.seek.release(remoteKeys.right);
    expect(tenSecondSteps.sets).toEqual([100]); // 10 presses × 10 s

    const thirtySecondSteps = fixture(3600, 0);
    thirtySecondSteps.hold(1, 2000);
    thirtySecondSteps.seek.release(remoteKeys.right);
    // 10 presses under 1 s × 10 s, then 11 presses from 1 s to 2 s × 30 s.
    expect(thirtySecondSteps.sets).toEqual([100 + 11 * 30]);

    const minuteSteps = fixture(3600, 0);
    minuteSteps.hold(1, 3500);
    minuteSteps.seek.release(remoteKeys.right);
    // Then 6 presses from 3 s to 3.5 s × 60 s.
    expect(minuteSteps.sets).toEqual([100 + 20 * 30 + 6 * 60]);
  });

  it("clamps to the start and to just before the end", () => {
    const start = fixture(600, 5);
    start.seek.skip(-1, "left", false);
    start.seek.release(remoteKeys.left);
    expect(start.sets).toEqual([0]);

    const end = fixture(600, 595);
    end.seek.skip(1, "right", false);
    end.seek.release(remoteKeys.right);
    expect(end.sets).toEqual([600 - seekEndMarginSeconds]);
  });

  it("does nothing without a video, and drops a seek for a video no longer shown", () => {
    const f = fixture();

    f.videoId.current = null;
    expect(f.seek.isAvailable()).toBe(false);
    f.seek.skip(1, "right", false);
    expect(f.seek.isPending()).toBe(false);

    f.videoId.current = "v";
    f.seek.skip(1, "right", false);
    f.videoId.current = "other";
    f.advance(seekCommitDelayMs);
    expect(f.sets).toEqual([]);

    f.videoId.current = "v";
    f.seek.skip(1, "right", false);
    f.seek.cancel();
    f.advance(seekCommitDelayMs);
    expect(f.sets).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("focuses the bar and knows when it has focus", () => {
    const f = fixture();

    expect(f.seek.isFocused()).toBe(false);
    f.seek.focus();
    expect(f.seek.isFocused()).toBe(true);
  });
});

describe("the progress bar's markup", () => {
  it("is a slider reached only by the viewer's own focus moves", () => {
    loadAppMarkup();
    const bar = document.getElementById("asset-viewer-seek")!;

    expect(bar.getAttribute("role")).toBe("slider");
    expect(bar.getAttribute("aria-label")).toBe("Video position");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("tabindex")).toBe("-1");
    expect(bar.querySelector("#asset-viewer-progress-fill")).not.toBeNull();
  });
});
