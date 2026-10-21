import { describe, expect, it } from "vitest";
import { createLocalViewingHistoryStore, viewingHistoryLimit } from "./viewing-history-store";

function fixture(raw: string | null = null) {
  let value = raw;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    }
  };
  return { storage, read: () => value, store: createLocalViewingHistoryStore(storage) };
}
const entry = (assetId: string, viewedAt = 1) => ({
  assetId,
  viewedAt,
  source: { kind: "album" as const, id: "album", title: "Album" }
});

describe("local viewing history", () => {
  it("starts empty, persists, deduplicates and moves revisited assets to the front", () => {
    const { store, storage, read } = fixture();
    expect(store.load("user")).toEqual([]);
    store.record("user", entry("first"));
    store.record("user", entry("second", 2));
    store.record("user", entry("first", 3));
    expect(createLocalViewingHistoryStore(storage).load("user")).toEqual([
      entry("first", 3),
      entry("second", 2)
    ]);
    expect(read()).not.toContain("apiKey");
  });

  it("extends version 1 history with Memory sources while retaining every existing source kind", () => {
    const entries = ["album", "photos", "collection", "memory"].map((kind, i) => ({
      ...entry(String(i)),
      source: { kind, id: `source-${i}`, title: kind }
    }));
    const { store } = fixture(JSON.stringify({ version: 1, scope: "user", entries }));
    expect(store.load("user")).toEqual(entries);
    store.record("user", {
      ...entry("new"),
      source: { kind: "memory", id: "memory-id", title: "Memory" }
    });
    expect(store.load("user")).toHaveLength(5);
    expect(store.load("user")[0]?.source.kind).toBe("memory");
  });

  it("extends version 1 history with person sources and still loads older entries", () => {
    const older = ["album", "photos", "collection", "memory"].map((kind, i) => ({
      ...entry(String(i)),
      source: { kind, id: `source-${i}`, title: kind }
    }));
    const { storage, store } = fixture(
      JSON.stringify({ version: 1, scope: "user", entries: older })
    );
    const person = {
      ...entry("person-asset"),
      source: { kind: "person" as const, id: "person-p1", title: "Rory" }
    };

    store.record("user", person);

    expect(store.load("user")[0]).toEqual(person);
    expect(store.load("user").slice(1)).toEqual(older);
    expect(createLocalViewingHistoryStore(storage).load("user")).toHaveLength(5);
  });

  it("records a search source alongside older entries", () => {
    const { store } = fixture(
      JSON.stringify({ version: 1, scope: "user", entries: [entry("old")] })
    );
    const search = {
      ...entry("search-asset", 2),
      source: { kind: "search" as const, id: "search", title: "Rory · From 1 Jan 2020" }
    };

    store.record("user", search);

    expect(store.load("user")).toEqual([search, entry("old")]);
  });

  it("records a library source alongside older entries", () => {
    const { store } = fixture(
      JSON.stringify({ version: 1, scope: "user", entries: [entry("old")] })
    );
    const library = {
      ...entry("video-asset", 3),
      source: { kind: "library" as const, id: "videos", title: "Videos" }
    };

    store.record("user", library);

    expect(store.load("user")).toEqual([library, entry("old")]);
  });

  it("drops an entry with an unknown source kind", () => {
    const { store } = fixture(
      JSON.stringify({
        version: 1,
        scope: "user",
        entries: [{ ...entry("x"), source: { kind: "trip", id: "t", title: "Trip" } }]
      })
    );

    expect(store.load("user")).toEqual([]);
  });

  it("bounds persistence and isolates server/user scopes", () => {
    const { store } = fixture();
    for (let i = 0; i < 100; i += 1) store.record("one", entry(String(i), i));
    expect(store.load("one")).toHaveLength(viewingHistoryLimit);
    expect(store.load("one")[0]?.assetId).toBe("99");
    expect(store.load("two")).toEqual([]);
    store.record("two", entry("new-account"));
    expect(store.load("one")).toEqual([]);
  });

  it.each(["null", "{}", "bad json", '{"version":2,"scope":"user","entries":[]}'])(
    "ignores invalid or unsupported persisted history: %s",
    (raw) => {
      expect(fixture(raw).store.load("user")).toEqual([]);
    }
  );

  it("validates persisted entries and removes only the unavailable asset", () => {
    const { store } = fixture(
      JSON.stringify({
        version: 1,
        scope: "user",
        entries: [entry("one"), entry("one"), { ...entry("bad"), source: null }, null, entry("two")]
      })
    );
    expect(store.load("user")).toEqual([entry("one"), entry("two")]);
    store.remove("user", "one");
    expect(store.load("user")).toEqual([entry("two")]);
  });
});
