import { consoleLogger } from "../logging/logger";
import { registerMediaRemoteKeys } from "../platform/tizen/keys";
import { createAppLifecycle } from "../platform/tizen/lifecycle";
import { createLocalAppSettingsStore } from "../storage/app-settings-store";
import { createLocalConnectionSettingsStore } from "../storage/connection-settings-store";
import { createLocalViewingHistoryStore } from "../storage/viewing-history-store";
import { createAlbumService } from "./album-service";
import { composeApplication } from "./application";
import { createConnectionService } from "./connection-service";
import { createViewingHistoryService } from "./viewing-history-service";

// Entry point: creates the real services and platform adapters for the TV
// runtime, then composes and starts the application.

const store = createLocalConnectionSettingsStore(window.localStorage);
const fetchImpl = window.fetch.bind(window);
const lifecycle = createAppLifecycle({ logger: consoleLogger });

registerMediaRemoteKeys(window);

const application = composeApplication({
  albumService: createAlbumService({ fetchImpl, logger: consoleLogger, store }),
  connectionService: createConnectionService({ fetchImpl, logger: consoleLogger, store }),
  lifecycle,
  logger: consoleLogger,
  settingsStore: createLocalAppSettingsStore(window.localStorage),
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
