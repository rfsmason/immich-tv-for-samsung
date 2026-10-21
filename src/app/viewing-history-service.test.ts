import { describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../domain/album";
import { createLocalViewingHistoryStore } from "../storage/viewing-history-store";
import { createViewingHistoryService } from "./viewing-history-service";

const source = { kind: "album" as const, id: "album", title: "Album" };
const asset = (id: string): AlbumAsset => ({
  id,
  name: id,
  type: "image",
  capturedAt: null,
  durationMs: null,
  livePhotoVideoId: null,
  location: null
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

function fixture() {
  let persisted: string | null = null;
  let settings = { serverUrl: "http://immich.local:2283", apiKey: "private-key" };
  const history = createLocalViewingHistoryStore({
    getItem: () => persisted,
    setItem: (_key, value) => {
      persisted = value;
    }
  });
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith("/users/me"))
      return response({ id: "user", email: "me@example.com", name: "Me" });
    const id = url.split("/").pop()!;
    return response({
      id,
      type: "IMAGE",
      originalFileName: id,
      isTrashed: false,
      visibility: "timeline"
    });
  });
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  let clock = 0;
  const service = createViewingHistoryService({
    connections: {
      load: () => settings,
      save: (value) => {
        settings = value;
      }
    },
    history,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    logger,
    now: () => ++clock
  });
  return {
    service,
    history,
    fetchImpl,
    logger,
    persisted: () => persisted,
    switchServer: () => {
      settings = { ...settings, serverUrl: "http://other.local:2283" };
    }
  };
}

describe("viewing history service", () => {
  it("returns more than the Home rail's 18 when the whole history is requested, up to 50", async () => {
    const { service } = fixture();
    for (let index = 0; index < 55; index += 1) {
      await service.record(asset(`asset-${index}`), source);
    }

    expect((await service.loadAssets(18)).assets).toHaveLength(18);
    expect((await service.loadAssets(50)).assets).toHaveLength(50);
    expect((await service.loadAssets(500)).assets).toHaveLength(50);
  });

  it("has no library fallback and returns only assets actually recorded, in viewing order", async () => {
    const { service, fetchImpl, persisted } = fixture();
    expect((await service.loadAssets(18)).assets).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await service.record(asset("one"), source);
    await service.record(asset("two"), source);
    await service.record(asset("one"), source);
    expect((await service.loadAssets(18)).assets.map((item) => item.id)).toEqual(["one", "two"]);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith("/users/me"))).toHaveLength(1);
    expect(persisted()).not.toContain("private-key");
    expect(persisted()).not.toContain("blob:");
  });

  it("waits for queued records and scopes history to the current server/user", async () => {
    const { service, switchServer } = fixture();
    void service.record(asset("one"), source);
    void service.record(asset("two"), source);
    expect((await service.loadAssets(18)).assets.map((item) => item.id)).toEqual(["two", "one"]);
    switchServer();
    expect((await service.loadAssets(18)).assets).toEqual([]);
  });

  it("prunes trashed and missing assets while retaining the order of available history", async () => {
    const { service, fetchImpl, history } = fixture();
    await service.record(asset("valid"), source);
    await service.record(asset("missing"), source);
    await service.record(asset("trashed"), source);
    fetchImpl.mockImplementation(async (url: string) => {
      if (url.endsWith("/missing")) return response({ message: "Gone" }, 404);
      return response({
        id: url.split("/").pop(),
        type: "IMAGE",
        isTrashed: url.endsWith("/trashed"),
        visibility: "timeline"
      });
    });
    expect((await service.loadAssets(18)).assets.map((item) => item.id)).toEqual(["valid"]);
    expect(
      history.load(JSON.stringify(["http://immich.local:2283", "user"])).map((item) => item.assetId)
    ).toEqual(["valid"]);
  });

  it("drops a deleted asset that Immich answers with 400 and still shows the rest", async () => {
    // Immich's access check reports a deleted asset as 400, not 404.
    const { service, fetchImpl, history } = fixture();
    await service.record(asset("first"), source);
    await service.record(asset("deleted"), source);
    await service.record(asset("latest"), source);
    fetchImpl.mockImplementation(async (url: string) => {
      if (url.endsWith("/users/me"))
        return response({ id: "user", email: "me@example.com", name: "Me" });
      if (url.endsWith("/deleted"))
        return response({ message: "Not found or no asset.read access" }, 400);
      return response({
        id: url.split("/").pop(),
        type: "IMAGE",
        isTrashed: false,
        visibility: "timeline"
      });
    });

    expect((await service.loadAssets(18)).assets.map((item) => item.id)).toEqual([
      "latest",
      "first"
    ]);
    expect(
      history.load(JSON.stringify(["http://immich.local:2283", "user"])).map((item) => item.assetId)
    ).toEqual(["latest", "first"]);
  });

  it("keeps history when the server is temporarily unavailable", async () => {
    const { service, fetchImpl, history } = fixture();
    await service.record(asset("one"), source);
    fetchImpl.mockRejectedValue(new Error("Offline"));
    await expect(service.loadAssets(18)).rejects.toMatchObject({ kind: "network" });
    expect(history.load(JSON.stringify(["http://immich.local:2283", "user"]))).toHaveLength(1);
  });

  it("makes recording failures nonfatal and retries identity on the next visit", async () => {
    const { service, fetchImpl, logger } = fixture();
    fetchImpl.mockRejectedValueOnce(new Error("Offline"));
    await expect(service.record(asset("lost"), source)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("Unable to save local viewing history.");
    await service.record(asset("saved"), source);
    expect((await service.loadAssets(18)).assets.map((item) => item.id)).toEqual(["saved"]);
  });

  it("does not store an old account's pending views after a connection change", async () => {
    const { service, fetchImpl, switchServer } = fixture();
    let resolveUser!: (value: Response) => void;
    fetchImpl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        })
    );
    const recording = service.record(asset("old"), source);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    switchServer();
    resolveUser(response({ id: "old-user", email: "old@example.com", name: "Old" }));
    await recording;
    expect((await service.loadAssets(18)).assets).toEqual([]);
  });
});
