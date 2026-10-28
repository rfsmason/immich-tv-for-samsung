import { describe, expect, it, vi } from "vitest";
import type { AlbumAsset, AlbumAssetPage } from "../domain/album";
import { defaultAmbientSettings, type AmbientSettings } from "../domain/ambient";
import type { Memory } from "../domain/home";
import {
  ambientBatchSize,
  ambientRecentRingSize,
  createAmbientSource,
  createRecentRing,
  type AmbientSourceService
} from "./ambient-sources";

function asset(id: string, type: AlbumAsset["type"] = "image"): AlbumAsset {
  return {
    capturedAt: null,
    durationMs: null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: `${id}.jpg`,
    type
  };
}

const ids = (assets: Array<AlbumAsset | null>) => assets.map((item) => item?.id ?? null);

function service(overrides: Partial<AmbientSourceService> = {}): AmbientSourceService {
  return {
    loadAlbumAssetsPage: vi.fn(async () => ({ assets: [], nextPageToken: null, total: 0 })),
    loadFavoriteBucketAssets: vi.fn(async () => []),
    loadFavoriteBuckets: vi.fn(async () => []),
    loadMemories: vi.fn(async () => []),
    loadMemory: vi.fn(),
    loadRandomAssets: vi.fn(async () => []),
    ...overrides
  } as AmbientSourceService;
}

const settings = (overrides: Partial<AmbientSettings>): AmbientSettings => ({
  ...defaultAmbientSettings,
  ...overrides
});

async function take(source: { next(): Promise<AlbumAsset | null> }, count: number) {
  const shown: Array<AlbumAsset | null> = [];

  for (let step = 0; step < count; step += 1) {
    shown.push(await source.next());
  }

  return shown;
}

describe("recent ring", () => {
  it("remembers a bounded number of ids", () => {
    const ring = createRecentRing(3);

    ["a", "b", "c", "d"].forEach(ring.add);
    expect(ring.has("a")).toBe(false);
    expect(ring.has("d")).toBe(true);
    expect(ring.size()).toBe(3);
  });

  it("keeps an id that is still in the ring from a later repeat", () => {
    const ring = createRecentRing(2);

    ["a", "a", "b"].forEach(ring.add);
    expect(ring.has("a")).toBe(true);
  });
});

describe("random sources", () => {
  const now = () => new Date("2026-10-26T12:00:00.000Z");

  it.each([
    ["all photos", settings({}), { albumId: null, includeVideos: false, takenFrom: null }],
    [
      "photos and videos",
      settings({ includeVideos: true }),
      { albumId: null, includeVideos: true, takenFrom: null }
    ],
    [
      "recent, the last 90 days",
      settings({ source: "recent" }),
      { albumId: null, includeVideos: false, takenFrom: new Date("2026-07-28T12:00:00.000Z") }
    ],
    [
      "a shuffled album",
      settings({ album: { id: "album-1", name: "Summer Example" }, source: "album" }),
      { albumId: "album-1", includeVideos: false, takenFrom: null }
    ]
  ])("draws %s in small batches", async (_name, chosen, query) => {
    const loadRandomAssets = vi.fn(async () => [asset("a"), asset("b")]);
    const source = createAmbientSource(chosen, service({ loadRandomAssets }), { now });

    expect(ids(await take(source, 2))).toEqual(["a", "b"]);
    expect(loadRandomAssets).toHaveBeenCalledTimes(1);
    expect(loadRandomAssets).toHaveBeenCalledWith(query, ambientBatchSize);
  });

  it("skips anything shown recently, drawing again", async () => {
    const draws = [
      ["a", "b"],
      ["b", "a", "c"]
    ].map((list) => list.map((id) => asset(id)));
    const full = (list: AlbumAsset[]) =>
      list.concat(Array.from({ length: ambientBatchSize - list.length }, (_, i) => asset(`x${i}`)));
    const loadRandomAssets = vi
      .fn()
      .mockResolvedValueOnce(full(draws[0]!))
      .mockResolvedValueOnce(full(draws[1]!).slice(0, 3).concat(full([]).slice(0, 17)));
    const source = createAmbientSource(settings({}), service({ loadRandomAssets }));

    const first = await take(source, ambientBatchSize);
    expect(new Set(ids(first)).size).toBe(ambientBatchSize);
    // The next draw repeats a, b and the x assets; only c is new.
    expect((await source.next())?.id).toBe("c");
  });

  it("repeats a small source once it is exhausted, rather than stopping", async () => {
    const loadRandomAssets = vi.fn(async () => [asset("a"), asset("b")]);
    const source = createAmbientSource(settings({}), service({ loadRandomAssets }));

    expect(ids(await take(source, 5))).toEqual(["a", "b", "a", "b", "a"]);
  });

  it("leaves out videos unless they are included", async () => {
    const loadRandomAssets = vi.fn(async () => [asset("v", "video"), asset("p")]);
    const source = createAmbientSource(settings({}), service({ loadRandomAssets }));

    expect((await source.next())?.id).toBe("p");
  });

  it("answers null for an empty source, or an album source without an album", async () => {
    expect(await createAmbientSource(settings({}), service()).next()).toBeNull();
    expect(await createAmbientSource(settings({ source: "album" }), service()).next()).toBeNull();
  });
});

