// @vitest-environment happy-dom
import type { Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Remote } from "../remote";
import { homeRail, homeTile, type ScenarioContext } from "./shared";

const rails = [
  "recently-added",
  "favorites",
  "videos",
  "people",
  "recently-viewed",
  "albums",
  "memories"
];

// DOM focus models the observable result of the app's keyboard navigation.
// No browser, server or capture job is launched by these unit tests.
function fixture(available = rails) {
  const nav = document.createElement("button");
  document.body.appendChild(nav);
  nav.focus();
  const tiles = available.map((rail, index) => {
    const tile = document.createElement("button");
    tile.setAttribute("data-home-rail", rail);
    tile.setAttribute("data-home-index", "0");
    tile.style.position = "absolute";
    tile.style.top = `${index * 400}px`;
    document.body.appendChild(tile);
    return tile;
  });
  const waitFor = vi.fn(async ({ state }: { state: string; timeout: number }) => {
    if (state !== "attached")
      throw new Error("Target must not require visibility before navigation.");
  });
  const page = {
    on: vi.fn(),
    setDefaultTimeout: vi.fn(),
    locator: vi.fn((selector: string) => ({
      first: () => ({ waitFor }),
      getAttribute: async (name: string) =>
        document.querySelector(selector)?.getAttribute(name) ?? null
    }))
  } as unknown as Page;
  const remote = new Remote(page);
  const right = vi.spyOn(remote, "right").mockImplementation(async (expected) => {
    tiles[0]?.focus();
    expect(document.activeElement?.matches(expected)).toBe(true);
  });
  const down = vi.spyOn(remote, "down").mockImplementation(async (expected) => {
    const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
    const next = tiles[index + 1];
    if (!next) throw new Error("Remote could not reach another Home rail.");
    next.focus();
    expect(document.activeElement?.matches(expected)).toBe(true);
  });
  const context: ScenarioContext = { page, remote, capture: { still: vi.fn() }, interval: 8 };
  return { context, tiles, waitFor, right, down, page };
}

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
});

describe("homeRail capture navigation", () => {
  it("attaches an initially off-screen target before navigating to its actual focus", async () => {
    const { context, tiles, waitFor, right, down, page } = fixture();
    const target = tiles[6]!;
    expect(target.isConnected).toBe(true);
    expect(Number.parseInt(target.style.top)).toBeGreaterThan(1080);
    expect(document.activeElement).not.toBe(target);

    await homeRail(context, "memories");

    expect(page.locator).toHaveBeenCalledWith(homeTile("memories"));
    expect(waitFor).toHaveBeenCalledWith({ state: "attached", timeout: 15_000 });
    expect(right).toHaveBeenCalledOnce();
    expect(down).toHaveBeenCalledTimes(6);
    expect(document.activeElement).toBe(target);
    expect(context.remote.step).toContain("attached");
  });

  it.each(rails)("reaches the %s rail using the same helper", async (rail) => {
    const { context, tiles, down } = fixture();
    await homeRail(context, rail);
    expect(document.activeElement).toBe(tiles[rails.indexOf(rail)]);
    expect(down).toHaveBeenCalledTimes(rails.indexOf(rail));
  });

  it("can enter a different first usable rail and skip empty rails", async () => {
    const { context, tiles, right, down } = fixture(["people", "memories"]);
    await homeRail(context, "memories");
    expect(right).toHaveBeenCalledWith("[data-home-rail][data-home-index]");
    expect(down).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(tiles[1]);
  });

  it("waits for async attachment before issuing any remote presses", async () => {
    const { context, tiles, waitFor, right } = fixture();
    const target = tiles[6]!;
    target.remove();
    let attach: (() => void) | undefined;
    waitFor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          attach = resolve;
        })
    );
    const navigation = homeRail(context, "memories");
    expect(target.isConnected).toBe(false);
    expect(right).not.toHaveBeenCalled();
    document.body.appendChild(target);
    attach!();
    await navigation;
    expect(document.activeElement?.getAttribute("data-home-rail")).toBe("memories");
  });

  it("does not navigate when the target never attaches", async () => {
    const { context, waitFor, right, down } = fixture();
    waitFor.mockRejectedValue(new Error("Attachment timed out."));
    await expect(homeRail(context, "memories")).rejects.toThrow("Attachment timed out.");
    expect(context.remote.step).toBe(`attached ${homeTile("memories")}`);
    expect(right).not.toHaveBeenCalled();
    expect(down).not.toHaveBeenCalled();
  });

  it("fails when remote focus cannot move to another rail", async () => {
    const { context, down } = fixture();
    down.mockRejectedValue(new Error("Focus did not move."));
    await expect(homeRail(context, "memories")).rejects.toThrow("Focus did not move.");
    expect(down).toHaveBeenCalledOnce();
  });

  it("stops after at most six Down presses when the requested rail is unreachable", async () => {
    const { context, tiles, down } = fixture();
    // Focus keeps moving, but cycles through the other six rails.
    down.mockImplementation(async (expected) => {
      const current = tiles.indexOf(document.activeElement as HTMLButtonElement);
      tiles[(current + 1) % 6]!.focus();
      expect(document.activeElement?.matches(expected)).toBe(true);
    });
    await expect(homeRail(context, "memories")).rejects.toThrow(
      "Required demo Home rail was not reachable."
    );
    expect(down).toHaveBeenCalledTimes(6);
  });
});
