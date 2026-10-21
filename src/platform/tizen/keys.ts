import type { TizenTvInputDevice } from "./runtime";

export const remoteKeys = {
  back: 10009,
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

export function isMediaPlayPauseKey(keyCode: number): boolean {
  return (
    keyCode === remoteKeys.mediaPlayPause ||
    keyCode === remoteKeys.mediaPlay ||
    keyCode === remoteKeys.mediaPause
  );
}

export function registerMediaRemoteKeys(windowRef: Window = window): void {
  const inputDevice = windowRef.tizen?.tvinputdevice;

  if (!inputDevice) {
    return;
  }

  const keyNames = readSupportedMediaKeyNames(inputDevice);

  for (const keyName of keyNames) {
    try {
      inputDevice.registerKey(keyName);
    } catch {
      // Optional media keys are best-effort; arrows, Enter, and Back still work without registration.
    }
  }
}

function readSupportedMediaKeyNames(inputDevice: TizenTvInputDevice): string[] {
  const mediaKeyNames = ["MediaPlayPause", "MediaPlay", "MediaPause"];

  if (typeof inputDevice.getSupportedKeys !== "function") {
    return mediaKeyNames;
  }

  try {
    const supportedNames = inputDevice.getSupportedKeys().map((key) => key.name);

    return mediaKeyNames.filter((keyName) => supportedNames.indexOf(keyName) >= 0);
  } catch {
    return mediaKeyNames;
  }
}
