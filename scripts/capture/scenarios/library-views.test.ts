import { describe, expect, it, vi } from "vitest";
import { scenarios } from "./index";
import * as shared from "./shared";
import type { ScenarioContext } from "./shared";

// Loads the scenario list without a browser or server, as CI does.
describe("library view capture scenarios", () => {
  it("lists favorites, videos and recently-added as still scenarios with unique names", () => {
    const names = scenarios.map((scenario) => scenario.name);

    expect(names).toEqual(expect.arrayContaining(["favorites", "videos", "recently-added"]));
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["favorites", "videos", "recently-added"]) {
      expect(scenarios.find((scenario) => scenario.name === name)?.video).toBeFalsy();
    }
  });

  it.each(["favorites", "videos", "recently-added"])(
    "%s reaches its Home rail by remote and captures the opened view",
    async (name) => {
      const homeRail = vi.spyOn(shared, "homeRail").mockResolvedValue();
      const remote = { ok: vi.fn(async () => undefined), visible: vi.fn(async () => undefined) };
      const still = vi.fn(async () => undefined);
      const context = { capture: { still }, interval: 8, remote } as unknown as ScenarioContext;

      await scenarios.find((scenario) => scenario.name === name)!.run(context);

      expect(homeRail).toHaveBeenCalledWith(context, name);
      expect(remote.ok).toHaveBeenCalledWith(shared.asset);
      expect(remote.visible).toHaveBeenCalledWith("#album-assets-grid .asset-thumbnail");
      expect(still).toHaveBeenCalledWith(name);
      homeRail.mockRestore();
    }
  );
});
