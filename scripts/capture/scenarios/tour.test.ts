import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import type { TourGuide } from "../tour-guide";
import type { ScenarioContext } from "./shared";
import { tour } from "./tour";

vi.mock("./shared", async (original) => ({
  ...(await original<typeof import("./shared")>()),
  secondAlbum: vi.fn(),
  viewer: vi.fn()
}));

function fixture(changes: 1 | 2) {
  const events: string[] = [];
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
  const highlight = vi.fn();
  const clear = vi.fn();
  const context: ScenarioContext = {
    page: {
      locator: () => ({ textContent: async () => "Photo 1 of 4" }),
      waitForFunction
    } as unknown as Page,
    remote: { ok, visible: vi.fn(), ready, back: vi.fn() } as unknown as Remote,
    guide: { highlight, clear } as unknown as TourGuide,
    capture: { still: vi.fn() },
    interval: 8,
    slideChanges: changes
  };
  return { context, events, ok, waitForFunction, highlight, clear };
}

describe("short slideshow tour", () => {
  it.each([1, 2] as const)(
    "shows %i change(s), then pauses before waiting for rendering",
    async (changes) => {
      const { context, events, ok, waitForFunction, highlight, clear } = fixture(changes);
      await tour.run(context);
      expect(waitForFunction).toHaveBeenCalledTimes(changes);
      expect(ok.mock.calls).toEqual([
        ["#asset-viewer-slideshow", { pauseAfter: false }],
        ["#asset-viewer-slideshow"]
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

  it("removes the annotation if waiting for an advance fails", async () => {
    const { context, waitForFunction, clear } = fixture(2);
    waitForFunction.mockRejectedValue(new Error("No advance"));
    await expect(tour.run(context)).rejects.toThrow("No advance");
    expect(clear).toHaveBeenCalledOnce();
  });
});
