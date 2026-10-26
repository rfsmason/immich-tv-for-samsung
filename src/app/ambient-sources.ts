import type { AlbumAsset, AlbumAssetPageToken, TimelineBucket } from "../domain/album";
import {
  ambientRecentDays,
  readAmbientOrder,
  type AmbientRandomQuery,
  type AmbientSettings
} from "../domain/ambient";
import { localMemoryDate, type Memory } from "../domain/home";
import type { AlbumService } from "./album-service";

// Where ambient mode's pictures come from (ADR 0019). Every source has one
// small interface, holds a bounded look-ahead, and avoids showing anything
// it showed recently. A small source repeats once it runs out rather than
// stopping, and an empty source answers null.

export type AmbientAssetSource = {
  // The next asset to show, or null when the source has nothing to show.
  next(): Promise<AlbumAsset | null>;
};

export type AmbientSourceService = Pick<
  AlbumService,
  | "loadAlbumAssetsPage"
  | "loadFavoriteBucketAssets"
  | "loadFavoriteBuckets"
  | "loadMemories"
  | "loadMemory"
  | "loadRandomAssets"
>;

type SourceOptions = {
  now?(): Date;
  // Returns a number in [0, 1); tests make it predictable.
  random?(): number;
};

// Assets drawn per random request.
export const ambientBatchSize = 20;
// Asset ids remembered to avoid immediate repeats.
export const ambientRecentRingSize = 200;
// Memories considered: today's, as Home shows them.
const ambientMemoryLimit = 20;
// Draws, buckets or Memories tried before a repeat is allowed.
const maxAttempts = 3;
// Album pages read in one call before giving up on finding a picture.
const maxPagesPerCall = 5;

// A bounded ring of recently shown ids.
export type RecentRing = {
  add(id: string): void;
  has(id: string): boolean;
  size(): number;
};

export function createRecentRing(capacity: number): RecentRing {
  const ids: string[] = [];
  const present: Record<string, number> = {};

  return {
    add(id) {
      ids.push(id);
      present[id] = (present[id] || 0) + 1;

      while (ids.length > capacity) {
        const dropped = ids.shift()!;

        present[dropped]! -= 1;

        if (present[dropped] === 0) {
          delete present[dropped];
        }
      }
    },
    has: (id) => Boolean(present[id]),
    size: () => ids.length
  };
}

export function isAmbientPlayable(asset: AlbumAsset, includeVideos: boolean): boolean {
  return asset.type === "image" || (includeVideos && asset.type === "video");
}

export function createAmbientSource(
  settings: AmbientSettings,
  service: AmbientSourceService,
  options: SourceOptions = {}
): AmbientAssetSource {
  const now = options.now || (() => new Date());
  const random = options.random || Math.random;
  const ring = createRecentRing(ambientRecentRingSize);
  const accept = (asset: AlbumAsset) => isAmbientPlayable(asset, settings.includeVideos);
  const context = { accept, random, ring, service };
  const order = readAmbientOrder(settings);

  switch (settings.source) {
    case "favorites":
      return createFavoritesSource(context);
    case "memories":
      return createMemoriesSource(context, order === "in-order", localMemoryDate(now()));
    case "album":
      if (!settings.album) {
        return { next: () => Promise.resolve(null) };
      }

      return order === "in-order"
        ? createAlbumInOrderSource(context, settings.album.id)
        : createRandomSource(context, {
            albumId: settings.album.id,
            includeVideos: settings.includeVideos,
            takenFrom: null
          });
    case "recent":
      return createRandomSource(context, {
        albumId: null,
        includeVideos: settings.includeVideos,
        takenFrom: new Date(now().getTime() - ambientRecentDays * 24 * 60 * 60 * 1000)
      });
    default:
      return createRandomSource(context, {
        albumId: null,
        includeVideos: settings.includeVideos,
        takenFrom: null
      });
  }
}

type SourceContext = {
  accept(asset: AlbumAsset): boolean;
  random(): number;
  ring: RecentRing;
  service: AmbientSourceService;
};

