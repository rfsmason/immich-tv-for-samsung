// The viewer's buttons step aside during passive viewing (ADR 0006): while a
// slideshow runs or a video or Live Photo plays, they hide some seconds
// after the last remote key (Settings → Display → Hide playback buttons),
// and the next key shows them again. A key that only shows them does
// nothing else, so a press can't act on a button the viewer couldn't see;
// Back and the media keys still act as well. With "Never" they stay.

type ViewerControlsAutoHideOptions = {
  // How long the buttons stay after passive viewing starts or a key is
  // pressed, read each time; null keeps them.
  hideAfterMs(): number | null;
  // Shows or hides the buttons.
  onHiddenChange(hidden: boolean): void;
  windowRef?: Pick<Window, "clearTimeout" | "setTimeout">;
};

export type ViewerControlsAutoHide = {
  destroy(): void;
  isHidden(): boolean;
  // Passive viewing started or stopped. Starting begins the countdown;
  // stopping shows the buttons for good.
  setPassive(passive: boolean): void;
  // A remote key: shows the buttons and restarts the countdown. True when
  // they were hidden.
  wake(): boolean;
};

export function createViewerControlsAutoHide(
  options: ViewerControlsAutoHideOptions
): ViewerControlsAutoHide {
  // The global timers unless a test supplies its own.
  const timers: Pick<Window, "clearTimeout" | "setTimeout"> = options.windowRef || {
    clearTimeout: (id) => clearTimeout(id),
    setTimeout: (handler, timeout) => Number(setTimeout(handler as () => void, timeout))
  };
  let passive = false;
  let hidden = false;
  let timerId: number | null = null;

  function clearTimer(): void {
    if (timerId !== null) {
      timers.clearTimeout(timerId);
      timerId = null;
    }
  }

  function setHidden(next: boolean): void {
    if (hidden !== next) {
      hidden = next;
      options.onHiddenChange(next);
    }
  }

  function restart(): void {
    const delay = options.hideAfterMs();

    clearTimer();

    if (delay === null) {
      return;
    }

    timerId = timers.setTimeout(() => {
      timerId = null;
      setHidden(true);
    }, delay);
  }

  return {
    destroy() {
      clearTimer();
      passive = false;
      setHidden(false);
    },
    isHidden: () => hidden,
    setPassive(next) {
      if (next === passive) {
        return;
      }

      passive = next;

      if (passive) {
        restart();
        return;
      }

      clearTimer();
      setHidden(false);
    },
    wake() {
      if (!passive) {
        return false;
      }

      const wasHidden = hidden;

      setHidden(false);
      restart();
      return wasHidden;
    }
  };
}
