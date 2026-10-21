// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  getKeyCode,
  isMediaPlayPauseKey,
  readArrowDirection,
  registerMediaRemoteKeys,
  remoteKeys
} from "./keys";

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
    const registerKey = vi.fn();
    const windowRef = {
      tizen: {
        tvinputdevice: {
          getSupportedKeys: vi.fn().mockReturnValue([
            { code: remoteKeys.mediaPlayPause, name: "MediaPlayPause" },
            { code: remoteKeys.mediaPause, name: "MediaPause" },
            { code: remoteKeys.back, name: "Back" }
          ]),
          registerKey,
          registerKeyBatch: vi.fn()
        }
      }
    } as unknown as Window;

    registerMediaRemoteKeys(windowRef);

    expect(registerKey).toHaveBeenCalledWith("MediaPlayPause");
    expect(registerKey).toHaveBeenCalledWith("MediaPause");
    expect(registerKey).not.toHaveBeenCalledWith("MediaPlay");
  });

  it("continues registering media keys when an optional key is rejected", () => {
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

    registerMediaRemoteKeys(windowRef);

    expect(registerKey).toHaveBeenCalledWith("MediaPlayPause");
    expect(registerKey).toHaveBeenCalledWith("MediaPlay");
    expect(registerKey).toHaveBeenCalledWith("MediaPause");
  });
});
