import { describe, expect, it } from "vitest";
import { createHoldAccelerator, defaultHoldTimings } from "./hold-accelerator";

function createClock() {
  let time = 10_000;

  return {
    advance(ms: number) {
      time += ms;
    },
    now: () => time
  };
}

// Presses `key` as an auto-repeating hold every `intervalMs` until `untilMs`
// after the first press, returning the step of the last press.
function holdFor(
  accelerator: ReturnType<typeof createHoldAccelerator>,
  clock: ReturnType<typeof createClock>,
  untilMs: number,
  intervalMs = 100
) {
  let step = accelerator.press("down", false);

  for (let elapsed = intervalMs; elapsed <= untilMs; elapsed += intervalMs) {
    clock.advance(intervalMs);
    step = accelerator.press("down", true);
  }

  return step;
}

describe("hold accelerator", () => {
  it("names its thresholds", () => {
    expect(defaultHoldTimings).toEqual({
      boundaryAfterMs: 1000,
      repeatWindowMs: 250,
      skipBoundaryAfterMs: 3000
    });
  });

  it("always takes a single step on the first press", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    expect(accelerator.press("down", false)).toBe("single");
    // Even a press flagged as a repeat starts a new hold when nothing is held.
    expect(createHoldAccelerator(clock.now).press("down", true)).toBe("single");
  });

  it("grows from single steps to boundaries to skipped boundaries", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    expect(holdFor(accelerator, clock, 900)).toBe("single");
    accelerator.reset();
    expect(holdFor(accelerator, clock, 1000)).toBe("boundary");
    accelerator.reset();
    expect(holdFor(accelerator, clock, 2900)).toBe("boundary");
    accelerator.reset();
    expect(holdFor(accelerator, clock, 3000)).toBe("skip-boundary");
  });

  it("treats a quick same-key press without the repeat flag as held", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    accelerator.press("down", false);
    for (let count = 0; count < 5; count += 1) {
      clock.advance(defaultHoldTimings.repeatWindowMs);
      accelerator.press("down", false);
    }

    expect(accelerator.press("down", false)).toBe("boundary");
  });

  it("starts again after a gap beyond the window", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    holdFor(accelerator, clock, 1500);
    clock.advance(defaultHoldTimings.repeatWindowMs + 1);
    expect(accelerator.press("down", false)).toBe("single");
  });

  it("keeps a flagged repeat held even when the first repeat is slow", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    accelerator.press("down", false);
    clock.advance(1100);
    expect(accelerator.press("down", true)).toBe("boundary");
  });

  it("starts again on a different key or change of direction", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    holdFor(accelerator, clock, 1500);
    clock.advance(50);
    expect(accelerator.press("up", true)).toBe("single");
    clock.advance(50);
    expect(accelerator.press("up", true)).toBe("single");
  });

  it("starts again after a reset", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now);

    holdFor(accelerator, clock, 3500);
    accelerator.reset();
    clock.advance(50);
    expect(accelerator.press("down", true)).toBe("single");
  });

  it("uses injected timings", () => {
    const clock = createClock();
    const accelerator = createHoldAccelerator(clock.now, {
      boundaryAfterMs: 100,
      repeatWindowMs: 50,
      skipBoundaryAfterMs: 200
    });

    accelerator.press("down", false);
    clock.advance(100);
    expect(accelerator.press("down", true)).toBe("boundary");
    clock.advance(100);
    expect(accelerator.press("down", true)).toBe("skip-boundary");
  });
});
