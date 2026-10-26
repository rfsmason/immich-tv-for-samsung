// Turns a held remote key into a growing step size. The first press of a hold
// is always the smallest step; the longer the key stays down, the larger each
// repeat's step (ADR 0017).
//
// A keydown continues the hold when it is the same key and either the browser
// marks it as a repeat or it arrives within `repeatWindowMs` of the last one.
// The repeat flag alone is enough because the first auto-repeat can come
// later than the window. Any other key, or a reset (keyup, leaving the rail,
// hiding the screen or the app), starts a new hold.

export type HoldStep = "single" | "boundary" | "skip-boundary";

export type HoldTimings = {
  // Below this hold time each repeat takes a single step.
  boundaryAfterMs: number;
  // From this hold time each repeat skips a boundary.
  skipBoundaryAfterMs: number;
  // A non-repeat keydown of the same key within this gap still counts as held.
  repeatWindowMs: number;
};

export const defaultHoldTimings: HoldTimings = {
  boundaryAfterMs: 1000,
  repeatWindowMs: 250,
  skipBoundaryAfterMs: 3000
};

export type HoldAccelerator = {
  press(key: string, repeat: boolean): HoldStep;
  reset(): void;
};

export function createHoldAccelerator(
  now: () => number,
  timings: HoldTimings = defaultHoldTimings
): HoldAccelerator {
  let heldKey: string | null = null;
  let holdStartedAt = 0;
  let lastPressAt = 0;

  return {
    press(key, repeat) {
      const time = now();
      const continues = heldKey === key && (repeat || time - lastPressAt <= timings.repeatWindowMs);

      lastPressAt = time;

      if (!continues) {
        heldKey = key;
        holdStartedAt = time;
        return "single";
      }

      const heldFor = time - holdStartedAt;

      if (heldFor >= timings.skipBoundaryAfterMs) {
        return "skip-boundary";
      }

      return heldFor >= timings.boundaryAfterMs ? "boundary" : "single";
    },
    reset() {
      heldKey = null;
    }
  };
}
