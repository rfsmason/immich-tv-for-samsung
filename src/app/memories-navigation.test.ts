import { afterEach, describe, expect, it, vi } from "vitest";
import type { mountHomeScreen } from "../screens/home-screen";
import type { mountMemoriesScreen } from "../screens/memories-screen";
import type { mountAlbumDetailScreen } from "../screens/album-detail-screen";
import type { mountConnectionScreen } from "../screens/connection-screen";
import type { mountApplicationShell, TopLevelDestinationId } from "./app-shell";

const mocks = vi.hoisted(() => {
  function controller() {
    return {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
      focusContent: vi.fn(),
      focusSection: vi.fn(),
      forgetSessionSortOrders: vi.fn(),
      refresh: vi.fn(),
      reset: vi.fn(),
      showMemory: vi.fn(),
      showStaticAssetCollection: vi.fn(),
      showPerson: vi.fn(),
      showPhotos: vi.fn(),
      requestExit: vi.fn(() => true),
      relayout: vi.fn(),
      whenLoaded: vi.fn(() => Promise.resolve())
    };
  }
  const home = controller();
  const browser = controller();
  const detail = controller();
  const connection = controller();
  return {
    home,
    browser,
    detail,
    connection,
    mountHome: vi.fn<(options: unknown) => typeof home>(() => home),
    mountBrowser: vi.fn<(options: unknown) => typeof browser>(() => browser),
    mountDetail: vi.fn<(options: unknown) => typeof detail>(() => detail),
    mountConnection: vi.fn<(options: unknown) => typeof connection>(() => connection),
    mountShell: vi.fn((options: unknown) => {
      void options;
      return {
        activateDestination: vi.fn(),
        focusActiveDestinationNav: vi.fn(),
        expandRail: vi.fn(),
        collapseRail: vi.fn(),
        setContentFocusController: vi.fn(),
        hideSplash: vi.fn(),
        showSplashError: vi.fn(),
        destroy: vi.fn()
      };
    })
  };
});
vi.mock("../screens/home-screen", () => ({ mountHomeScreen: mocks.mountHome }));
vi.mock("../screens/memories-screen", () => ({ mountMemoriesScreen: mocks.mountBrowser }));
vi.mock("../screens/people-screen", () => ({
  mountPeopleScreen: () => ({ destroy() {}, hide() {}, reset() {}, show() {} })
}));
vi.mock("../screens/album-detail-screen", () => ({ mountAlbumDetailScreen: mocks.mountDetail }));
vi.mock("../screens/connection-screen", () => ({ mountConnectionScreen: mocks.mountConnection }));
vi.mock("../screens/albums-screen", () => ({
  mountAlbumsScreen: () => ({ hide() {}, show() {} })
}));
vi.mock("../screens/search/search-screen", () => ({
  mountSearchScreen: () => ({ destroy() {}, hide() {}, reset() {}, show() {} })
}));
vi.mock("../screens/search/people-picker-screen", () => ({
  mountPeoplePicker: () => ({ destroy() {}, hide() {}, reset() {} })
}));
vi.mock("./app-shell", () => ({ mountApplicationShell: mocks.mountShell }));
vi.mock("../screens/exit-confirmation", () => ({
  mountExitConfirmation: () => ({ open() {}, close() {}, destroy() {}, isOpen: () => false })
}));
vi.mock("../platform/tizen/lifecycle", () => ({
  createAppLifecycle: () => ({ onVisibilityChange: () => () => undefined, exit() {}, destroy() {} })
}));
vi.mock("./album-service", () => ({ createAlbumService: () => ({ loadSettings: () => ({}) }) }));
vi.mock("./connection-service", () => ({ createConnectionService: () => ({}) }));
vi.mock("./viewing-history-service", () => ({
  createViewingHistoryService: () => ({ record: vi.fn() })
}));
vi.mock("../logging/logger", () => ({ consoleLogger: { info() {}, error() {} } }));

