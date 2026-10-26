import type { AmbientSettings } from "../domain/ambient";
import type { AppLifecycle } from "../platform/tizen/lifecycle";
import type { AmbientScreenController } from "../screens/ambient/ambient-screen";
import type { AmbientAssetSource } from "./ambient-sources";

// When ambient mode starts and stops (ADR 0019):
// - Start now, from Settings → Ambient.
// - Start after idle: one timer, reset by any key, that starts ambient mode
//   only over a browsing screen (the app decides which). A quiet start shows
//   nothing unless there is a picture to show.
// - Any key, or Stop after, ends it and returns exactly where you were: the
//   same screen and the same focused control. Ending releases the TV's
//   screensaver, so its own power saving can take over overnight.
// - Hiding the app stops ambient mode and its media. Showing it again
//   resumes a manual start; an idle start returns to where you were.

export type AmbientOrigin = "idle" | "manual";

type AmbientControllerOptions = {
  // Whether ambient mode may start by itself over the screen now showing.
  canStartFromIdle(): boolean;
  createSource(settings: AmbientSettings): AmbientAssetSource;
  documentRef?: Document;
  lifecycle: Pick<AppLifecycle, "onVisibilityChange">;
  // After ambient mode ends; focus is already back where it was if that
  // control still exists, so this is the fallback.
  onEnded(focusRestored: boolean): void;
  onStarted(): void;
  screen: Pick<AmbientScreenController, "isActive" | "start" | "stop">;
  // The saved settings.
  settings(): AmbientSettings;
  windowRef?: Pick<Window, "clearTimeout" | "setTimeout">;
};

export type AmbientController = {
  destroy(): void;
  // Ends ambient mode and returns where you were (any key does this).
  exit(): void;
  isActive(): boolean;
  // Re-reads the saved settings, for example after Settings are saved.
  refresh(): void;
  // Starts now with these settings (the Settings form's current choices).
  startNow(settings: AmbientSettings): void;
};

type Session = {
  deadline: number | null;
  origin: AmbientOrigin;
  returnFocus: Element | null;
  settings: AmbientSettings;
};

export function createAmbientController(options: AmbientControllerOptions): AmbientController {
  const documentRef = options.documentRef || document;
  const windowRef = options.windowRef || window;
  let session: Session | null = null;
  let hiddenSession: Session | null = null;
  let idleTimer: number | null = null;
  let stopTimer: number | null = null;
  let visible = true;
  let startId = 0;

  function clearIdle(): void {
    if (idleTimer !== null) {
      windowRef.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function clearStop(): void {
    if (stopTimer !== null) {
      windowRef.clearTimeout(stopTimer);
      stopTimer = null;
    }
  }

  // One idle timer, restarted from the last key.
  function armIdle(): void {
    clearIdle();

    const minutes = options.settings().startAfterIdleMinutes;

    if (minutes > 0 && visible && !session) {
      idleTimer = windowRef.setTimeout(handleIdle, minutes * 60 * 1000);
    }
  }

  function handleIdle(): void {
    idleTimer = null;

    if (options.canStartFromIdle()) {
      start("idle", options.settings(), documentRef.activeElement, null);
    } else {
      armIdle();
    }
  }

  function scheduleStop(current: Session): void {
    clearStop();

    if (current.deadline !== null) {
      stopTimer = windowRef.setTimeout(end, Math.max(0, current.deadline - Date.now()));
    }
  }

  function start(
    origin: AmbientOrigin,
    settings: AmbientSettings,
    returnFocus: Element | null,
    deadline: number | null
  ): void {
    if (session) {
      return;
    }

    const id = (startId += 1);
    const current: Session = {
      deadline:
        deadline ??
        (settings.stopAfterHours > 0
          ? Date.now() + settings.stopAfterHours * 60 * 60 * 1000
          : null),
      origin,
      returnFocus,
      settings
    };

    clearIdle();
    session = current;
    options.onStarted();
    scheduleStop(current);
    void options.screen
      .start({
        quiet: origin === "idle",
        settings,
        source: options.createSource(settings)
      })
      .then((outcome) => {
        // A quiet start with nothing to show never showed: carry on as before.
        if (outcome === "unavailable" && id === startId && session === current) {
          finish(current);
        }
      });
  }

  function finish(ended: Session): void {
    startId += 1;
    session = null;
    clearStop();
    options.screen.stop();

    const target = ended.returnFocus as HTMLElement | null;
    const restorable =
      Boolean(target) &&
      documentRef.contains(target) &&
      target !== documentRef.body &&
      !target!.closest("[hidden]");

    if (restorable) {
      target!.focus();
    }

    options.onEnded(restorable);
    armIdle();
  }

  function end(): void {
    if (session) {
      finish(session);
    }
  }

  const handleKeydown = () => {
    // Any key while browsing restarts the idle countdown.
    if (!session) {
      armIdle();
    }
  };
  const stopListening = options.lifecycle.onVisibilityChange((visibility) => {
    visible = visibility === "visible";

    if (!visible) {
      clearIdle();

      if (session) {
        // Stop ambient mode and its media; remember how it started.
        hiddenSession = session;
        startId += 1;
        session = null;
        clearStop();
        options.screen.stop();
      }

      return;
    }

    const resumed = hiddenSession;

    hiddenSession = null;

    if (resumed?.origin === "manual") {
      if (resumed.deadline !== null && resumed.deadline <= Date.now()) {
        finish(resumed);
        return;
      }

      start("manual", resumed.settings, resumed.returnFocus, resumed.deadline);
      return;
    }

    if (resumed) {
      finish(resumed);
      return;
    }

    armIdle();
  });

  documentRef.addEventListener("keydown", handleKeydown, true);
  armIdle();

  return {
    destroy() {
      clearIdle();
      clearStop();
      stopListening();
      documentRef.removeEventListener("keydown", handleKeydown, true);
      if (session) {
        session = null;
        options.screen.stop();
      }
    },
    exit: end,
    isActive: () => session !== null,
    refresh: armIdle,
    startNow(settings) {
      start("manual", settings, documentRef.activeElement, null);
    }
  };
}
