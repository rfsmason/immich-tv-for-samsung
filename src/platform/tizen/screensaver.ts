import type { Logger } from "../../logging/logger";
import type { KeepAwake } from "./keep-awake";
import "./runtime";

// Passive viewing and the TV's own screensaver, verified against Samsung's
// Smart TV guides on 26 October 2026 (ADR 0019):
// - "Setting Screensaver": the TV screensaver appears after a period without
//   input. Store apps must turn it off while the user watches without giving
//   input (video playback, image slideshows) and back on when playback pauses
//   or stops. The calls have no effect when "Auto Protection Time" is off.
// - AppCommon API: webapis.appcommon.setScreenSaver(state, onsuccess?,
//   onerror?) with AppCommonScreenSaverState.SCREEN_SAVER_OFF (0) or
//   SCREEN_SAVER_ON (1); since product API 2.3, on TV; no privilege listed.
// Several things can be passive at once (a slideshow, a playing video,
// ambient mode), so each holds its own flag and the TV is told only when the
// count of active holds crosses zero. UI code depends on this interface only.
//
// A hold is for photos (a slideshow or ambient mode showing stills) or for
// media (a video or Live Photo playing). While a photo hold is active and no
// media one is, the OLED keep-awake is asked to play (ADR 0023); it plays
// only if the user turned it on.

// What a holder shows while it holds.
export type PassiveViewingKind = "media" | "photos";

export type PassiveViewingHold = {
  // Whether this holder is passively viewing; repeating a value is harmless.
  set(active: boolean): void;
};

export type PassiveViewing = {
  // The number of active holds.
  activeCount(): number;
  // A new holder, not yet active; a media holder unless `kind` says photos.
  createHold(kind?: PassiveViewingKind): PassiveViewingHold;
};

type PassiveViewingOptions = {
  keepAwake?: Pick<KeepAwake, "set">;
  logger: Logger;
  windowRef?: Pick<Window, "webapis">;
};

const screenSaverOff = 0;
const screenSaverOn = 1;

export function createPassiveViewing(options: PassiveViewingOptions): PassiveViewing {
  const windowRef = options.windowRef || window;
  let activeCount = 0;
  let activePhotos = 0;
  let failureLogged = false;

  function logFailureOnce(error: unknown): void {
    if (!failureLogged) {
      failureLogged = true;
      options.logger.error("The TV screensaver could not be switched.", { error });
    }
  }

  function setTvScreenSaver(on: boolean): void {
    const appcommon = windowRef.webapis?.appcommon;

    // The desktop preview has no webapis; there is no TV screensaver there.
    if (!appcommon || typeof appcommon.setScreenSaver !== "function") {
      return;
    }

    const states = appcommon.AppCommonScreenSaverState;
    const state = on
      ? (states?.SCREEN_SAVER_ON ?? screenSaverOn)
      : (states?.SCREEN_SAVER_OFF ?? screenSaverOff);

    try {
      // The TV's answer is logged, so a TV whose screensaver still appears
      // shows whether the switch was accepted (ADR 0023).
      appcommon.setScreenSaver(
        state,
        () => options.logger.info(on ? "TV screensaver allowed." : "TV screensaver held off."),
        logFailureOnce
      );
    } catch (error) {
      logFailureOnce(error);
    }
  }

  return {
    activeCount: () => activeCount,
    createHold(kind = "media") {
      let active = false;

      return {
        set(next) {
          if (next === active) {
            return;
          }

          active = next;
          activeCount += next ? 1 : -1;

          if (kind === "photos") {
            activePhotos += next ? 1 : -1;
          }

          if (next && activeCount === 1) {
            setTvScreenSaver(false);
          } else if (!next && activeCount === 0) {
            setTvScreenSaver(true);
          }

          options.keepAwake?.set(activePhotos > 0 && activePhotos === activeCount);
        }
      };
    }
  };
}

// For screens and tests with nothing to tell the TV.
export const noPassiveViewing: PassiveViewing = {
  activeCount: () => 0,
  createHold: () => ({ set() {} })
};
