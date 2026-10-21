import { Window } from "happy-dom";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import type { ScenarioContext } from "./shared";
import { collectionDemo } from "./collection-demo";
import { albumsTour } from "./albums-tour";
import { memoriesTour } from "./memories-tour";

function fixture(types = ["photo", "live", "video"]) {
  const document = new Window().document;
  document.body.innerHTML = types
    .map(
      (type, index) =>
        `<button data-asset-index="${index}">${type === "video" ? '<span class="asset-video-badge"></span>' : type === "live" ? '<span class="asset-live-photo-badge"></span>' : ""}</button>`
    )
    .join("");
  const actions: { key: string; focus: string }[] = [];
  const press = (key: string) =>
    vi.fn(async (focus: string) => {
      actions.push({ key, focus });
    });
  const remote = {
    up: press("up"),
    down: press("down"),
    right: press("right"),
    left: press("left"),
    ok: press("ok"),
    back: press("back"),
    attached: vi.fn(),
    visible: vi.fn(),
    hold: vi.fn(),
    step: ""
  };
  const waitForFunction = vi.fn().mockResolvedValue(undefined);
  const context: ScenarioContext = {
    remote: remote as unknown as Remote,
    page: {
      locator: () => ({
        evaluateAll: (read: (elements: Element[]) => unknown) =>
          read(Array.from(document.querySelectorAll("button")) as unknown as Element[]),
        getAttribute: async () => "memories"
      }),
      waitForFunction
    } as unknown as Page,
    interval: 8,
    capture: { still: vi.fn() }
  };
  return { context, remote, actions, waitForFunction };
}

describe("Album and Memory collection demos", () => {
  it("opens a still photo, restores grid focus, then plays and pauses a video", async () => {
    const f = fixture();
    await collectionDemo(f.context);
    expect(f.actions).toEqual([
      { key: "right", focus: '[data-asset-index="1"]' },
      { key: "left", focus: '[data-asset-index="0"]' },
      { key: "ok", focus: "#asset-viewer-slideshow" },
      { key: "back", focus: '[data-asset-index="0"]' },
      { key: "right", focus: '[data-asset-index="1"]' },
      { key: "right", focus: '[data-asset-index="2"]' },
      { key: "ok", focus: "#asset-viewer-play" },
      { key: "ok", focus: "#asset-viewer-play" },
      { key: "ok", focus: "#asset-viewer-play" },
      { key: "back", focus: '[data-asset-index="2"]' }
    ]);
    expect(f.waitForFunction).toHaveBeenCalledOnce();
    expect(f.remote.visible).toHaveBeenCalledWith(
      '#asset-viewer-status[data-player-state="paused"]'
    );
  });
  it("skips Live Photos for the ordinary photo and navigates backwards to an earlier video", async () => {
    const f = fixture(["live", "video", "photo"]);
    await collectionDemo(f.context);
    expect(f.actions).toContainEqual({ key: "back", focus: '[data-asset-index="2"]' });
    expect(f.actions).toContainEqual({ key: "left", focus: '[data-asset-index="1"]' });
    expect(f.actions[f.actions.length - 1]).toEqual({
      key: "back",
      focus: '[data-asset-index="1"]'
    });
  });
  it.each([
    ["photo", "live"],
    ["video", "live"],
    ["photo", "photo", "photo", "photo", "photo", "photo", "video"]
  ])("fails before navigating when the first row lacks both media types (%j)", async (...types) => {
    const f = fixture(types);
    await expect(collectionDemo(f.context)).rejects.toThrow("photo and video");
    expect(f.actions).toHaveLength(0);
  });
  it("shows two ordinary photos in a photo-only Memory without pretending to play a clip", async () => {
    const f = fixture(["photo", "live", "photo"]);
    await collectionDemo(f.context, false);
    expect(
      f.actions.filter(({ key, focus }) => key === "ok" && focus === "#asset-viewer-slideshow")
    ).toHaveLength(2);
    expect(f.actions[f.actions.length - 1]).toEqual({
      key: "back",
      focus: '[data-asset-index="2"]'
    });
    expect(f.waitForFunction).not.toHaveBeenCalled();
    expect(f.actions.some(({ focus }) => focus === "#asset-viewer-play")).toBe(false);
  });
  it("still plays a real video in Memories when one is available", async () => {
    const f = fixture();
    await collectionDemo(f.context, false);
    expect(f.waitForFunction).toHaveBeenCalledOnce();
  });
  it("does not report success when media progress times out", async () => {
    const f = fixture();
    f.waitForFunction.mockRejectedValue(new Error("Playback timeout"));
    await expect(collectionDemo(f.context)).rejects.toThrow("Playback timeout");
    expect(f.actions[f.actions.length - 1]).toEqual({ key: "ok", focus: "#asset-viewer-play" });
    expect(f.remote.step).toContain("actual media progress");
  });
  it("Albums starts from the section, browses album cards and returns to the section rail on Back", async () => {
    const f = fixture();
    await albumsTour.run(f.context);
    expect(f.actions.slice(0, 6)).toEqual([
      { key: "down", focus: '[data-destination="photos"]' },
      { key: "down", focus: '[data-destination="albums"]' },
      { key: "right", focus: '[data-album-index="0"]' },
      { key: "right", focus: '[data-album-index="1"]' },
      { key: "left", focus: '[data-album-index="0"]' },
      { key: "ok", focus: '[data-asset-index="0"]' }
    ]);
    expect(f.actions).toContainEqual({ key: "back", focus: '[data-destination="albums"]' });
    expect(f.actions[f.actions.length - 1]).toEqual({
      key: "up",
      focus: '[data-destination="home"]'
    });
  });
  it("Memories reaches its Home rail, browses both ways and restores the opened Memory", async () => {
    const f = fixture();
    await memoriesTour.run(f.context);
    expect(f.remote.attached).toHaveBeenCalledWith(
      '[data-home-rail="memories"][data-home-index="0"]'
    );
    expect(f.actions).toContainEqual({
      key: "right",
      focus: '[data-home-rail="memories"][data-home-index="1"]'
    });
    expect(f.actions[f.actions.length - 1]).toEqual({
      key: "back",
      focus: '[data-home-rail="memories"][data-home-index="0"]'
    });
    expect(f.remote.visible).toHaveBeenLastCalledWith("#home-screen");
  });
});
