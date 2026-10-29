import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import { enterTimelineRail, photosTour } from "./photos-tour";
import { ambientClock, settingsAmbient } from "./ambient";
import { homeHighContrast, settingsDisplay, viewerHighContrast, viewerSeek } from "./accessibility";
import { searchTour } from "./search-tour";
import { searchAlbumPicker, searchPlacePicker, searchV2Panel } from "./search-v2";
import { settingsTour } from "./settings-tour";
import type { ScenarioContext } from "./shared";

// Reaching a Home rail or an album has its own tests (shared.test.ts); these
// tours' tests start from there.
vi.mock("./shared", async (original) => ({
  ...(await original<typeof import("./shared")>()),
  homeRail: vi.fn(async () => undefined),
  secondAlbum: vi.fn(async () => undefined),
  viewer: vi.fn(async () => undefined)
}));

type Action = { key: string; focus: string };

// The demo library's names at their position in each picker.
const positions: Record<string, number> = {
  "Person B": 0,
  "Person A": 1,
  Spain: 2,
  "Balearic Islands": 1,
  Mallorca: 3
};

function fixture(rowLength = 6, masked = true) {
  const actions: Action[] = [];
  let column = 0;
  let inRail = false;
  let bucket = 0;
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
      const month = /data-bucket-index="(\d+)"\]$/.exec(focus);
      if ((key === "up" || key === "down") && month) bucket = Number(month[1]);
      if (key === "channelDown") bucket += 3;
      if (key === "channelUp") bucket = Math.max(0, bucket - 3);
    });
  const remote = {
    up: press("up"),
    down: press("down"),
    left: press("left"),
    right: press("right"),
    ok: press("ok"),
    back: press("back"),
    channelUp: press("channelUp"),
    channelDown: press("channelDown"),
    visible: vi.fn(),
    hold: vi.fn()
  };
  const context: ScenarioContext = {
    page: {
      addStyleTag,
      evaluate: vi.fn(async (_: unknown, args?: { name: string }) =>
        args ? String(positions[args.name]) : masked
      ),
      locator: () => ({
        getAttribute: async (name: string) =>
          name === "data-bucket-index"
            ? inRail
              ? String(bucket)
              : null
            : inRail
              ? null
              : String(column),
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

  it("selects and jumps to an older month, and ends back on Home", async () => {
    const { context, remote, actions } = fixture();
    await photosTour.run(context);
    expect(remote.down).toHaveBeenCalledWith('#photos-timeline-rail [data-bucket-index="1"]');
    expect(
      actions.filter(({ key, focus }) => key === "ok" && focus === "[data-asset-index]")
    ).toHaveLength(3);
    expect(actions[actions.length - 1]).toEqual({ key: "up", focus: '[data-destination="home"]' });
  });

  it("reverses the order and puts it back before using the rail", async () => {
    const { context, actions } = fixture();
    await photosTour.run(context);
    const sort = actions.filter(({ focus }) => focus.startsWith("#collection-sort-order"));
    expect(sort.map(({ key, focus }) => `${key} ${focus}`)).toEqual([
      "up #collection-sort-order",
      'ok #collection-sort-order[data-sort-order="oldest-first"]',
      'ok #collection-sort-order[data-sort-order="newest-first"]'
    ]);
  });

  it("steps by year with the channel keys, jumps there, then returns to the newest year", async () => {
    const { context, actions } = fixture();
    await photosTour.run(context);
    const keys = actions.map(({ key }) => key);
    expect(keys.filter((key) => key === "channelDown")).toHaveLength(2);
    expect(keys.filter((key) => key === "channelUp")).toHaveLength(3);
    expect(keys.lastIndexOf("channelDown")).toBeLessThan(keys.indexOf("channelUp"));
  });
});

describe("Search tour", () => {
  it("chooses two people, the default dates, Photos, a region and an album, then shows results", async () => {
    const { context, actions } = fixture();
    await searchTour.run(context);
    const okOn = (focus: string) =>
      actions.findIndex((action) => action.key === "ok" && action.focus === focus);
    const steps = [
      '#search-people-grid [data-person-index="0"][aria-pressed="true"]',
      '#search-people-grid [data-person-index="1"][aria-pressed="true"]',
      '[data-search-control="from"]',
      '[data-search-control="to"]',
      '[data-search-control="asset-type"]',
      '[data-search-control="place-chip"]',
      '#search-albums-grid [data-album-index="3"][aria-pressed="true"]',
      '[data-asset-index="0"]'
    ].map(okOn);

    expect(steps.every((step, index) => step > (index ? steps[index - 1]! : -1))).toBe(true);
    // Spain is the third country; the Balearic Islands follow "Anywhere in Spain".
    expect(actions).toContainEqual({
      key: "down",
      focus: '#search-place-list [data-place-index="2"]'
    });
    expect(actions).toContainEqual({
      key: "down",
      focus: '#search-place-list [data-place-index="1"]'
    });
    // The dates are kept as they open: no stepper is changed.
    expect(actions.some(({ key, focus }) => key !== "ok" && focus.includes("stepper"))).toBe(false);
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

describe("ambient mode stills", () => {
  it("reaches Settings → Ambient by remote and captures it with the fields masked", async () => {
    const { context, actions, addStyleTag } = fixture();
    await settingsAmbient.run(context);

    expect(addStyleTag).toHaveBeenCalled();
    expect(actions[actions.length - 1]).toEqual({ key: "right", focus: "#ambient-source" });
    expect(context.capture.still).toHaveBeenCalledWith("settings-ambient");
  });

  it("turns photo details on, starts ambient mode, captures it and returns with a key", async () => {
    const { context, actions } = fixture();
    await ambientClock.run(context);
    const index = (key: string, focus: string) =>
      actions.findIndex((action) => action.key === key && action.focus === focus);

    expect(index("ok", "#ambient-show-details:checked")).toBeGreaterThan(-1);
    expect(index("ok", "#ambient-screen")).toBeGreaterThan(
      index("ok", "#ambient-show-details:checked")
    );
    expect(context.capture.still).toHaveBeenCalledWith("ambient-clock");
    expect(actions[actions.length - 1]).toEqual({ key: "back", focus: "#ambient-start" });
  });
});

describe("accessibility stills", () => {
  it("opens Settings → Display on High contrast with the fields masked", async () => {
    const { context, actions, addStyleTag } = fixture();
    await settingsDisplay.run(context);

    expect(addStyleTag).toHaveBeenCalled();
    expect(actions[actions.length - 1]).toEqual({ key: "right", focus: "#high-contrast" });
    expect(context.capture.still).toHaveBeenCalledWith("settings-display");
  });

  it("turns High contrast on with the remote and saves before capturing Home and the viewer", async () => {
    for (const [scenario, still] of [
      [homeHighContrast, "home-high-contrast"],
      [viewerHighContrast, "viewer-high-contrast"]
    ] as const) {
      const { context, actions } = fixture();
      await scenario.run(context);
      const index = (key: string, focus: string) =>
        actions.findIndex((action) => action.key === key && action.focus === focus);

      expect(index("ok", "#high-contrast:checked")).toBeGreaterThan(-1);
      expect(index("ok", "#settings-save")).toBeGreaterThan(index("ok", "#high-contrast:checked"));
      expect(index("up", '[data-destination="home"]')).toBeGreaterThan(
        index("ok", "#settings-save")
      );
      expect(context.capture.still).toHaveBeenCalledWith(still);
    }
  });

  it("plays a video, pauses on its progress bar and skips ahead before capturing", async () => {
    const { context, actions } = fixture();
    (context.page as unknown as { waitForFunction: () => Promise<void> }).waitForFunction = vi
      .fn()
      .mockResolvedValue(undefined);
    await viewerSeek.run(context);

    expect(actions.slice(-4)).toEqual([
      { key: "up", focus: "#asset-viewer-seek" },
      { key: "ok", focus: "#asset-viewer-seek" },
      { key: "right", focus: "#asset-viewer-seek" },
      { key: "right", focus: "#asset-viewer-seek" }
    ]);
    expect(context.capture.still).toHaveBeenCalledWith("viewer-seek");
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

  it("visits every section, plays the chosen album in ambient mode, then saves", async () => {
    const { context, actions } = fixture();
    await settingsTour.run(context);
    const index = (key: string, focus: string) =>
      actions.findIndex((action) => action.key === key && action.focus === focus);
    const steps = [
      index("ok", "#server-url"),
      index("ok", "#slideshow-interval"),
      index("ok", "#home-rail-recently-viewed:not(:checked)"),
      index("ok", "#ambient-source"),
      index("ok", "#ambient-album"),
      index("ok", "#ambient-interval"),
      index("ok", "#ambient-screen"),
      index("back", "#ambient-start"),
      index("ok", "#settings-save")
    ];

    expect(steps.every((step, at) => step > (at ? steps[at - 1]! : -1))).toBe(true);
    // Mallorca is the fourth album: three Right presses along the first row.
    expect(actions).toContainEqual({
      key: "right",
      focus: '#search-albums-grid [data-album-index="3"]'
    });
  });

  it("never opens Settings when masking cannot be verified", async () => {
    const { context, actions } = fixture(6, false);
    await expect(settingsTour.run(context)).rejects.toThrow("Cannot safely mask");
    expect(actions).toHaveLength(0);
  });
});
