import { createImmichClient } from "../api/immich/client";
import type { RequestTimeouts } from "../api/immich/http";
import type { AlbumAsset, AlbumAssetPage } from "../domain/album";
import type { ConnectionSettings } from "../domain/connection";
import type { ViewingHistoryEntry, ViewingSource } from "../domain/viewing-history";
import { AppError } from "../errors/app-error";
import type { Logger } from "../logging/logger";
import type { ConnectionSettingsStore } from "../storage/connection-settings-store";
import { viewingHistoryLimit, type ViewingHistoryStore } from "../storage/viewing-history-store";

export type ViewingHistoryService = {
  record(asset: AlbumAsset, source: ViewingSource): Promise<void>;
  loadAssets(limit: number): Promise<AlbumAssetPage>;
};

export function createViewingHistoryService(options: {
  connections: ConnectionSettingsStore;
  history: ViewingHistoryStore;
  logger: Logger;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeouts?: Partial<RequestTimeouts>;
}): ViewingHistoryService {
  let identity: { settings: ConnectionSettings; scope: Promise<string> } | null = null;
  let pending = Promise.resolve();
  let writing = false;
  let queued: { settings: ConnectionSettings; entry: ViewingHistoryEntry }[] = [];
  function sameConnection(a: ConnectionSettings, b: ConnectionSettings | null): boolean {
    return a.serverUrl === b?.serverUrl && a.apiKey === b?.apiKey;
  }
  function connection() {
    const settings = options.connections.load();
    if (!settings) throw new AppError("invalid-config", "Configure an Immich connection first.");
    const client = createImmichClient({
      settings,
      fetchImpl: options.fetchImpl,
      logger: options.logger,
      timeouts: options.timeouts
    });
    if (!identity || !sameConnection(settings, identity.settings)) {
      const scope = client
        .getCurrentUser()
        .then((user) => JSON.stringify([settings.serverUrl, user.id]));
      const nextIdentity = { settings, scope };
      identity = nextIdentity;
      void scope.catch(() => {
        if (identity === nextIdentity) identity = null;
      });
    }
    return { settings, client, scope: identity.scope };
  }
  return {
    record(asset, source) {
      if (asset.type !== "image" && asset.type !== "video") return Promise.resolve();
      const viewedAt = (options.now || Date.now)();
      let settings: ConnectionSettings | null;
      try {
        settings = options.connections.load();
      } catch {
        options.logger.warn("Unable to save local viewing history.");
        return Promise.resolve();
      }
      if (!settings) return Promise.resolve();
      queued.push({ settings, entry: { assetId: asset.id, viewedAt, source } });
      queued = queued.slice(-viewingHistoryLimit);
      if (writing) return pending;
      writing = true;
      pending = Promise.resolve().then(async () => {
        try {
          while (queued.length > 0) {
            const current = connection();
            queued = queued.filter((item) => sameConnection(item.settings, current.settings));
            if (queued.length === 0) break;
            const scope = await current.scope;
            if (!sameConnection(current.settings, options.connections.load())) continue;
            // The queue stays bounded while identity lookup is in flight.
            for (const item of queued) {
              options.history.record(scope, item.entry);
            }
            queued = [];
          }
        } catch {
          // Persistence/identity failures must never interrupt viewing or leak credentials.
          options.logger.warn("Unable to save local viewing history.");
        }
        queued = [];
        writing = false;
      });
      return pending;
    },
    async loadAssets(limit) {
      await pending;
      const current = connection();
      const scope = await current.scope;
      const count = Number.isFinite(limit)
        ? Math.max(1, Math.min(viewingHistoryLimit, Math.floor(limit)))
        : 18;
      // Revalidate at most 50 IDs, three at a time; preserve local viewing order.
      const entries = options.history.load(scope);
      const assets: AlbumAsset[] = [];
      for (let start = 0; start < entries.length && assets.length < count; start += 3) {
        const batch = await Promise.all(
          entries.slice(start, start + 3).map(async (entry) => {
            const asset = await current.client.getHistoryAsset(entry.assetId);
            if (!asset && sameConnection(current.settings, options.connections.load())) {
              options.history.remove(scope, entry.assetId);
            }
            return asset;
          })
        );
        assets.push(...batch.filter((asset): asset is AlbumAsset => asset !== null));
      }
      if (!sameConnection(current.settings, options.connections.load())) {
        return { assets: [], nextPageToken: null, total: 0 };
      }
      // The remaining history size tells Home whether more exist than it shows.
      return {
        assets: assets.slice(0, count),
        nextPageToken: null,
        total: options.history.load(scope).length
      };
    }
  };
}
