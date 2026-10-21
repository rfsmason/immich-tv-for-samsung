import { createImmichClient } from "../api/immich/client";
import type { RequestTimeouts } from "../api/immich/http";
import { readServerLabel, readUserLabel } from "../api/immich/labels";
import { isSupportedServerVersion, minimumServerVersion } from "../api/immich/version";
import type { ConnectionResult, ConnectionSettings } from "../domain/connection";
import type { Logger } from "../logging/logger";
import type { ConnectionSettingsStore } from "../storage/connection-settings-store";
import { validateConnectionSettings } from "../utils/url";

type ConnectionServiceOptions = {
  fetchImpl?: typeof fetch;
  logger: Logger;
  timeouts?: Partial<RequestTimeouts>;
  store: ConnectionSettingsStore;
};

export type ConnectionService = {
  load(): ConnectionSettings | null;
  save(settings: ConnectionSettings): ConnectionSettings;
  test(settings: ConnectionSettings): Promise<ConnectionResult>;
};

export function createConnectionService(options: ConnectionServiceOptions): ConnectionService {
  return {
    load() {
      return options.store.load();
    },
    save(settings) {
      const validated = validateConnectionSettings(settings);

      options.store.save(validated);

      return validated;
    },
    async test(settings) {
      const validated = validateConnectionSettings(settings);
      const client = createImmichClient({
        fetchImpl: options.fetchImpl,
        logger: options.logger,
        timeouts: options.timeouts,
        settings: validated
      });
      const serverVersion = await client.getServerVersion();
      const currentUser = await client.getCurrentUser();

      return {
        serverLabel: readServerLabel(serverVersion),
        userLabel: readUserLabel(currentUser),
        versionWarning: isSupportedServerVersion(serverVersion)
          ? null
          : `This server needs updating to ${readServerLabel(minimumServerVersion)} or later, so some screens may not load. You can still save these settings.`
      };
    }
  };
}
