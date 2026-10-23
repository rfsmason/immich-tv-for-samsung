import type { Logger } from "../../logging/logger";
import type { TizenTvInputDevice } from "./runtime";

// Key codes verified against Samsung's TV remote key list. The media and
// channel keys must be registered before the app receives them.
export const remoteKeys = {
  back: 10009,
  channelDown: 428,
  channelUp: 427,
  down: 40,
  enter: 13,
  left: 37,
  mediaPause: 19,
  mediaPlay: 415,
  mediaPlayPause: 10252,
  right: 39,
  up: 38
} as const;

const fallbackKeyCodes: Record<string, number> = {
  ArrowDown: remoteKeys.down,
  ArrowLeft: remoteKeys.left,
  ArrowRight: remoteKeys.right,
  ArrowUp: remoteKeys.up,
  Enter: remoteKeys.enter,
  Escape: remoteKeys.back
};

// The desktop preview has no channel keys, so Page Up and Page Down stand in
// for them, as Escape and Backspace stand in for Back.
const desktopChannelKeys: Record<string, number> = {
  PageDown: remoteKeys.channelDown,
  PageUp: remoteKeys.channelUp
};

export function getKeyCode(
  event: KeyboardEvent,
  windowRef: Pick<Window, "tizen"> | undefined = typeof window === "undefined" ? undefined : window
): number {
  // Desktop KeyboardEvents carry keyCode 8/27, so handle these before the
  // native-code path. Editing keeps Backspace's normal deletion behaviour.
  if (!windowRef?.tizen && (event.key === "Backspace" || event.key === "Escape")) {
    const target = event.target as HTMLElement | null;
    const editing =
      target?.isContentEditable ||
      target?.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]');
    if (event.key === "Backspace" && editing) {
      return event.keyCode || 8;
    }
    return remoteKeys.back;
  }

  if (!windowRef?.tizen && desktopChannelKeys[event.key]) {
    return desktopChannelKeys[event.key]!;
  }

  if (event.keyCode) {
    return event.keyCode;
  }

  return fallbackKeyCodes[event.key] || 0;
}

// The arrow a remote key code moves in, or null for any other key.
export function readArrowDirection(keyCode: number): "down" | "left" | "right" | "up" | null {
  if (keyCode === remoteKeys.left) {
    return "left";
  }

  if (keyCode === remoteKeys.up) {
    return "up";
  }

  if (keyCode === remoteKeys.right) {
    return "right";
  }

  if (keyCode === remoteKeys.down) {
    return "down";
  }

  return null;
}

// The way a channel key moves through a list as displayed: CH ▲ goes up (-1),
// CH ▼ goes down (1). Null for any other key.
export function readChannelDirection(keyCode: number): -1 | 1 | null {
  if (keyCode === remoteKeys.channelUp) {
    return -1;
  }

  return keyCode === remoteKeys.channelDown ? 1 : null;
}

export function isMediaPlayPauseKey(keyCode: number): boolean {
  return (
    keyCode === remoteKeys.mediaPlayPause ||
    keyCode === remoteKeys.mediaPlay ||
    keyCode === remoteKeys.mediaPause
  );
}

const optionalKeyNames = ["MediaPlayPause", "MediaPlay", "MediaPause", "ChannelUp", "ChannelDown"];

// Registers the optional keys the app uses. Each is best-effort: the arrows,
// Enter and Back work without registration, and every feature on an optional
// key is also reachable with them.
export function registerOptionalRemoteKeys(windowRef: Window, logger: Logger): void {
  const inputDevice = windowRef.tizen?.tvinputdevice;

  if (!inputDevice) {
    return;
  }

  for (const keyName of readSupportedKeyNames(inputDevice, logger)) {
    try {
      inputDevice.registerKey(keyName);
    } catch (error) {
      logger.warn("Optional remote key registration failed.", { error, keyName });
    }
  }
}

function readSupportedKeyNames(inputDevice: TizenTvInputDevice, logger: Logger): string[] {
  if (typeof inputDevice.getSupportedKeys !== "function") {
    return optionalKeyNames;
  }

  try {
    const supportedNames = inputDevice.getSupportedKeys().map((key) => key.name);
    const supported = optionalKeyNames.filter((keyName) => supportedNames.indexOf(keyName) >= 0);

    if (supported.length < optionalKeyNames.length) {
      logger.info("Some optional remote keys are not supported.", {
        unsupported: optionalKeyNames.filter((keyName) => supported.indexOf(keyName) < 0)
      });
    }

    return supported;
  } catch (error) {
    logger.warn("Reading the supported remote keys failed.", { error });
    return optionalKeyNames;
  }
}
