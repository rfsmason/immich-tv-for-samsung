import { createHoldAccelerator, type HoldStep } from "../../navigation/hold-accelerator";
import { remoteKeys } from "../../platform/tizen/keys";
import { readFiniteMediaTime, renderViewerPlayerPosition } from "./viewer-playback";
import type { ViewerElements } from "./viewer-types";

// Skipping through a video (ADR 0020). While a video (not a Live Photo)
// shows, its progress bar is a slider: Up from Play reaches it, Up or Down
// returns to Play, OK plays or pauses, and Left/Right skip. A single press,
// or a hold under a second, skips 10 s; held 1-3 s, 30 s; held longer, 60 s
// (the date rail's hold accelerator, ADR 0017). The rewind and fast-forward
// keys skip the same way wherever focus is. The target shows at once; the
// seek itself is committed when the key is released or keys stop for
// seekCommitDelayMs, so a burst of presses is one seek, which is slow on the
// TV. Left/Right anywhere else still move between items.

export const seekStepSeconds: Record<HoldStep, number> = {
  boundary: 30,
  single: 10,
  "skip-boundary": 60
};
// Keys this close together make one seek.
export const seekCommitDelayMs = 300;
// A seek stops this far before the end, so it never lands past it.
export const seekEndMarginSeconds = 0.5;

type ViewerSeekOptions = {
  // The asset whose video is showing, if it is a video (not a Live Photo).
  currentVideoId(): string | null;
  elements: Pick<
    ViewerElements,
    | "assetViewerPlayerDuration"
    | "assetViewerPlayerElapsed"
    | "assetViewerPlayerProgress"
    | "assetViewerPlayerSeek"
    | "assetViewerVideo"
  >;
  now?: () => number;
  windowRef?: Pick<Window, "clearTimeout" | "setTimeout">;
};

export type ViewerSeek = {
  // Drops a seek not yet committed (another asset, or the viewer closed).
  cancel(): void;
  focus(): void;
  // Whether the bar can take focus: a video is showing.
  isAvailable(): boolean;
  isFocused(): boolean;
  // Whether a target is showing that isn't committed yet.
  isPending(): boolean;
  // A key released: commits a pending seek.
  release(keyCode: number): void;
  // Skips back (-1) or forward (1); `key` and `repeat` identify a hold.
  skip(direction: -1 | 1, key: string, repeat: boolean): void;
};

export function createViewerSeek(options: ViewerSeekOptions): ViewerSeek {
  const { elements } = options;
  const video = elements.assetViewerVideo;
  // The global timers unless a test supplies its own, so a viewer that never
  // seeks needs no window.
  const timers: Pick<Window, "clearTimeout" | "setTimeout"> = options.windowRef || {
    clearTimeout: (id) => clearTimeout(id),
    setTimeout: (handler, timeout) => Number(setTimeout(handler as () => void, timeout))
  };
  const accelerator = createHoldAccelerator(options.now || (() => Date.now()));
  let pending: { assetId: string; seconds: number } | null = null;
  let commitTimer: number | null = null;

  function clearCommitTimer(): void {
    if (commitTimer !== null) {
      timers.clearTimeout(commitTimer);
      commitTimer = null;
    }
  }

  function commit(): void {
    clearCommitTimer();

    if (pending && pending.assetId === options.currentVideoId()) {
      video.currentTime = pending.seconds;
    }

    pending = null;
  }

  return {
    cancel() {
      clearCommitTimer();
      accelerator.reset();
      pending = null;
    },
    focus() {
      elements.assetViewerPlayerSeek.focus();
    },
    isAvailable: () => options.currentVideoId() !== null,
    isFocused: () =>
      elements.assetViewerPlayerSeek.ownerDocument.activeElement === elements.assetViewerPlayerSeek,
    isPending: () => pending !== null,
    release(keyCode) {
      const skipKey =
        keyCode === remoteKeys.left ||
        keyCode === remoteKeys.right ||
        keyCode === remoteKeys.mediaRewind ||
        keyCode === remoteKeys.mediaFastForward;

      if (skipKey) {
        accelerator.reset();
        commit();
      }
    },
    skip(direction, key, repeat) {
      const assetId = options.currentVideoId();
      const duration = readFiniteMediaTime(video.duration);

      if (!assetId || duration <= 0) {
        return;
      }

      const from =
        pending && pending.assetId === assetId
          ? pending.seconds
          : readFiniteMediaTime(video.currentTime);
      const step = seekStepSeconds[accelerator.press(key, repeat)];
      const last = Math.max(0, duration - seekEndMarginSeconds);
      const seconds = Math.max(0, Math.min(last, from + direction * step));

      pending = { assetId, seconds };
      renderViewerPlayerPosition(elements, seconds, duration);
      clearCommitTimer();
      commitTimer = timers.setTimeout(commit, seekCommitDelayMs);
    }
  };
}
