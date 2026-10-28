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
  mediaFastForward: 417,
  mediaPause: 19,
  mediaPlay: 415,
  mediaPlayPause: 10252,
  mediaRewind: 412,
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

// The desktop preview has no channel or rewind keys, so Page Up and Page
// Down stand in for the channel keys, and "," and "." for rewind and fast
// forward, as Escape and Backspace stand in for Back (ADR 0015).
const desktopChannelKeys: Record<string, number> = {
  ",": remoteKeys.mediaRewind,
  ".": remoteKeys.mediaFastForward,
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
    if (event.key === "Backspace" && isEditingText(event)) {
      return event.keyCode || 8;
    }
    return remoteKeys.back;
  }

  // Typing "," or "." in a text field stays typing.
  if (!windowRef?.tizen && desktopChannelKeys[event.key] && !isEditingText(event)) {
    return desktopChannelKeys[event.key]!;
  }

  if (event.keyCode) {
    return event.keyCode;
  }

  return fallbackKeyCodes[event.key] || 0;
}

function isEditingText(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;

  return Boolean(
    target?.isContentEditable ||
    target?.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]')
  );
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

// The way a rewind (-1) or fast-forward (1) key skips; null for any other key.
export function readSkipDirection(keyCode: number): -1 | 1 | null {
  if (keyCode === remoteKeys.mediaRewind) {
    return -1;
  }

  return keyCode === remoteKeys.mediaFastForward ? 1 : null;
}

export function isMediaPlayPauseKey(keyCode: number): boolean {
  return (
    keyCode === remoteKeys.mediaPlayPause ||
    keyCode === remoteKeys.mediaPlay ||
    keyCode === remoteKeys.mediaPause
  );
}

// Rewind and fast forward are on Samsung's standard remotes; the 2019 Smart
// Remote has neither (ADR 0020).
const optionalKeyNames = [
  "MediaPlayPause",
  "MediaPlay",
  "MediaPause",
  "MediaRewind",
  "MediaFastForward",
  "ChannelUp",
  "ChannelDown"
];

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