async function fixture() {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal(
    "window",
    // main.ts waits for the splash to be drawn; run those callbacks at once.
    Object.assign(new EventTarget(), {
      localStorage: {},
      fetch,
      requestAnimationFrame: (callback: () => void) => callback(),
      scrollTo: vi.fn(),
      setTimeout: (callback: () => void) => callback()
    })
  );
  vi.stubGlobal("document", { body: { scrollTop: 0 }, documentElement: { scrollTop: 0 } });
  let active: TopLevelDestinationId | null = null;
  mocks.mountShell.mockImplementation((raw) => {
    const options = raw as Parameters<typeof mountApplicationShell>[0];
    return {
      activateDestination: vi.fn((destination: TopLevelDestinationId) => {
        if (active) options.screens[active].hide();
        active = destination;
        options.screens[destination].show();
        options.onDestinationActivated?.(destination);
        return true;
      }),
      focusActiveDestinationNav: vi.fn(),
      expandRail: vi.fn(),
      collapseRail: vi.fn(),
      setContentFocusController: vi.fn(),
      hideSplash: vi.fn(),
      revealApp: vi.fn(),
      setSplashStatus: vi.fn(),
      showSplashError: vi.fn(),
      destroy: vi.fn()
    };
  });
  await import("./main");
  const home = mocks.mountHome.mock.calls[0]![0] as Parameters<typeof mountHomeScreen>[0];
  const browser = mocks.mountBrowser.mock.calls[0]![0] as Parameters<typeof mountMemoriesScreen>[0];
  const detail = mocks.mountDetail.mock.calls[0]![0] as Parameters<
    typeof mountAlbumDetailScreen
  >[0];
  const connection = mocks.mountConnection.mock.calls[0]![0] as Parameters<
    typeof mountConnectionScreen
  >[0];
  const shellOptions = mocks.mountShell.mock.calls[0]![0] as Parameters<
    typeof mountApplicationShell
  >[0];
  const shell = mocks.mountShell.mock.results[0]!.value;
  return { home, browser, detail, connection, shellOptions, shell };
}
const memory = {
  id: "memory",
  kind: "on-this-day" as const,
  memoryAt: "2020-10-15T00:00:00.000Z",
  personName: null,
  year: 2020,
  assets: [],
  assetCount: 0
};
afterEach(() => vi.unstubAllGlobals());
describe("Memories application navigation", () => {
  it("keeps Home as startup and routes a preview Memory Back directly to its Home tile", async () => {
    const f = await fixture();
    expect(f.shell.activateDestination).toHaveBeenCalledWith("home", expect.any(Object));
    f.home.onOpenMemory(memory);
    expect(mocks.detail.showMemory).toHaveBeenCalledWith(memory, "home");
    f.detail.onBack();
    expect(mocks.home.focusContent).toHaveBeenCalledWith(undefined);
    expect(mocks.browser.show).not.toHaveBeenCalled();
  });
  it("routes browser Memory Back to its retained card, then browser Back to Home", async () => {
    const f = await fixture();
    f.home.onBrowseMemories();
    expect(mocks.browser.show).toHaveBeenCalledTimes(1);
    f.browser.onOpenMemory(memory);
    expect(mocks.detail.showMemory).toHaveBeenCalledWith(memory, "memories");
    f.detail.onBack();
    expect(mocks.browser.show).toHaveBeenCalledTimes(2);
    f.browser.onBack();
    expect(mocks.home.focusContent).toHaveBeenCalledWith(undefined);
  });
  it("clears cached browser cards after connection settings change", async () => {
    const f = await fixture();
    f.connection.onSaved?.({ serverUrl: "https://immich.example", apiKey: "test-key" });
    expect(mocks.browser.reset).toHaveBeenCalledTimes(1);
    expect(mocks.home.refresh).toHaveBeenCalledTimes(1);
  });
});
