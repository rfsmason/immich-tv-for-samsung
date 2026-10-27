// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ambientTimerStepMs, createAmbientTimers } from "./ambient-timers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ambient timers", () => {
  it("keeps a long wait in short steps and fires on time", () => {
    const timers = createAmbientTimers();
    const fired = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    timers.set(fired, 5 * 60000);
    vi.advanceTimersByTime(5 * 60000 - 1);
    expect(fired).not.toHaveBeenCalled();
    expect(timers.count()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(timers.count()).toBe(0);
    expect(
      Math.max(...setTimeoutSpy.mock.calls.map(([, delay]) => Number(delay ?? 0)))
    ).toBeLessThanOrEqual(ambientTimerStepMs);
  });

  it("fires as soon as a late step finds the time has passed", () => {
    const timers = createAmbientTimers();
    const fired = vi.fn();

    timers.set(fired, 5 * 60000);
    vi.setSystemTime(Date.now() + 5 * 60000);
    vi.advanceTimersByTime(ambientTimerStepMs);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("clears one timer, or all of them", () => {
    const timers = createAmbientTimers();
    const fired = vi.fn();

    const long = timers.set(fired, 5 * 60000);
    timers.set(fired, 1000);
    timers.clear(long);
    expect(timers.count()).toBe(1);
    timers.clearAll();
    vi.advanceTimersByTime(10 * 60000);
    expect(fired).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
