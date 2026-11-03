import { describe, expect, it, vi } from "vitest";
import { createPassiveViewing, noPassiveViewing } from "./screensaver";

function setup(appcommon?: object) {
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const passive = createPassiveViewing({
    logger,
    windowRef: { webapis: appcommon ? { appcommon: appcommon as never } : undefined }
  });

  return { logger, passive };
}

function appcommon() {
  return {
    AppCommonScreenSaverState: { SCREEN_SAVER_OFF: 0, SCREEN_SAVER_ON: 1 },
    setScreenSaver: vi.fn()
  };
}

describe("passive viewing and the TV screensaver", () => {
  it("turns the screensaver off for the first hold and on after the last", () => {
    const api = appcommon();
    const { passive } = setup(api);
    const slideshow = passive.createHold();
    const video = passive.createHold();

    slideshow.set(true);
    video.set(true);
    expect(passive.activeCount()).toBe(2);
    expect(api.setScreenSaver.mock.calls.map(([state]) => state)).toEqual([0]);

    slideshow.set(false);
    expect(api.setScreenSaver).toHaveBeenCalledTimes(1);
    video.set(false);
    expect(api.setScreenSaver.mock.calls.map(([state]) => state)).toEqual([0, 1]);
    expect(passive.activeCount()).toBe(0);
  });

  it("counts each hold once, however often it repeats itself", () => {
    const api = appcommon();
    const { passive } = setup(api);
    const hold = passive.createHold();

    hold.set(false);
    hold.set(true);
    hold.set(true);
    expect(passive.activeCount()).toBe(1);
    hold.set(false);
    hold.set(false);
    expect(passive.activeCount()).toBe(0);
    expect(api.setScreenSaver.mock.calls.map(([state]) => state)).toEqual([0, 1]);
  });

  it("does nothing without webapis, as in the desktop preview", () => {
    const { logger, passive } = setup();
    const hold = passive.createHold();

    expect(() => {
      hold.set(true);
      hold.set(false);
    }).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs a failure once and never throws into callers", () => {
    const api = appcommon();
    api.setScreenSaver.mockImplementation(() => {
      throw new Error("not supported");
    });
    const { logger, passive } = setup(api);
    const hold = passive.createHold();

    hold.set(true);
    hold.set(false);
    hold.set(true);
    expect(api.setScreenSaver).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("logs an error callback once", () => {
    const api = appcommon();
    api.setScreenSaver.mockImplementation((_state, _ok, onerror: (error: unknown) => void) =>
      onerror({ name: "UnknownError" })
    );
    const { logger, passive } = setup(api);
    const hold = passive.createHold();

    hold.set(true);
    hold.set(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("falls back to the documented values when the enum is missing", () => {
    const api = { setScreenSaver: vi.fn() };
    const { passive } = setup(api);
    const hold = passive.createHold();

    hold.set(true);
    hold.set(false);
    expect(api.setScreenSaver.mock.calls.map(([state]) => state)).toEqual([0, 1]);
  });

  it("logs the TV's answer to each switch", () => {
    const api = appcommon();
    api.setScreenSaver.mockImplementation((_state, onsuccess: () => void) => onsuccess());
    const { logger, passive } = setup(api);
    const hold = passive.createHold();

    hold.set(true);
    hold.set(false);
    expect(logger.info.mock.calls.map(([message]) => message)).toEqual([
      "TV screensaver held off.",
      "TV screensaver allowed."
    ]);
  });

  it("asks for the OLED keep-awake only while photos hold and nothing plays", () => {
    const keepAwake = { set: vi.fn() };
    const passive = createPassiveViewing({
      keepAwake,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      windowRef: {}
    });
    const slideshow = passive.createHold("photos");
    const ambient = passive.createHold("photos");
    const video = passive.createHold();
    const last = () => keepAwake.set.mock.calls[keepAwake.set.mock.calls.length - 1]![0];

    slideshow.set(true);
    expect(last()).toBe(true);
    video.set(true);
    expect(last()).toBe(false);
    video.set(false);
    expect(last()).toBe(true);
    ambient.set(true);
    slideshow.set(false);
    expect(last()).toBe(true);
    ambient.set(false);
    expect(last()).toBe(false);
    expect(passive.activeCount()).toBe(0);
  });

  it("never asks for the keep-awake for media holds alone", () => {
    const keepAwake = { set: vi.fn() };
    const passive = createPassiveViewing({
      keepAwake,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      windowRef: {}
    });

    passive.createHold().set(true);
    expect(keepAwake.set.mock.calls.every(([active]) => active === false)).toBe(true);
  });

  it("offers a no-op for screens with nothing to tell the TV", () => {
    const hold = noPassiveViewing.createHold();

    hold.set(true);
    expect(noPassiveViewing.activeCount()).toBe(0);
  });
});