describe("favourites source", () => {
  const buckets = [
    { assetCount: 1, timeBucket: "2026-10-01" },
    { assetCount: 3, timeBucket: "2026-09-01" }
  ];

  it("picks a bucket weighted by its count and loads only that bucket", async () => {
    const loadFavoriteBucketAssets = vi.fn(async (timeBucket: string) =>
      timeBucket === "2026-09-01" ? [asset("s1"), asset("s2"), asset("s3")] : [asset("o1")]
    );
    const loadFavoriteBuckets = vi.fn(async () => buckets);
    // 0.3 of 4 favourites falls in the second bucket (after the first's 1).
    const source = createAmbientSource(
      settings({ source: "favorites" }),
      service({ loadFavoriteBucketAssets, loadFavoriteBuckets }),
      { random: () => 0.3 }
    );

    expect((await source.next())?.id).toBe("s1");
    expect(loadFavoriteBuckets).toHaveBeenCalledTimes(1);
    expect(loadFavoriteBucketAssets).toHaveBeenCalledTimes(1);
    expect(loadFavoriteBucketAssets).toHaveBeenCalledWith("2026-09-01");
  });

  it("picks the first bucket for a low draw, and avoids recent repeats within a bucket", async () => {
    const loadFavoriteBucketAssets = vi.fn(async () => [asset("o1"), asset("o2")]);
    const source = createAmbientSource(
      settings({ source: "favorites" }),
      service({ loadFavoriteBucketAssets, loadFavoriteBuckets: vi.fn(async () => buckets) }),
      { random: () => 0.1 }
    );

    expect(ids(await take(source, 3))).toEqual(["o1", "o2", "o1"]);
    expect(loadFavoriteBucketAssets).toHaveBeenCalledWith("2026-10-01");
    expect(loadFavoriteBucketAssets).toHaveBeenCalledTimes(1);
  });

  it("answers null with no favourites", async () => {
    const source = createAmbientSource(settings({ source: "favorites" }), service());

    expect(await source.next()).toBeNull();
  });
});

describe("album in order", () => {
  it("plays pages oldest first and starts again after the last", async () => {
    const pages: Record<string, AlbumAssetPage> = {
      first: {
        assets: [asset("a"), asset("v", "video"), asset("b")],
        nextPageToken: { cursor: "2", kind: "cursor" },
        total: 4
      },
      second: { assets: [asset("c")], nextPageToken: null, total: 4 }
    };
    const loadAlbumAssetsPage = vi.fn(async (_id: string, _order: string, token: unknown) =>
      token ? pages.second! : pages.first!
    );
    const source = createAmbientSource(
      settings({
        album: { id: "album-1", name: "Summer Example" },
        order: "in-order",
        source: "album"
      }),
      service({ loadAlbumAssetsPage })
    );

    expect(ids(await take(source, 5))).toEqual(["a", "b", "c", "a", "b"]);
    expect(loadAlbumAssetsPage).toHaveBeenCalledWith("album-1", "oldest-first", null);
    expect(loadAlbumAssetsPage).toHaveBeenCalledTimes(3);
  });

  it("answers null for an empty album", async () => {
    const source = createAmbientSource(
      settings({ album: { id: "album-1", name: "Empty" }, order: "in-order", source: "album" }),
      service()
    );

    expect(await source.next()).toBeNull();
  });
});

describe("Memories source", () => {
  const memory = (id: string, assets: AlbumAsset[]): Memory => ({
    assetCount: assets.length,
    assets: assets.slice(0, 1),
    id,
    kind: "on-this-day",
    memoryAt: "2026-10-26T00:00:00.000Z",
    personName: null,
    year: 2020
  });
  const full: Record<string, AlbumAsset[]> = {
    m1: [asset("a"), asset("b")],
    m2: [asset("c")]
  };

  function memoriesService() {
    return service({
      loadMemories: vi.fn(async () => [memory("m1", full.m1!), memory("m2", full.m2!)]),
      loadMemory: vi
        .fn(async (id: string) => memory(id, full[id]!) as Memory)
        .mockImplementation(async (id: string) => ({ ...memory(id, full[id]!), assets: full[id]! }))
    });
  }

  it("plays today's Memories in order and starts again", async () => {
    const memories = memoriesService();
    const source = createAmbientSource(
      settings({ order: "in-order", source: "memories" }),
      memories,
      {
        now: () => new Date(2026, 9, 26, 12)
      }
    );

    expect(ids(await take(source, 4))).toEqual(["a", "b", "c", "a"]);
    expect(memories.loadMemories).toHaveBeenCalledWith(20, 1, "2026-10-26");
  });

  it("shuffles across Memories, keeping only one Memory's assets", async () => {
    const memories = memoriesService();
    const source = createAmbientSource(settings({ source: "memories" }), memories, {
      random: () => 0
    });

    expect(ids(await take(source, 3))).toEqual(["a", "b", "a"]);
  });

  it("answers null with no Memories today", async () => {
    expect(
      await createAmbientSource(settings({ source: "memories" }), service()).next()
    ).toBeNull();
  });
});

describe("repeat avoidance on a large source", () => {
  it("never repeats within the ring", async () => {
    let next = 0;
    const loadRandomAssets = vi.fn(async () =>
      Array.from({ length: ambientBatchSize }, () => asset(`a${(next += 1) % 1000}`))
    );
    const source = createAmbientSource(settings({}), service({ loadRandomAssets }));
    const shown = ids(await take(source, ambientRecentRingSize));

    expect(new Set(shown).size).toBe(ambientRecentRingSize);
  });
});
