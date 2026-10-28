import { describe, expect, it, vi } from "vitest";
import { createImmichClient } from "./client";

// Ambient mode's requests (ADR 0019): random draws and favourites by
// timeline bucket.

const settings = { apiKey: "secret-key", serverUrl: "http://immich.local:2283" };
const base = { trashedAt: { eq: null }, visibility: { eq: "timeline" } };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function setup(body: unknown = [], init: ResponseInit = {}) {
  const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(body, init));
  const client = createImmichClient({ fetchImpl, settings });
  const request = (call = 0) => ({
    body: fetchImpl.mock.calls[call]?.[1]?.body
      ? JSON.parse(String(fetchImpl.mock.calls[call]?.[1]?.body))
      : null,
    method: fetchImpl.mock.calls[call]?.[1]?.method,
    url: String(fetchImpl.mock.calls[call]?.[0])
  });

  return { client, fetchImpl, request };
}

describe("random draws for ambient mode", () => {
  it.each([
    [
      "all photos",
      { albumId: null, includeVideos: false, takenFrom: null },
      { ...base, type: { eq: "IMAGE" } }
    ],
    [
      "photos and videos",
      { albumId: null, includeVideos: true, takenFrom: null },
      { ...base, type: { in: ["IMAGE", "VIDEO"] } }
    ],
    [
      "recent photos",
      { albumId: null, includeVideos: false, takenFrom: new Date("2026-07-28T12:00:00.000Z") },
      { ...base, takenAt: { gte: "2026-07-28T12:00:00.000Z" }, type: { eq: "IMAGE" } }
    ],
    [
      "an album, shuffled",
      { albumId: "album-1", includeVideos: false, takenFrom: null },
      { ...base, albumIds: { any: ["album-1"] }, type: { eq: "IMAGE" } }
    ]
  ])("asks POST /search/random for %s", async (_name, query, filter) => {
    const { client, request } = setup([{ id: "a1", originalFileName: "a1.jpg", type: "IMAGE" }]);

    await expect(client.getRandomAssets(query, 20)).resolves.toMatchObject([
      { id: "a1", type: "image" }
    ]);
    expect(request()).toEqual({
      body: { filter, size: 20, withExif: true },
      method: "POST",
      url: "http://immich.local:2283/api/search/random"
    });
  });

  it("names Albums when an album draw is refused, and Ambient mode otherwise", async () => {
    const { client } = setup({ message: "Missing permission" }, { status: 403 });

    await expect(
      client.getRandomAssets({ albumId: "album-1", includeVideos: false, takenFrom: null }, 20)
    ).rejects.toMatchObject({ feature: "Albums", kind: "permission" });
    await expect(
      client.getRandomAssets({ albumId: null, includeVideos: false, takenFrom: null }, 20)
    ).rejects.toMatchObject({ feature: "Ambient mode", kind: "permission" });
  });

  it("rejects a malformed draw", async () => {
    const { client } = setup({ items: [] });

    await expect(
      client.getRandomAssets({ albumId: null, includeVideos: false, takenFrom: null }, 20)
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("your own favourites by timeline bucket", () => {
  it("lists favourite buckets without partners, dropping empty ones", async () => {
    const { client, request } = setup([
      { count: 3, timeBucket: "2026-10-01" },
      { count: 0, timeBucket: "2026-09-01" }
    ]);

    await expect(client.getFavoriteBuckets()).resolves.toEqual([
      { assetCount: 3, timeBucket: "2026-10-01" }
    ]);
    const { url } = request();
    expect(url).toContain("/api/timeline/buckets?");
    expect(url).toContain("isFavorite=true");
    expect(url).toContain("visibility=timeline");
    expect(url).toContain("isTrashed=false");
    expect(url).not.toContain("withPartners");
  });

  it("loads one bucket's assets", async () => {
    const { client, fetchImpl, request } = setup({
      city: [null],
      country: [null],
      duration: [null],
      fileCreatedAt: ["2026-10-02T10:00:00.000Z"],
      id: ["fav-1"],
      isFavorite: [true],
      isImage: [true],
      livePhotoVideoId: [null]
    });

    await expect(client.getFavoriteBucketAssets("2026-10-01")).resolves.toMatchObject([
      { id: "fav-1", type: "image" }
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(request().url).toContain("/api/timeline/bucket?timeBucket=2026-10-01&");
    expect(request().url).toContain("isFavorite=true");
    expect(request().url).not.toContain("withPartners");
  });
});