function pick<T>(items: T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function shown(context: SourceContext, asset: AlbumAsset): AlbumAsset {
  context.ring.add(asset.id);
  return asset;
}

// All photos, Recent and a shuffled album: small random draws, skipping
// anything shown recently. A draw smaller than asked for means the source
// is small, so its assets may repeat.
function createRandomSource(context: SourceContext, query: AmbientRandomQuery): AmbientAssetSource {
  let buffer: AlbumAsset[] = [];

  return {
    async next() {
      let lastDraw: AlbumAsset[] = [];

      for (let attempt = 0; attempt < maxAttempts && buffer.length === 0; attempt += 1) {
        const draw = (await context.service.loadRandomAssets(query, ambientBatchSize)).filter(
          context.accept
        );

        if (draw.length === 0) {
          return null;
        }

        lastDraw = draw;
        buffer = draw.filter((asset) => !context.ring.has(asset.id));

        if (buffer.length === 0 && draw.length < ambientBatchSize) {
          buffer = draw;
        }
      }

      if (buffer.length === 0) {
        buffer = lastDraw;
      }

      return shown(context, buffer.shift()!);
    }
  };
}

// Your own favourites, without loading them all: pick a timeline bucket
// weighted by its count, load only that bucket, and pick within it.
function createFavoritesSource(context: SourceContext): AmbientAssetSource {
  let buckets: TimelineBucket[] | null = null;
  let current: { assets: AlbumAsset[]; timeBucket: string } | null = null;

  function pickBucket(list: TimelineBucket[]): TimelineBucket {
    const total = list.reduce((sum, bucket) => sum + bucket.assetCount, 0);
    let target = context.random() * total;

    for (const bucket of list) {
      target -= bucket.assetCount;

      if (target < 0) {
        return bucket;
      }
    }

    return list[list.length - 1]!;
  }

  return {
    async next() {
      if (!buckets) {
        buckets = await context.service.loadFavoriteBuckets();
      }

      if (buckets.length === 0) {
        return null;
      }

      let fallback: AlbumAsset | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const bucket = pickBucket(buckets);

        if (current?.timeBucket !== bucket.timeBucket) {
          current = {
            assets: await context.service.loadFavoriteBucketAssets(bucket.timeBucket),
            timeBucket: bucket.timeBucket
          };
        }

        const eligible = current.assets.filter(context.accept);
        const fresh = eligible.filter((asset) => !context.ring.has(asset.id));
        const chosen = pick(fresh, context.random);

        if (chosen) {
          return shown(context, chosen);
        }

        fallback = fallback || pick(eligible, context.random);
      }

      return fallback ? shown(context, fallback) : null;
    }
  };
}

// An album in order: one page at a time, oldest first, starting again at
// the beginning after the last page.
function createAlbumInOrderSource(context: SourceContext, albumId: string): AmbientAssetSource {
  let assets: AlbumAsset[] = [];
  let index = 0;
  let token: AlbumAssetPageToken | null = null;
  let atEnd = true;

  return {
    async next() {
      for (let pages = 0; pages <= maxPagesPerCall;) {
        if (index >= assets.length) {
          if (atEnd) {
            token = null;
          }

          const page = await context.service.loadAlbumAssetsPage(albumId, "oldest-first", token);

          pages += 1;
          assets = page.assets;
          index = 0;
          token = page.nextPageToken;
          atEnd = token === null;

          if (assets.length === 0 && atEnd) {
            return null;
          }

          continue;
        }

        const asset = assets[index]!;

        index += 1;

        if (context.accept(asset)) {
          return shown(context, asset);
        }
      }

      return null;
    }
  };
}

// Today's Memories, as Home shows them: in order, Memory by Memory, or
// shuffled across them. Only the Memory being shown keeps its assets.
function createMemoriesSource(
  context: SourceContext,
  inOrder: boolean,
  date: string
): AmbientAssetSource {
  let memories: Memory[] | null = null;
  let memoryIndex = -1;
  let current: { assets: AlbumAsset[]; id: string } | null = null;
  let assetIndex = 0;

  async function load(memory: Memory): Promise<AlbumAsset[]> {
    if (current?.id !== memory.id) {
      current = { assets: (await context.service.loadMemory(memory.id)).assets, id: memory.id };
      assetIndex = 0;
    }

    return current.assets;
  }

  return {
    async next() {
      if (!memories) {
        memories = (await context.service.loadMemories(ambientMemoryLimit, 1, date)).filter(
          (memory) => memory.assetCount > 0
        );
      }

      if (memories.length === 0) {
        return null;
      }

      if (inOrder) {
        // Each Memory once round, then start again.
        for (let step = 0; step <= memories.length; step += 1) {
          if (memoryIndex < 0 || !current || assetIndex >= current.assets.length) {
            memoryIndex = (memoryIndex + 1) % memories.length;
            await load(memories[memoryIndex]!);
          }

          while (current && assetIndex < current.assets.length) {
            const asset = current.assets[assetIndex]!;

            assetIndex += 1;

            if (context.accept(asset)) {
              return shown(context, asset);
            }
          }
        }

        return null;
      }

      let fallback: AlbumAsset | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const eligible = (await load(pick(memories, context.random)!)).filter(context.accept);
        const chosen = pick(
          eligible.filter((asset) => !context.ring.has(asset.id)),
          context.random
        );

        if (chosen) {
          return shown(context, chosen);
        }

        fallback = fallback || pick(eligible, context.random);
      }

      return fallback ? shown(context, fallback) : null;
    }
  };
}
