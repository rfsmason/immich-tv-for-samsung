// The timers one part of ambient mode has running, so stopping it clears
// every one of them and nothing outlives it (ADR 0019).

export type AmbientTimers = {
  clear(id: number): void;
  clearAll(): void;
  // The number of timers still pending.
  count(): number;
  set(callback: () => void, delayMs: number): number;
};

export function createAmbientTimers(
  windowRef: Pick<Window, "clearTimeout" | "setTimeout"> = window
): AmbientTimers {
  const pending: Record<number, true> = {};

  return {
    clear(id) {
      windowRef.clearTimeout(id);
      delete pending[id];
    },
    clearAll() {
      Object.keys(pending).forEach((id) => windowRef.clearTimeout(Number(id)));
      Object.keys(pending).forEach((id) => delete pending[Number(id)]);
    },
    count: () => Object.keys(pending).length,
    set(callback, delayMs) {
      const id = windowRef.setTimeout(() => {
        delete pending[id];
        callback();
      }, delayMs);

      pending[id] = true;
      return id;
    }
  };
}
