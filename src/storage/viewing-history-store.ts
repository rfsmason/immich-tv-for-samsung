import type { ViewingHistoryEntry } from "../domain/viewing-history";
import type { KeyValueStorage } from "./connection-settings-store";

export type ViewingHistoryStore = {
  load(scope: string): ViewingHistoryEntry[];
  record(scope: string, entry: ViewingHistoryEntry): void;
  remove(scope: string, assetId: string): void;
};

const storageKey = "immich-tv.viewing-history";
export const viewingHistoryLimit = 50;

export function createLocalViewingHistoryStore(storage: KeyValueStorage): ViewingHistoryStore {
  function load(scope: string): ViewingHistoryEntry[] {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw) as { version?: unknown; scope?: unknown; entries?: unknown };
      if (data.version !== 1 || data.scope !== scope || !Array.isArray(data.entries)) return [];
      const seen = new Set<string>();
      return data.entries
        .filter((entry: unknown): entry is ViewingHistoryEntry => {
          if (!isEntry(entry) || seen.has(entry.assetId)) return false;
          seen.add(entry.assetId);
          return true;
        })
        .slice(0, viewingHistoryLimit);
    } catch {
      return [];
    }
  }
  function save(scope: string, entries: ViewingHistoryEntry[]): void {
    storage.setItem(storageKey, JSON.stringify({ version: 1, scope, entries }));
  }
  return {
    load,
    record(scope, entry) {
      save(
        scope,
        [entry, ...load(scope).filter((item) => item.assetId !== entry.assetId)].slice(
          0,
          viewingHistoryLimit
        )
      );
    },
    remove(scope, assetId) {
      save(
        scope,
        load(scope).filter((entry) => entry.assetId !== assetId)
      );
    }
  };
}

function isEntry(value: unknown): value is ViewingHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ViewingHistoryEntry>;
  const source = entry.source;
  return (
    typeof entry.assetId === "string" &&
    entry.assetId.length > 0 &&
    typeof entry.viewedAt === "number" &&
    Number.isFinite(entry.viewedAt) &&
    entry.viewedAt >= 0 &&
    Boolean(
      source &&
      (source.kind === "album" ||
        source.kind === "photos" ||
        source.kind === "collection" ||
        source.kind === "library" ||
        source.kind === "memory" ||
        source.kind === "person" ||
        source.kind === "search") &&
      typeof source.id === "string" &&
      typeof source.title === "string"
    )
  );
}
