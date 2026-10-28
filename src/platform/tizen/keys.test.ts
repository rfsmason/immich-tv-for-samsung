// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  getKeyCode,
  isMediaPlayPauseKey,
  readSkipDirection,
  readArrowDirection,
  readChannelDirection,
  registerOptionalRemoteKeys,
  remoteKeys
} from "./keys";

function createLogger() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

describe("Tizen remote keys", () => {
  it("maps real desktop Backspace and Escape codes to Back", () => {
    for (const [key, keyCode] of [
      ["Backspace", 8],
      ["Escape", 27]
    ] as const) {
      expect(getKeyCode({ key, keyCode } as KeyboardEvent, {})).toBe(remoteKeys.back);
    }
  });

  it("keeps Backspace editing text fields", () => {
    for (const tag of ["input", "textarea", "div"] as const) {
      const target = document.createElement(tag);
      if (tag === "div") target.setAttribute("contenteditable", "true");
      document.body.appendChild(target);
      let translated = 0;
      target.addEventListener("keydown", (event) => {
        translated = getKeyCode(event as KeyboardEvent, {});
      });
      const event = new KeyboardEvent("keydown", {
        key: "Backspace",
        keyCode: 8,
        cancelable: true
      });
      target.dispatchEvent(event);
      expect(translated).toBe(8);
      expect(event.defaultPrevented).toBe(false);
      target.remove();
    }
  });

  it("keeps , and . typing in a text field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    let translated = 0;
    input.addEventListener("keydown", (event) => {
      translated = getKeyCode(event as KeyboardEvent, {});
    });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: ",", keyCode: 188 }));
    expect(translated).toBe(188);
    input.remove();
  });

  it("preserves native Tizen Back and Backspace codes", () => {
    const runtime = { tizen: {} };
    expect(getKeyCode({ key: "Backspace", keyCode: 8 } as KeyboardEvent, runtime)).toBe(8);
    expect(getKeyCode({ key: "Backspace", keyCode: 0 } as KeyboardEvent, runtime)).toBe(0);
    expect(
      getKeyCode({ key: "Unidentified", keyCode: remoteKeys.back } as KeyboardEvent, runtime)
    ).toBe(remoteKeys.back);
  });

  it("reads the arrow a key moves in, and nothing for other keys", () => {
    expect(readArrowDirection(remoteKeys.left)).toBe("left");
    expect(readArrowDirection(remoteKeys.up)).toBe("up");
    expect(readArrowDirection(remoteKeys.right)).toBe("right");
    expect(readArrowDirection(remoteKeys.down)).toBe("down");
    expect(readArrowDirection(remoteKeys.enter)).toBeNull();
  });

  it("maps Escape to the Tizen Back key code for desktop preview", () => {
    expect(getKeyCode({ key: "Escape", keyCode: 0 } as KeyboardEvent)).toBe(remoteKeys.back);
  });

  it("uses the native keyCode when the TV runtime provides one", () => {
    const event = { key: "Unidentified", keyCode: remoteKeys.back } as KeyboardEvent;
    expect(getKeyCode(event)).toBe(remoteKeys.back);
  });

  it("recognizes Samsung media play and pause keys", () => {
    expect(isMediaPlayPauseKey(remoteKeys.mediaPlayPause)).toBe(true);
    expect(isMediaPlayPauseKey(remoteKeys.mediaPlay)).toBe(true);
    expect(isMediaPlayPauseKey(remoteKeys.mediaPause)).toBe(true);
    expect(isMediaPlayPauseKey(remoteKeys.enter)).toBe(false);
  });

  it("registers supported optional media keys with the Samsung input device", () => {
    const logger = createLogger();
    const registerKey = vi.fn();
    const windowRef = {
      tizen: {
        tvinputdevice: {
          getSupportedKeys: vi.fn().mockReturnValue([
            { code: remoteKeys.mediaPlayPause, name: "MediaPlayPause" },
            { code: remoteKeys.mediaPause, name: "MediaPause" },
            { code: remoteKeys.mediaRewind, name: "MediaRewind" },
            { code: remoteKeys.channelUp, name: "ChannelUp" },
            { code: remoteKeys.channelDown, name: "ChannelDown" },
            { code: remoteKeys.back, name: "Back" }
          ]),
          registerKey,
          registerKeyBatch: vi.fn()
        }
      }
    } as unknown as Window;

    registerOptionalRemoteKeys(windowRef, logger);

    expect(registerKey).toHaveBeenCalledWith("MediaPlayPause");
    expect(registerKey).toHaveBeenCalledWith("MediaPause");
    expect(registerKey).toHaveBeenCalledWith("ChannelUp");
    expect(registerKey).toHaveBeenCalledWith("ChannelDown");
    expect(registerKey).toHaveBeenCalledWith("MediaRewind");
    expect(registerKey).not.toHaveBeenCalledWith("MediaPlay");
    expect(registerKey).not.toHaveBeenCalledWith("MediaFastForward");
    expect(logger.info).toHaveBeenCalledWith("Some optional remote keys are not supported.", {
      unsupported: ["MediaPlay", "MediaFastForward"]
    });
  });

  it("logs and continues when an optional key is rejected", () => {
    const logger = createLogger();
    const registerKey = vi.fn((keyName: string) => {
      if (keyName === "MediaPlay") {
        throw new Error("Unsupported key");
      }
    });
    const windowRef = {
      tizen: {
        tvinputdevice: {
          registerKey
        }
      }
    } as unknown as Window;

    registerOptionalRemoteKeys(windowRef, logger);

    expect(registerKey).toHaveBeenCalledWith("MediaPlayPause");
    expect(registerKey).toHaveBeenCalledWith("MediaPlay");
    expect(registerKey).toHaveBeenCalledWith("MediaPause");
    expect(registerKey).toHaveBeenCalledWith("ChannelUp");
    expect(registerKey).toHaveBeenCalledWith("ChannelDown");
    expect(logger.warn).toHaveBeenCalledWith("Optional remote key registration failed.", {
      error: expect.any(Error),
      keyName: "MediaPlay"
    });
  });

  it("logs and registers every optional key when the supported list cannot be read", () => {
    const logger = createLogger();
    const registerKey = vi.fn();
    const windowRef = {
      tizen: {
        tvinputdevice: {
          getSupportedKeys: () => {
            throw new Error("Unavailable");
          },
          registerKey
        }
      }
    } as unknown as Window;

    registerOptionalRemoteKeys(windowRef, logger);

    expect(registerKey).toHaveBeenCalledTimes(7);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("reads the direction a channel key moves in", () => {
    expect(readChannelDirection(remoteKeys.channelUp)).toBe(-1);
    expect(readChannelDirection(remoteKeys.channelDown)).toBe(1);
    expect(readChannelDirection(remoteKeys.up)).toBeNull();
  });

  it("maps Page Up and Page Down to the channel keys in the desktop preview only", () => {
    const pageUp = new KeyboardEvent("keydown", { key: "PageUp", keyCode: 33 });
    const pageDown = new KeyboardEvent("keydown", { key: "PageDown", keyCode: 34 });

    expect(getKeyCode(pageUp, {} as Window)).toBe(remoteKeys.channelUp);
    expect(getKeyCode(pageDown, {} as Window)).toBe(remoteKeys.channelDown);
    expect(getKeyCode(pageUp, { tizen: {} } as unknown as Window)).toBe(33);
  });

  it("maps , and . to rewind and fast forward in the desktop preview only", () => {
    const comma = new KeyboardEvent("keydown", { key: ",", keyCode: 188 });
    const period = new KeyboardEvent("keydown", { key: ".", keyCode: 190 });

    expect(getKeyCode(comma, {} as Window)).toBe(remoteKeys.mediaRewind);
    expect(getKeyCode(period, {} as Window)).toBe(remoteKeys.mediaFastForward);
    expect(getKeyCode(comma, { tizen: {} } as unknown as Window)).toBe(188);
  });

  it("reads the way a rewind or fast-forward key skips", () => {
    expect(remoteKeys.mediaRewind).toBe(412);
    expect(remoteKeys.mediaFastForward).toBe(417);
    expect(readSkipDirection(remoteKeys.mediaRewind)).toBe(-1);
    expect(readSkipDirection(remoteKeys.mediaFastForward)).toBe(1);
    expect(readSkipDirection(remoteKeys.right)).toBeNull();
  });
});
