// The splash's support line (ADR 0021). Sideload builds show a quiet
// pointer to Settings › Support Us, or a thank-you once the user says they
// have supported the app; store builds show no line. It is set from the
// settings startup already restored, so it never waits, requests anything or
// takes focus, and a saved change shows the next time the splash does.

const lineId = "splash-support";

export function readSplashSupportText(
  supportLinksEnabled: boolean,
  supporter: boolean
): string | null {
  if (!supportLinksEnabled) {
    return null;
  }

  return supporter
    ? "Thank you for supporting Immich TV."
    : "Free to use. You can support development in Settings.";
}

export function showSplashSupport(
  documentRef: Document,
  supportLinksEnabled: boolean,
  supporter: boolean
): void {
  const text = readSplashSupportText(supportLinksEnabled, supporter);
  const splash = documentRef.getElementById("splash-screen");
  let line = documentRef.getElementById(lineId);

  if (text === null || !splash) {
    line?.parentNode?.removeChild(line);
    return;
  }

  if (!line) {
    line = documentRef.createElement("p");
    line.id = lineId;
    line.className = "splash-support";
    splash.appendChild(line);
  }

  line.textContent = text;
}
