import type { Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Remote } from "./remote";

function fixture(delay = 0) {
  const keyboard = vi.fn().mockResolvedValue(undefined);
  const beforePress = vi.fn().mockResolvedValue(undefined);
  const page = {
    on: vi.fn(),
    setDefaultTimeout: vi.fn(),
    keyboard: { press: keyboard }
  } as unknown as Page;
  const remote = new Remote(page, { actionDelayMs: delay, beforePress });
  const focus = vi.spyOn(remote, "focus").mockResolvedValue(undefined);
  const ready = vi.spyOn(remote, "ready").mockResolvedValue(undefined);
  return { remote, keyboard, beforePress, focus, ready };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("tour remote pacing", () => {
  it("keeps still-capture actions free of editorial pauses", async () => {
    vi.useFakeTimers();
    const { remote, keyboard } = fixture();
    await remote.right(".tile");
    expect(keyboard).toHaveBeenCalledWith("ArrowRight");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adds a viewing pause only after focus and rendering are ready", async () => {
    vi.useFakeTimers();
    const { remote, ready, focus } = fixture(1200);
    let finished = false;
    const action = remote.right(".tile").then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1199);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await action;
    expect(finished).toBe(true);
  });

  it("removes annotations before the next keyboard action", async () => {
    const { remote, keyboard, beforePress } = fixture();
    await remote.back(".tile");
    expect(beforePress.mock.invocationCallOrder[0]).toBeLessThan(
      keyboard.mock.invocationCallOrder[0]!
    );
  });

  it("can start the slideshow without using up its interval on a viewing pause", async () => {
    vi.useFakeTimers();
    const { remote, ready } = fixture(1200);
    await remote.ok("#slideshow", { pauseAfter: false });
    expect(ready).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
