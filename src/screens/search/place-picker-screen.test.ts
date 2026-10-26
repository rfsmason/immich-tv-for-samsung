// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchPlaceLevel, SearchPlaceParent } from "../../domain/search";
import { AppError } from "../../errors/app-error";
import { remoteKeys } from "../../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../../test/app-markup";
import { mountPlacePicker, type PlacePickerController } from "./place-picker-screen";

// Invented places: Exampleland has regions, Sampleshire Isles has cities but
// no regions, and Testonia has no location detail below the country.
const places: Record<string, Record<string, string[]>> = {
  Exampleland: { "Example County": ["Exampleton", "Sampleford"], "North Example": [] },
  "Sampleshire Isles": { "": ["Sampleport", "Isleton"] },
  Testonia: {}
};
let controller: PlacePickerController | null = null;

function setup(
  options: { countries?: string[]; fail?: (level: SearchPlaceLevel) => Error | null } = {}
) {
  const loadPlaceSuggestions = vi.fn(
    async (level: SearchPlaceLevel, parent: SearchPlaceParent): Promise<string[]> => {
      const failure = options.fail?.(level);
      if (failure) throw failure;
      if (level === "country") return options.countries || Object.keys(places);
      const regions = places[parent.country || ""] || {};
      if (level === "state") return Object.keys(regions).filter((name) => name);
      return parent.state ? regions[parent.state] || [] : Object.values(regions).flat();
    }
  );
  const onCancel = vi.fn();
  const onDone = vi.fn();

  controller = mountPlacePicker({ onCancel, onDone, service: { loadPlaceSuggestions } });

  const status = () => byId("search-place-status");
  const focused = () => document.activeElement?.textContent ?? null;
  const rows = () =>
    Array.from(byId("search-place-list").querySelectorAll(".search-place-row")).map(
      (row) => row.textContent
    );
  const settle = async () => {
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
  };
  const press = async (keyCode: number, times = 1) => {
    for (let step = 0; step < times; step += 1) {
      pressKey(keyCode);
      await settle();
    }
  };

  return { focused, loadPlaceSuggestions, onCancel, onDone, press, rows, settle, status };
}

beforeEach(() => {
  loadAppMarkup();
});

afterEach(() => {
  controller?.destroy();
  controller = null;
});

