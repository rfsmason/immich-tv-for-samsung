import { Window } from "happy-dom";
import type { Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Remote } from "../remote";
import type { ScenarioContext } from "./shared";
import { mediaTour, playDemoLivePhoto } from "./media-tour";

afterEach(() => vi.unstubAllGlobals());

function fixture(types = ["video", "live", "photo"]) {
  const document = new Window().document;
  document.body.innerHTML = types
    .map(
      (type, index) =>
        `<button data-asset-index="${index}">${type === "video" ? '<span class="asset-video-badge"></span>' : type === "live" ? '<span class="asset-live-photo-badge"></span>' : ""}</button>`
    )
    .join("");
  const actions: { key: string; focus: string }[] = [];
  const order: string[] = [];
  const press = (key: string) =>
    vi.fn(async (focus: string) => {
      order.push(key);
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
    ready: vi.fn(),
    hold: vi.fn(),
    step: ""
  };
  const dispose = vi.fn();
  const waitForFunction = vi.fn(async (check: () => boolean) => {
    void check;
    order.push("observe");
    return { dispose };
  });
  const context: ScenarioContext = {
    remote: remote as unknown as Remote,
    page: {
      locator: () => ({
        evaluateAll: (read: (tiles: Element[]) => unknown) =>
          read(Array.from(document.querySelectorAll("button")) as unknown as Element[]),
        // The viewer's state is already as wanted, so one OK pauses.
        count: async () => 1,
        getAttribute: async () => "recently-added"
      }),
      waitForFunction
    } as unknown as Page,
    interval: 8,
    capture: { still: vi.fn() }
  };
  return { context, remote, actions, order, waitForFunction, dispose };
}

describe("Videos and Live Photos tour", () => {
  it("opens Recently Added, plays both kinds and restores the originating Home tile", async () => {
    const f = fixture();
    await mediaTour.run(f.context);
    expect(f.remote.attached).toHaveBeenCalledWith(
      '[data-home-rail="recently-added"][data-home-index="0"]'
    );
    expect(f.waitForFunction).toHaveBeenCalledTimes(2);
    expect(f.remote.visible).toHaveBeenCalledWith('#asset-viewer-play[data-media-kind="video"]');
    expect(f.remote.visible).toHaveBeenCalledWith(
      '#asset-viewer-play[data-media-kind="live-photo"]'
    );
    expect(f.actions).toContainEqual({ key: "back", focus: '[data-asset-index="0"]' });
    expect(f.actions).toContainEqual({ key: "back", focus: '[data-asset-index="1"]' });
    expect(f.actions[f.actions.length - 1]).toEqual({
      key: "back",
      focus: '[data-home-rail="recently-added"][data-home-index="0"]'
    });
  });
  it("handles a video later in the row and a Live Photo before it", async () => {
    const f = fixture(["live", "photo", "photo", "photo", "video"]);
    await mediaTour.run(f.context);
    expect(f.remote.right).toHaveBeenCalledWith('[data-asset-index="4"]');
    expect(f.remote.left).toHaveBeenCalledTimes(4);
    expect(f.actions[f.actions.length - 1]?.focus).toBe(
      '[data-home-rail="recently-added"][data-home-index="0"]'
    );
  });
  it.each([
    ["photo", "live"],
    ["photo", "video"],
    ["photo", "photo", "photo", "photo", "photo", "video", "live"]
  ])("fails clearly when the first row lacks either kind (%j)", async (...types) => {
    const f = fixture(types);
    await expect(mediaTour.run(f.context)).rejects.toThrow("video and Live Photo");
    expect(f.waitForFunction).not.toHaveBeenCalled();
    expect(f.remote.step).toContain("first six items");
  });
  it("observes Live Photo motion before OK and skips the editorial hold on that press", async () => {
    const f = fixture();
    await playDemoLivePhoto(f.context);
    expect(f.order).toEqual(["observe", "ok"]);
    expect(f.remote.ok).toHaveBeenCalledWith("#asset-viewer-play", { pauseAfter: false });
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.remote.visible).toHaveBeenCalledWith('#asset-viewer-play[data-play-state="idle"]');
    expect(f.remote.ready).toHaveBeenCalledOnce();
  });
  it("requires visible decoded motion with real media progress, rather than a poster", async () => {
    const f = fixture();
    await playDemoLivePhoto(f.context);
    const document = new Window().document;
    const video = document.createElement("video");
    video.id = "asset-viewer-video";
    document.body.append(video);
    vi.stubGlobal("document", document);
    const check = f.waitForFunction.mock.calls[0]![0];
    Object.defineProperties(video, {
      paused: { value: false, configurable: true },
      readyState: { value: 2 },
      currentTime: { value: 0.2, configurable: true }
    });
    video.style.opacity = "0";
    expect(check()).toBe(false);
    video.style.opacity = "1";
    expect(check()).toBe(true);
    Object.defineProperty(video, "currentTime", { value: 0 });
    expect(check()).toBe(false);
  });
  it("fails instead of accepting a still when the motion wait times out", async () => {
    const f = fixture();
    f.waitForFunction.mockRejectedValue(new Error("No decoded motion"));
    await expect(playDemoLivePhoto(f.context)).rejects.toThrow("No decoded motion");
    expect(f.remote.ready).not.toHaveBeenCalled();
  });
});
