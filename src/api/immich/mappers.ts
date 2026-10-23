import type {
  Album,
  AlbumAsset,
  AlbumAssetType,
  AlbumDetail,
  SortOrder,
  TimelineBucket
} from "../../domain/album";
import type { Memory, Person } from "../../domain/home";
import type {
  AlbumDetailResponseDto,
  AlbumResponseDto,
  AssetResponseDto,
  MemoryResponseDto,
  PersonResponseDto,
  TimelineBucketAssetsResponseDto,
  TimelineBucketResponseDto
} from "./dto";

// Maps validated Immich responses to domain models. Nothing outside the
// integration layer sees a DTO.

export function mapAlbum(dto: AlbumResponseDto): Album {
  return {
    assetCount: dto.assetCount || 0,
    id: dto.id,
    name: dto.albumName,
    thumbnailAssetId: dto.albumThumbnailAssetId || null
  };
}

export function mapAlbumDetail(dto: AlbumDetailResponseDto): AlbumDetail {
  const directAssetCount = Array.isArray(dto.assets) ? dto.assets.length : 0;

  return {
    assetCount: dto.assetCount ?? directAssetCount,
    id: dto.id,
    name: dto.albumName,
    thumbnailAssetId: dto.albumThumbnailAssetId || null,
    order: dto.order === "asc" ? "oldest-first" : "newest-first"
  };
}

export function mapAsset(dto: AssetResponseDto): AlbumAsset {
  const name = dto.originalFileName && dto.originalFileName.trim() ? dto.originalFileName : dto.id;

  return {
    capturedAt: mapAssetCapturedAt(dto),
    durationMs: mapAssetDuration(dto.duration),
    id: dto.id,
    livePhotoVideoId: dto.livePhotoVideoId || null,
    location: mapAssetLocation(dto),
    name,
    type: mapAssetType(dto.type)
  };
}

export function mapTimelineBucket(dto: TimelineBucketResponseDto): TimelineBucket {
  return {
    assetCount: dto.count,
    timeBucket: dto.timeBucket
  };
}

export function mapTimelineBucketAssets(
  dto: TimelineBucketAssetsResponseDto,
  limit = dto.id.length
): AlbumAsset[] {
  return dto.id.slice(0, limit).map((id, index) => ({
    capturedAt: dto.fileCreatedAt[index] || null,
    durationMs: mapAssetDuration(dto.duration[index]),
    id,
    livePhotoVideoId: dto.livePhotoVideoId[index] || null,
    location: mapTimelineBucketLocation(dto, index),
    name: id,
    type: dto.isImage[index] ? "image" : "video"
  }));
}

export function mapPerson(dto: PersonResponseDto): Person {
  return {
    id: dto.id,
    isFavorite: dto.isFavorite === true,
    name: firstTrimmedString(dto.name)
  };
}

export function mapMemory(dto: MemoryResponseDto, summary = false): Memory {
  const assets = (summary ? dto.assets.slice(0, 1) : dto.assets).map(mapAsset);

  return {
    assetCount: dto.assets.length,
    assets,
    id: dto.id,
    kind:
      dto.type === "birthday" ? "birthday" : dto.type === "on_this_day" ? "on-this-day" : "other",
    memoryAt: dto.memoryAt,
    personName: firstTrimmedString(dto.data.personName),
    year: dto.data.year
  };
}

function mapTimelineBucketLocation(
  dto: TimelineBucketAssetsResponseDto,
  index: number
): string | null {
  const city = firstTrimmedString(dto.city?.[index]);
  const country = firstTrimmedString(dto.country?.[index]);
  const parts = [city, country].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function mapAssetCapturedAt(dto: AssetResponseDto): string | null {
  return firstTrimmedString(dto.localDateTime, dto.fileCreatedAt);
}

function mapAssetLocation(dto: AssetResponseDto): string | null {
  const city = firstTrimmedString(dto.exifInfo?.city);
  const state = firstTrimmedString(dto.exifInfo?.state);
  const country = firstTrimmedString(dto.exifInfo?.country);
  const parts = [city, state, country].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
}

export function firstTrimmedString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

// Immich reports milliseconds. Older servers sent "H:MM:SS.ffffff" text,
// which is read as milliseconds too; anything else is unknown.
function mapAssetDuration(duration: AssetResponseDto["duration"]): number | null {
  if (typeof duration === "number") {
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  }

  if (typeof duration !== "string") {
    return null;
  }

  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/.exec(duration.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = Number(`0.${match[4] || "0"}`);

  return Math.round(((hours * 60 + minutes) * 60 + seconds + fraction) * 1000);
}

function mapAssetType(type: string): AlbumAssetType {
  if (type === "IMAGE") {
    return "image";
  }

  if (type === "VIDEO") {
    return "video";
  }

  if (type === "AUDIO") {
    return "audio";
  }

  return "other";
}

// Immich's order for a domain sort order: capture dates ascending for oldest
// first.
export function toImmichAssetOrder(order: SortOrder): "asc" | "desc" {
  return order === "oldest-first" ? "asc" : "desc";
}
