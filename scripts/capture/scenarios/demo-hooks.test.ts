import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import type { AlbumAsset } from "../../../src/domain/album";
import { createLivePhotoBadge, createVideoBadge } from "../../../src/screens/grid-presentation";
import { readDemoRow } from "./collection-demo";
import { scenarios } from "./index";

// The demo tours' own tests drive a fake remote, so they would keep passing
// if the app renamed a hook. These tests tie the tours to the app instead.
describe("Albums, Memories and media demo hooks", () => {
  it("registers albums-tour, memories-tour and media-tour as video scenarios", () => {
    const names = scenarios.map((scenario) => scenario.name);

    expect(new Set(names).size).toBe(names.length);
    for (const name of ["albums-tour", "memories-tour", "media-tour"]) {
      expect(scenarios.find((scenario) => scenario.name === name)?.video).toBe(true);
    }
  });

  it("reads the badges the app actually renders on grid tiles", async () => {
    const document = new Window().document as unknown as Document;
    const grid = document.createElement("div");
    grid.id = "album-assets-grid";
    const kinds = ["photo", "video", "live", "photo", "photo", "photo", "video"];
    kinds.forEach((kind, index) => {
      const tile = document.createElement("button");
      tile.setAttribute("data-asset-index", String(index));
      if (kind === "video") {
        tile.appendChild(createVideoBadge(document, { durationMs: 6000 } as AlbumAsset));
      } else if (kind === "live") {
        tile.appendChild(createLivePhotoBadge(document));
      }
      grid.appendChild(tile);
    });
    document.body.appendChild(grid);
    const page = {
      locator: (selector: string) => ({
        evaluateAll: (read: (elements: Element[]) => unknown) =>
          read(Array.from(document.querySelectorAll(selector)))
      })
    } as unknown as Page;

    // Only the first row (six tiles) is considered.
    expect(await readDemoRow(page)).toEqual([
      { index: 0, video: false, livePhoto: false },
      { index: 1, video: true, livePhoto: false },
      { index: 2, video: false, livePhoto: true },
      { index: 3, video: false, livePhoto: false },
      { index: 4, video: false, livePhoto: false },
      { index: 5, video: false, livePhoto: false }
    ]);
  });

  it("uses only element IDs that exist in the app markup", () => {
    const markup = readFileSync("index.html", "utf8");
    const tours = ["collection-demo", "media-tour", "albums-tour", "memories-tour"].map((name) =>
      readFileSync(`scripts/capture/scenarios/${name}.ts`, "utf8")
    );
    const ids = new Set(
      tours
        .join("\n")
        .match(/#[a-z][a-z-]+/g)
        ?.map((id) => id.slice(1))
    );

    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(markup, `#${id}`).toContain(`id="${id}"`);
    }
  });
});
