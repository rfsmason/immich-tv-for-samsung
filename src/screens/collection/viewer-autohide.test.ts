import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerControlsAutoHide } from "./viewer-autohide";

function fixture(hideAfterMs: number | null = 5000) {
  vi.useFakeTimers();
  const onHiddenChange = vi.fn();
  const delay = { current: hideAfterMs };
  const autoHide = createViewerControlsAutoHide({
    hideAfterMs: () => delay.current,
    onHiddenChange,
    windowRef: { clearTimeout, setTimeout } as Pick<Window, "clearTimeout" | "setTimeout">
  });

  return { autoHide, delay, onHiddenChange };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("viewer buttons auto-hide", () => {
  it("never hides while nothing plays, and a key then does nothing", () => {
    const { autoHide, onHiddenChange } = fixture();

    vi.advanceTimersByTime(15000);
    expect(autoHide.wake()).toBe(false);
    expect(onHiddenChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([3000, 5000, 10000, 15000])(
    "hides %i ms after playing starts, and a key shows them and restarts the delay",
    (delay) => {
      const { autoHide, onHiddenChange } = fixture(delay);

      autoHide.setPassive(true);
      vi.advanceTimersByTime(delay - 1);
      expect(autoHide.isHidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(autoHide.isHidden()).toBe(true);
      expect(autoHide.wake()).toBe(true);
      expect(autoHide.wake()).toBe(false);
      expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);

      vi.advanceTimersByTime(delay - 1);
      expect(autoHide.isHidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(autoHide.isHidden()).toBe(true);
    }
  );

  it("with Never keeps the buttons, so a key only acts", () => {
    const { autoHide, onHiddenChange } = fixture(null);

    autoHide.setPassive(true);
    vi.advanceTimersByTime(60000);
    expect(autoHide.isHidden()).toBe(false);
    expect(autoHide.wake()).toBe(false);
    expect(onHiddenChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a changed setting from the next key or playback", () => {
    const { autoHide, delay } = fixture(15000);

    autoHide.setPassive(true);
    delay.current = 3000;
    autoHide.wake();
    vi.advanceTimersByTime(3000);
    expect(autoHide.isHidden()).toBe(true);
  });

  it("shows them for good when playing stops, and leaves no timer behind", () => {
    const { autoHide, onHiddenChange } = fixture();

    autoHide.setPassive(true);
    vi.advanceTimersByTime(5000);
    autoHide.setPassive(false);
    expect(onHiddenChange).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);

    autoHide.setPassive(true);
    autoHide.destroy();
    expect(autoHide.isHidden()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
