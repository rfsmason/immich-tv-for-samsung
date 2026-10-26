import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import { enterTimelineRail, photosTour } from "./photos-tour";
import { searchTour } from "./search-tour";
import { searchAlbumPicker, searchPlacePicker, searchV2Panel } from "./search-v2";
import { settingsTour } from "./settings-tour";
import type { ScenarioContext } from "./shared";

type Action = { key: string; focus: string };

function fixture(rowLength = 6, masked = true) {
  const actions: Action[] = [];
  let column = 0;
  let inRail = false;
  const addStyleTag = vi.fn().mockResolvedValue(undefined);
  const press = (key: string) =>
    vi.fn(async (focus: string) => {
      actions.push({ key, focus });
      if (key === "right" && focus.includes("data-bucket-index")) {
        column += 1;
        inRail = column >= rowLength;
      }
      if (key === "ok" && focus === "[data-asset-index]") {
        column = 0;
        inRail = false;
      }
    });
  const remote = {
    up: press("up"),
    down: press("down"),
    left: press("left"),
    right: press("right"),
    ok: press("ok"),
    back: press("back"),
    visible: vi.fn(),
    hold: vi.fn()
  };
  const context: ScenarioContext = {
    page: {
      addStyleTag,
      evaluate: vi.fn().mockResolvedValue(masked),
      locator: () => ({
        getAttribute: async (name: string) =>
          name === "data-bucket-index" ? (inRail ? "0" : null) : inRail ? null : String(column),
        waitFor: vi.fn()
      })
    } as unknown as Page,
    remote: remote as unknown as Remote,
    capture: { still: vi.fn() },
    interval: 8
    // No guide: privacy and keyboard navigation must work with highlights off.
  };
  return { context, remote, actions, addStyleTag };
}

describe("Photos timeline tour", () => {
  it.each([1, 3, 6])("enters the RHS rail from a %i-tile date-section row", async (length) => {
    const { context, remote } = fixture(length);
    await enterTimelineRail(context);
    expect(remote.right).toHaveBeenCalledTimes(length);
  });

  it("fails within six Right presses if the rail cannot be reached", async () => {
    const { context, remote } = fixture(100);
    await expect(enterTimelineRail(context)).rejects.toThrow("could not reach");
    expect(remote.right).toHaveBeenCalledTimes(6);
  });

  it("selects and jumps to an older month, then returns to the newest month", async () => {
    const { context, remote, actions } = fixture();
    await photosTour.run(context);
    expect(remote.down).toHaveBeenCalledWith('#photos-timeline-rail [data-bucket-index="1"]');
    expect(remote.up).toHaveBeenCalledWith('#photos-timeline-rail [data-bucket-index="0"]');
    expect(
      actions.filter(({ key, focus }) => key === "ok" && focus === "[data-asset-index]")
    ).toHaveLength(2);
    expect(actions[actions.length - 1]).toEqual({ key: "up", focus: '[data-destination="home"]' });
  });
});

describe("Search person and date range tour", () => {
  it("selects a person and commits both dates before showing results", async () => {
    const { context, actions } = fixture();
    await searchTour.run(context);
    const selected = actions.findIndex(
      ({ key, focus }) => key === "ok" && focus.includes('aria-pressed="true"')
    );
    const from = actions.findIndex(
      ({ key, focus }) => key === "ok" && focus === '[data-search-control="from"]'
    );
    const to = actions.findIndex(
      ({ key, focus }) => key === "ok" && focus === '[data-search-control="to"]'
    );
    const results = actions.findIndex(
      ({ key, focus }) => key === "ok" && focus === '[data-asset-index="0"]'
    );
    expect(selected).toBeGreaterThan(-1);
    expect(from).toBeGreaterThan(selected);
    expect(to).toBeGreaterThan(from);
    expect(results).toBeGreaterThan(to);
    expect(actions).toContainEqual({ key: "back", focus: '[data-search-control="show"]' });
    expect(actions[actions.length - 1]).toEqual({ key: "up", focus: '[data-destination="home"]' });
  });
});

describe("Search v2 stills", () => {
  it("reaches each picker by remote and captures it", async () => {
    for (const [scenario, still] of [
      [searchPlacePicker, "search-place-picker"],
      [searchAlbumPicker, "search-album-picker"]
    ] as const) {
      const { context, actions } = fixture();
      await scenario.run(context);
      expect(actions[0]).toEqual({ key: "down", focus: '[data-destination="photos"]' });
      expect(context.capture.still).toHaveBeenCalledWith(still);
    }
  });

  it("chooses a person, an asset type, a place and an album, and ends on Show photos", async () => {
    const { context, actions } = fixture();
    await searchV2Panel.run(context);
    const okOn = (focus: string) =>
      actions.findIndex((action) => action.key === "ok" && action.focus === focus);

    expect(okOn('[data-search-control="asset-type"]')).toBeGreaterThan(-1);
    expect(okOn('[data-search-control="place-chip"]')).toBeGreaterThan(
      okOn('[data-search-control="asset-type"]')
    );
    expect(actions).toContainEqual({ key: "back", focus: '[data-search-control="add-albums"]' });
    expect(actions[actions.length - 1]).toEqual({
      key: "down",
      focus: '[data-search-control="show"]'
    });
    expect(context.capture.still).toHaveBeenCalledWith("search-v2-panel");
  });
});

describe("Settings recording privacy and navigation", () => {
  it("installs masking before opening Settings even without highlights", async () => {
    const { context, remote, actions, addStyleTag } = fixture();
    await settingsTour.run(context);
    expect(addStyleTag.mock.invocationCallOrder[0]).toBeLessThan(
      remote.down.mock.invocationCallOrder[0]!
    );
    expect(actions).toContainEqual({ key: "ok", focus: "#settings-save" });
    expect(actions.some(({ focus }) => focus.includes("api-key-visibility"))).toBe(false);
    expect(actions[actions.length - 1]).toEqual({ key: "up", focus: '[data-destination="home"]' });
  });

  it("never opens Settings when masking cannot be verified", async () => {
    const { context, actions } = fixture(6, false);
    await expect(settingsTour.run(context)).rejects.toThrow("Cannot safely mask");
    expect(actions).toHaveLength(0);
  });
});
