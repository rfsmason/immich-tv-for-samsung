import { afterEach, describe, expect, it, vi } from "vitest";

// main.ts applies the saved theme before it waits for the splash to be
// drawn, so high contrast never flashes the normal colours (ADR 0020).

const compose = vi.hoisted(() => vi.fn());

vi.mock("./application", () => ({ composeApplication: compose }));
vi.mock("./album-service", () => ({ createAlbumService: () => ({}) }));
vi.mock("./connection-service", () => ({ createConnectionService: () => ({}) }));
vi.mock("./viewing-history-service", () => ({ createViewingHistoryService: () => ({}) }));
vi.mock("../platform/tizen/keys", () => ({ registerOptionalRemoteKeys: vi.fn() }));
vi.mock("../platform/tizen/lifecycle", () => ({
  createAppLifecycle: () => ({ destroy: vi.fn() })
}));
vi.mock("../platform/tizen/screensaver", () => ({ createPassiveViewing: () => ({}) }));
vi.mock("../logging/logger", () => ({ consoleLogger: { error() {}, info() {}, warn() {} } }));

async function start(stored: string | null) {
  vi.resetModules();
  const events: string[] = [];
  const pendingFrames: Array<() => void> = [];
  const root = {
    removeAttribute: vi.fn((name: string) => events.push(`remove ${name}`)),
    setAttribute: vi.fn((name: string, value: string) => events.push(`set ${name}=${value}`))
  };

  compose.mockImplementation(() => {
    events.push("compose");
    return { destroy: vi.fn(), start: vi.fn() };
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      fetch: vi.fn(),
      localStorage: {
        getItem: (key: string) => (key === "immich-tv.app-settings" ? stored : null),
        setItem: vi.fn()
      },
      requestAnimationFrame: (callback: () => void) => {
        events.push("frame requested");
        pendingFrames.push(callback);
      },
      setTimeout: (callback: () => void) => callback()
    })
  );
  vi.stubGlobal("document", { documentElement: root });
  await import("./main");

  return { events, paint: () => pendingFrames.splice(0).forEach((frame) => frame()) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startup theme", () => {
  it("applies saved high contrast before waiting for the splash to be drawn", async () => {
    const { events, paint } = await start(JSON.stringify({ highContrast: true, schemaVersion: 3 }));

    expect(events).toEqual(["set data-contrast=high", "frame requested"]);
    paint();
    expect(events[events.length - 1]).toBe("compose");
  });

  it("leaves the normal theme when high contrast is off or nothing is saved", async () => {
    expect((await start(null)).events[0]).toBe("remove data-contrast");
    expect((await start(JSON.stringify({ highContrast: false, schemaVersion: 3 }))).events[0]).toBe(
      "remove data-contrast"
    );
  });
});
