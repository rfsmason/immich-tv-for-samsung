import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import type { TourGuide } from "../tour-guide";
import type { ScenarioContext } from "./shared";
import { tour } from "./tour";

const events = vi.hoisted((): string[] => []);

vi.mock("./shared", async (original) => ({
  ...(await original<typeof import("./shared")>()),
  homeAlbum: vi.fn(async () => {
    events.push("album");
  }),
  reverseOrder: vi.fn(async () => {
    events.push("reverse");
  }),
  showFaces: vi.fn(async () => {
    events.push("faces");
  }),
  viewer: vi.fn(async () => {
    events.push("viewer");
  })
}));

// `pausedAfterOk`: whether the first OK pauses, or only shows the buttons.
function fixture(changes: 1 | 2 | 3, pausedAfterOk = true) {
  events.length = 0;
  const ok = vi.fn(async () => {
    events.push("ok");
  });
  const ready = vi.fn(async () => {
    events.push("ready");
  });
  let count = 1;
  const waitForFunction = vi.fn(async () => {
    count += 1;
    events.push("advance");
    return { jsonValue: async () => `Photo ${count} of 4`, dispose: vi.fn() };
  });
  const back = vi.fn();
  const highlight = vi.fn();
  const clear = vi.fn();
  const context: ScenarioContext = {
    page: {
      locator: () => ({
        count: async () => (pausedAfterOk ? 1 : 0),
        textContent: async () => "Photo 1 of 4"
      }),
      waitForFunction
    } as unknown as Page,
    remote: {
      ok,
      visible: vi.fn(),
      ready,
      back,
      down: vi.fn(),
      hold: vi.fn()
    } as unknown as Remote,
    guide: { highlight, clear } as unknown as TourGuide,
    capture: { still: vi.fn() },
    interval: 8,
    slideChanges: changes
  };
  return { context, events, ok, back, waitForFunction, highlight, clear };
}

describe("general tour", () => {
  it("reverses the fourth album, then pauses on the fourth photo, shows faces and returns Home", async () => {
    const { context, back } = fixture(3);
    const shared = await import("./shared");
    await tour.run(context);
    expect(shared.homeAlbum).toHaveBeenCalledWith(context, 3);
    expect(shared.reverseOrder).toHaveBeenCalledWith(context, "oldest-first");
    expect(events.filter((event) => event !== "ready")).toEqual([
      "album",
      "reverse",
      "viewer",
      "ok",
      "advance",
      "advance",
      "advance",
      "ok",
      "faces"
    ]);
    expect(back).toHaveBeenLastCalledWith('[data-home-rail="albums"][data-home-index="3"]');
  });

  it.each([1, 2, 3] as const)(
    "shows %i change(s), then pauses before waiting for rendering",
    async (changes) => {
      const { context, events, ok, waitForFunction, highlight, clear } = fixture(changes);
      await tour.run(context);
      expect(waitForFunction).toHaveBeenCalledTimes(changes);
      expect(ok.mock.calls).toEqual([
        ["#asset-viewer-slideshow", { pauseAfter: false }],
        ["#asset-viewer-slideshow", { pauseAfter: false }]
      ]);
      const finalAdvance = events.lastIndexOf("advance");
      expect(events.slice(finalAdvance, finalAdvance + 3)).toEqual(["advance", "ok", "ready"]);
      expect(highlight).toHaveBeenCalledWith(
        "#asset-viewer-slideshow",
        "Next photo countdown",
        "::after"
      );
      expect(clear).toHaveBeenCalledOnce();
    }
  );

  it("presses OK again when the first press only shows the hidden buttons", async () => {
    const { context, ok } = fixture(3, false);
    await tour.run(context);
    expect(ok).toHaveBeenCalledTimes(3);
  });

  it("removes the annotation if waiting for an advance fails", async () => {
    const { context, waitForFunction, clear } = fixture(2);
    waitForFunction.mockRejectedValue(new Error("No advance"));
    await expect(tour.run(context)).rejects.toThrow("No advance");
    expect(clear).toHaveBeenCalledOnce();
  });
});
