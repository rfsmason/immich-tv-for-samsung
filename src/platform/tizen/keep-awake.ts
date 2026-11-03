import type { Logger } from "../../logging/logger";

// The OLED keep-awake (ADR 0023). Samsung's OLED TVs start a burn-in screen
// saver after about two minutes without remote input, and Samsung says it
// can't be disabled; the AppCommon switch in screensaver.ts has been reported
// not to reach it. Samsung says it may not start during full-screen video,
// and another Tizen photo app found that a playing video holds it off. So,
// only when the user turns it on in Settings, this plays a short black clip,
// muted and looping, behind the app while slideshows or ambient mode show
// photos. Real videos never play beside it: with it on, those show videos as
// stills. Not yet confirmed on an OLED TV when written, so every start, stop
// and failure is logged.

// The clip: 10 minutes of black at 320x180 and 1 frame a second, H.264
// Constrained Baseline, no audio track (assets/CREDITS.md says how it was
// made).
export const keepAwakeClipPath = "assets/keep-awake.mp4";

export type KeepAwake = {
  // Whether the clip is meant to be playing.
  isActive(): boolean;
  // Asks for the clip to play or stop; it plays only while the setting is on.
  set(active: boolean): void;
};

type KeepAwakeOptions = {
  documentRef: Document;
  // Whether the user has turned the keep-awake on, read at each change.
  enabled(): boolean;
  logger: Pick<Logger, "error" | "info">;
};

export function createKeepAwake(options: KeepAwakeOptions): KeepAwake {
  const { documentRef, logger } = options;
  let video: HTMLVideoElement | null = null;
  let active = false;

  // Created on first use, so a TV that never turns it on has no extra
  // element.
  function clipElement(): HTMLVideoElement {
    if (!video) {
      const element = documentRef.createElement("video");

      element.className = "keep-awake-video";
      element.muted = true;
      element.loop = true;
      element.preload = "none";
      element.setAttribute("muted", "");
      element.setAttribute("playsinline", "");
      element.setAttribute("aria-hidden", "true");
      element.addEventListener("error", () => {
        if (active) {
          logger.error("The OLED keep-awake clip could not play.", {
            code: element.error ? element.error.code : null
          });
        }
      });
      documentRef.body.appendChild(element);
      video = element;
    }

    return video;
  }

  function start(): void {
    const clip = clipElement();

    clip.src = keepAwakeClipPath;
    logger.info("OLED keep-awake started.");

    try {
      const playing = clip.play();

      if (playing && typeof playing.catch === "function") {
        playing.catch((error: unknown) => {
          if (active) {
            logger.error("The OLED keep-awake clip could not play.", { error });
          }
        });
      }
    } catch (error) {
      logger.error("The OLED keep-awake clip could not play.", { error });
    }
  }

  // Unloads the clip, so it holds no decoder while it isn't needed.
  function stop(): void {
    if (!video) {
      return;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();
    logger.info("OLED keep-awake stopped.");
  }

  return {
    isActive: () => active,
    set(next) {
      const wanted = next && options.enabled();

      if (wanted === active) {
        return;
      }

      active = wanted;

      if (active) {
        start();
      } else {
        stop();
      }
    }
  };
}
