import { describe, expect, it } from "vitest";
import { remoteKeys } from "../platform/tizen/keys";
import { createDropdownState, readDropdownKey } from "./dropdown";

describe("drop-down state", () => {
  it("opens on the current value, moves with Up and Down, and chooses with OK", () => {
    const dropdown = createDropdownState(4);

    expect(dropdown.isOpen()).toBe(false);
    expect(dropdown.open(1)).toBe(1);
    expect(dropdown.handleKey("down")).toEqual({ focus: 2 });
    expect(dropdown.handleKey("up")).toEqual({ focus: 1 });
    expect(dropdown.handleKey("enter")).toEqual({ chosen: 1, closed: true });
    expect(dropdown.isOpen()).toBe(false);
  });

  it("closes unchanged on Back, Left, Right, or past either end", () => {
    const dropdown = createDropdownState(2);

    for (const key of ["back", "left", "right"] as const) {
      dropdown.open(0);
      expect(dropdown.handleKey(key)).toEqual({ closed: true });
    }

    dropdown.open(0);
    expect(dropdown.handleKey("up")).toEqual({ closed: true });
    dropdown.open(1);
    expect(dropdown.handleKey("down")).toEqual({ closed: true });
    expect(dropdown.highlighted()).toBeNull();
  });

  it("reads remote keys, closing on any other key", () => {
    expect(readDropdownKey(remoteKeys.enter)).toBe("enter");
    expect(readDropdownKey(remoteKeys.up)).toBe("up");
    expect(readDropdownKey(remoteKeys.back)).toBe("back");
    expect(readDropdownKey(remoteKeys.channelUp)).toBe("back");
  });
});
