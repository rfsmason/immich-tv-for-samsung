import { describe, expect, it, vi } from "vitest";
import { createScreenRegistry } from "./screen-registry";

describe("screen registry", () => {
  it("hides every screen except the one being shown", () => {
    const screens = { a: { hide: vi.fn() }, b: { hide: vi.fn() }, c: { hide: vi.fn() } };
    const registry = createScreenRegistry(screens);

    registry.showOnly("b");

    expect(screens.a.hide).toHaveBeenCalledTimes(1);
    expect(screens.b.hide).not.toHaveBeenCalled();
    expect(screens.c.hide).toHaveBeenCalledTimes(1);
  });
});
