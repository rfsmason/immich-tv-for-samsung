import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerControlsAutoHide, viewerControlsHideMs } from "./viewer-autohide";

function fixture() {
  vi.useFakeTimers();
  const onHiddenChange = vi.fn();
  const autoHide = createViewerControlsAutoHide({
    onHiddenChange,
    windowRef: { clearTimeout, setTimeout } as Pick<Window, "clearTimeout" | "setTimeout">
  });

  return { autoHide, onHiddenChange };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("viewer buttons auto-hide", () => {
  it("never hides while nothing plays, and a key then does nothing", () => {
    const { autoHide, onHiddenChange } = fixture();

    vi.advanceTimersByTime(viewerControlsHideMs * 3);
    expect(autoHide.wake()).toBe(false);
    expect(onHiddenChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides after the delay, and a key shows them and restarts the delay", () => {
    const { autoHide, onHiddenChange } = fixture();

    autoHide.setPassive(true);
    vi.advanceTimersByTime(viewerControlsHideMs);
    expect(autoHide.isHidden()).toBe(true);
    expect(autoHide.wake()).toBe(true);
    expect(autoHide.wake()).toBe(false);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);

    vi.advanceTimersByTime(viewerControlsHideMs - 1);
    expect(autoHide.isHidden()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(autoHide.isHidden()).toBe(true);
  });

  it("shows them for good when playing stops, and leaves no timer behind", () => {
    const { autoHide, onHiddenChange } = fixture();

    autoHide.setPassive(true);
    vi.advanceTimersByTime(viewerControlsHideMs);
    autoHide.setPassive(false);
    expect(onHiddenChange).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);

    autoHide.setPassive(true);
    autoHide.destroy();
    expect(autoHide.isHidden()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