describe("Search place picker", () => {
  it("goes from countries to regions to a city", async () => {
    const f = setup();
    controller!.open(null);
    await f.settle();

    expect(f.rows()).toEqual(["Exampleland", "Sampleshire Isles", "Testonia"]);
    expect(f.focused()).toBe("Exampleland");
    await f.press(remoteKeys.enter);

    expect(byId("search-place-path").textContent).toBe("Exampleland");
    expect(f.rows()).toEqual(["Anywhere in Exampleland", "Example County", "North Example"]);
    await f.press(remoteKeys.down);
    await f.press(remoteKeys.enter);

    expect(byId("search-place-path").textContent).toBe("Exampleland › Example County");
    expect(f.rows()).toEqual(["Anywhere in Example County", "Exampleton", "Sampleford"]);
    await f.press(remoteKeys.down, 2);
    await f.press(remoteKeys.enter);

    expect(f.onDone).toHaveBeenCalledWith({
      city: "Sampleford",
      country: "Exampleland",
      state: "Example County"
    });
  });

  it("chooses a whole country or region with Anywhere", async () => {
    const f = setup();
    controller!.open(null);
    await f.settle();
    await f.press(remoteKeys.enter);
    await f.press(remoteKeys.enter);

    expect(f.onDone).toHaveBeenLastCalledWith({ city: null, country: "Exampleland", state: null });
  });

  it("skips a level with no names", async () => {
    const f = setup();
    controller!.open(null);
    await f.settle();

    // No regions: straight to the country's cities.
    await f.press(remoteKeys.down);
    await f.press(remoteKeys.enter);
    expect(f.rows()).toEqual(["Anywhere in Sampleshire Isles", "Sampleport", "Isleton"]);
    await f.press(remoteKeys.back);
    expect(f.rows()[0]).toBe("Exampleland");

    // No regions or cities: the country itself.
    await f.press(remoteKeys.down, 2);
    await f.press(remoteKeys.enter);
    expect(f.onDone).toHaveBeenLastCalledWith({ city: null, country: "Testonia", state: null });
  });

  it("chooses a region that has no cities", async () => {
    const f = setup();
    controller!.open(null);
    await f.settle();
    await f.press(remoteKeys.enter);
    await f.press(remoteKeys.down, 2);
    await f.press(remoteKeys.enter);

    expect(f.onDone).toHaveBeenLastCalledWith({
      city: null,
      country: "Exampleland",
      state: "North Example"
    });
  });

  it("goes up a level with Back, refocusing the name it came from, then cancels", async () => {
    const f = setup();
    controller!.open(null);
    await f.settle();
    await f.press(remoteKeys.enter);
    await f.press(remoteKeys.down);
    await f.press(remoteKeys.enter);

    await f.press(remoteKeys.back);
    expect(f.focused()).toBe("Example County");
    await f.press(remoteKeys.back);
    expect(f.focused()).toBe("Exampleland");
    await f.press(remoteKeys.back);
    expect(f.onCancel).toHaveBeenCalledTimes(1);
    expect(f.onDone).not.toHaveBeenCalled();
  });

  it("opens on the current place's country and caches names per parent", async () => {
    const f = setup();
    controller!.open({ city: null, country: "Testonia", state: null });
    await f.settle();
    expect(f.focused()).toBe("Testonia");

    controller!.hide();
    controller!.open(null);
    await f.settle();
    expect(f.loadPlaceSuggestions).toHaveBeenCalledTimes(1);

    controller!.reset();
    controller!.open(null);
    await f.settle();
    expect(f.loadPlaceSuggestions).toHaveBeenCalledTimes(2);
  });

  it("renders only the rows near focus in a long list, and jumps letters with CH", async () => {
    const countries = Array.from(
      { length: 400 },
      (_, index) =>
        `${String.fromCharCode(65 + Math.floor(index / 40))}land ${String(index).padStart(3, "0")}`
    );
    const f = setup({ countries });
    controller!.open(null);
    await f.settle();

    expect(f.rows().length).toBeLessThan(30);
    await f.press(remoteKeys.down, 100);
    expect(f.focused()).toBe(countries[100]);
    expect(f.rows().length).toBeLessThan(30);
    expect(byId("search-place-list").querySelectorAll(".search-place-spacer")).toHaveLength(2);

    await f.press(remoteKeys.channelDown);
    expect(f.focused()).toBe(countries[120]);
    await f.press(remoteKeys.channelUp);
    expect(f.focused()).toBe(countries[80]);
    await f.press(remoteKeys.down, 3);
    await f.press(remoteKeys.channelUp);
    expect(f.focused()).toBe(countries[80]);
  });

  it("explains an empty library and keeps focus on the message", async () => {
    const f = setup({ countries: [] });
    controller!.open(null);
    await f.settle();

    expect(f.status().textContent).toBe("No places found. Photos need location data for this.");
    expect(document.activeElement).toBe(f.status());
    await f.press(remoteKeys.back);
    expect(f.onCancel).toHaveBeenCalled();
  });

  it("names Places when refused, and retries", async () => {
    let fail = true;
    const f = setup({
      fail: () => (fail ? new AppError("permission", "Refused.", { feature: "Places" }) : null)
    });
    controller!.open(null);
    await f.settle();

    expect(f.status().textContent).toContain("not allowed to show Places");
    expect(document.activeElement).toBe(byId("search-place-retry"));
    fail = false;
    await f.press(remoteKeys.enter);
    expect(f.rows()).toHaveLength(3);
    expect(byId("search-place-retry").hidden).toBe(true);
  });

  it("ignores a level that arrives after Back", async () => {
    let finish: (names: string[]) => void = () => undefined;
    const f = setup();
    controller!.open(null);
    await f.settle();
    f.loadPlaceSuggestions.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (finish = resolve))
    );
    await f.press(remoteKeys.enter);
    await f.press(remoteKeys.back);
    finish(["Late Region"]);
    await f.settle();

    expect(f.rows()).toEqual(["Exampleland", "Sampleshire Isles", "Testonia"]);
  });
});
