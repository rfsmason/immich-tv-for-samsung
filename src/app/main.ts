import { consoleLogger } from "../logging/logger";
import { registerOptionalRemoteKeys } from "../platform/tizen/keys";
import { createAppLifecycle } from "../platform/tizen/lifecycle";
import { createPassiveViewing } from "../platform/tizen/screensaver";
import { createLocalAppSettingsStore } from "../storage/app-settings-store";
import { createLocalConnectionSettingsStore } from "../storage/connection-settings-store";
import { createLocalViewingHistoryStore } from "../storage/viewing-history-store";
import { showSplashSupport } from "../screens/splash-support";
import { applyContrastTheme } from "../screens/theme";
import { createAlbumService } from "./album-service";
import { composeApplication } from "./application";
import { createConnectionService } from "./connection-service";
import { supportLinksEnabled, supportPage } from "./distribution";
import { createViewingHistoryService } from "./viewing-history-service";

// Entry point: creates the real services and platform adapters for the TV
// runtime, then composes and starts the application.

const settingsStore = createLocalAppSettingsStore(window.localStorage);
const startupSettings = settingsStore.load();

// The theme first, before the splash is next drawn, so high contrast never
// flashes the normal colours (ADR 0020), and the splash's support line with
// it (ADR 0021).
applyContrastTheme(document, startupSettings.highContrast);
showSplashSupport(document, supportLinksEnabled, startupSettings.supporter);

// Let the TV draw the splash before the app is assembled behind it: building
// every screen and starting Home takes a noticeable moment on the TV, and
// until this script yields nothing on the page can be drawn.
afterNextPaint(() => {
  const store = createLocalConnectionSettingsStore(window.localStorage);
  const fetchImpl = window.fetch.bind(window);
  const lifecycle = createAppLifecycle({ logger: consoleLogger });

  registerOptionalRemoteKeys(window, consoleLogger);

  const application = composeApplication({
    albumService: createAlbumService({ fetchImpl, logger: consoleLogger, store }),
    connectionService: createConnectionService({ fetchImpl, logger: consoleLogger, store }),
    lifecycle,
    logger: consoleLogger,
    passiveViewing: createPassiveViewing({ logger: consoleLogger }),
    settingsStore,
    supportPage,
    viewingHistory: createViewingHistoryService({
      connections: store,
      fetchImpl,
      history: createLocalViewingHistoryStore(window.localStorage),
      logger: consoleLogger
    })
  });

  application.start();

  window.addEventListener("pagehide", () => {
    lifecycle.destroy();
    application.destroy();
  });
});

// A requestAnimationFrame callback runs just before a frame is drawn; the
// timeout then runs after that frame, once the splash is on screen.
function afterNextPaint(callback: () => void): void {
  window.requestAnimationFrame(() => {
    window.setTimeout(callback, 0);
  });
}
