import { describe, expect, it, vi } from "vitest";
import { createKeepAwake, keepAwakeClipPath } from "./keep-awake";

class FakeVideo extends EventTarget {
  attributes: Record<string, string> = {};
  className = "";
  error: { code: number } | null = null;
  loop = false;
  muted = false;
  paused = true;
  preload = "";
  src = "";
  load = vi.fn();
  pause = vi.fn(() => {
    this.paused = true;
  });
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });

  removeAttribute(name: string): void {
    delete this.attributes[name];

    if (name === "src") {
      this.src = "";
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

function setup(enabled = true) {
  const videos: FakeVideo[] = [];
  const appended: FakeVideo[] = [];
  const documentRef = {
    body: { appendChild: (element: FakeVideo) => appended.push(element) },
    createElement: () => {
      const video = new FakeVideo();
      videos.push(video);
      return video;
    }
  };
  const logger = { error: vi.fn(), info: vi.fn() };
  const settings = { enabled };
  const keepAwake = createKeepAwake({
    documentRef: documentRef as never,
    enabled: () => settings.enabled,
    logger
  });

  return { appended, keepAwake, logger, settings, videos };
}

describe("the OLED keep-awake", () => {
  it("creates nothing while the setting is off", () => {
    const { keepAwake, videos } = setup(false);

    keepAwake.set(true);
    expect(keepAwake.isActive()).toBe(false);
    expect(videos).toHaveLength(0);
  });

  it("plays a muted, looping, hidden clip, and unloads it when asked to stop", () => {
    const { appended, keepAwake, logger, videos } = setup();

    keepAwake.set(true);
    const video = videos[0]!;

    expect(appended).toEqual([video]);
    expect(video.className).toBe("keep-awake-video");
    expect(video.muted && video.loop).toBe(true);
    expect(video.attributes["aria-hidden"]).toBe("true");
    expect(video.src).toBe(keepAwakeClipPath);
    expect(video.play).toHaveBeenCalledTimes(1);

    keepAwake.set(false);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.src).toBe("");
    expect(video.load).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls.map(([message]) => message)).toEqual([
      "OLED keep-awake started.",
      "OLED keep-awake stopped."
    ]);
  });

  it("reuses one element and ignores repeated requests", () => {
    const { keepAwake, videos } = setup();

    keepAwake.set(true);
    keepAwake.set(true);
    keepAwake.set(false);
    keepAwake.set(false);
    keepAwake.set(true);
    expect(videos).toHaveLength(1);
    expect(videos[0]!.play).toHaveBeenCalledTimes(2);
    expect(videos[0]!.pause).toHaveBeenCalledTimes(1);
  });

  it("reads the setting at each request", () => {
    const { keepAwake, settings } = setup(false);

    keepAwake.set(true);
    settings.enabled = true;
    keepAwake.set(true);
    expect(keepAwake.isActive()).toBe(true);
  });

  it("logs a clip that can't play, but not once it has stopped", async () => {
    const { keepAwake, logger, videos } = setup();

    keepAwake.set(true);
    const video = videos[0]!;
    video.play.mockImplementation(() => Promise.reject(new Error("NotSupportedError")));
    keepAwake.set(false);
    keepAwake.set(true);
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledTimes(1);

    video.error = { code: 4 };
    video.dispatchEvent(new Event("error"));
    expect(logger.error).toHaveBeenLastCalledWith("The OLED keep-awake clip could not play.", {
      code: 4
    });

    keepAwake.set(false);
    video.dispatchEvent(new Event("error"));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("logs a play call that throws", () => {
    const { keepAwake, logger, videos } = setup();

    keepAwake.set(true);
    keepAwake.set(false);
    videos[0]!.play.mockImplementation(() => {
      throw new Error("old engine");
    });
    keepAwake.set(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
