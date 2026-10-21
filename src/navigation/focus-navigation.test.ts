import { describe, expect, it } from "vitest";
import { createFocusNavigator, getNextFocusIndex, type FocusableElement } from "./focus-navigation";

describe("focus navigation", () => {
  it("starts at the first element when nothing is focused", () => {
    expect(getNextFocusIndex(-1, 4, 1)).toBe(0);
  });

  it("moves by offset within bounds", () => {
    expect(getNextFocusIndex(1, 4, 1)).toBe(2);
    expect(getNextFocusIndex(2, 4, -1)).toBe(1);
  });

  it("clamps to the first and last element", () => {
    expect(getNextFocusIndex(0, 4, -1)).toBe(0);
    expect(getNextFocusIndex(3, 4, 1)).toBe(3);
  });

  it("returns -1 when there is nowhere to focus", () => {
    expect(getNextFocusIndex(-1, 0, 1)).toBe(-1);
  });

  it("uses the injected active element provider", () => {
    const focused: string[] = [];
    const first = { focus: () => focused.push("first") } as unknown as FocusableElement;
    const second = { focus: () => focused.push("second") } as unknown as FocusableElement;
    const navigator = createFocusNavigator(
      () => [first, second],
      () => first
    );

    navigator.focusByOffset(1);

    expect(focused).toEqual(["second"]);
  });
});
