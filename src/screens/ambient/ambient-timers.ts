// The timers one part of ambient mode has running, so stopping it clears
// every one of them and nothing outlives it (ADR 0019). A wait longer than
// 30 seconds is kept against the wall clock in steps of at most 30 seconds,
// never as one long timer: on the TV a single timer of 10 minutes or more
// was seen not to fire.

export type AmbientTimers = {
  clear(id: number): void;
  clearAll(): void;
  // The number of timers still pending.
  count(): number;
  set(callback: () => void, delayMs: number): number;
};

// The longest single timer set.
export const ambientTimerStepMs = 30000;

export function createAmbientTimers(
  windowRef: Pick<Window, "clearTimeout" | "setTimeout"> = window
): AmbientTimers {
  // Each pending timer by its own id, with the browser timer now running.
  const pending: Record<number, number> = {};
  let nextId = 1;

  function clear(id: number): void {
    if (pending[id] !== undefined) {
      windowRef.clearTimeout(pending[id]!);
      delete pending[id];
    }
  }

  return {
    clear,
    clearAll() {
      Object.keys(pending).forEach((id) => clear(Number(id)));
    },
    count: () => Object.keys(pending).length,
    set(callback, delayMs) {
      const id = nextId;
      const due = Date.now() + delayMs;
      const step = () => {
        const remaining = due - Date.now();

        if (remaining > 0) {
          pending[id] = windowRef.setTimeout(step, Math.min(remaining, ambientTimerStepMs));
          return;
        }

        delete pending[id];
        callback();
      };

      nextId += 1;
      pending[id] = windowRef.setTimeout(step, Math.min(delayMs, ambientTimerStepMs));
      return id;
    }
  };
}
