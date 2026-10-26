import type { CurrentUser, ServerVersion } from "../../domain/connection";
import type {
  AlbumDetailResponseDto,
  AlbumResponseDto,
  AssetFaceResponseDto,
  AssetResponseDto,
  MemoryResponseDto,
  PeopleResponseDto,
  PersonResponseDto,
  SearchAssetResponseDto,
  TimelineBucketAssetsResponseDto,
  TimelineBucketResponseDto
} from "./dto";

// Response validators: each checks that an Immich body has the fields this
// client reads before it is mapped, so unexpected shapes fail as "invalid
// response" errors rather than as broken screens.

export function isCurrentUser(body: unknown): body is CurrentUser {
  if (!body || typeof body !== "object") {
    return false;
  }

  const user = body as CurrentUser;

  return requiredString(user.email) && requiredString(user.id) && requiredString(user.name);
}

// Search suggestions: names, with null for assets missing the value.
export function isSuggestionList(body: unknown): body is Array<string | null> {
  return Array.isArray(body) && body.every((value) => value === null || typeof value === "string");
}

export function isAlbumResponseList(body: unknown): body is AlbumResponseDto[] {
  return Array.isArray(body) && body.every(isAlbumListResponse);
}

export function isAlbumResponse(body: unknown): body is AlbumResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const album = body as AlbumResponseDto;

  return (
    requiredString(album.id) &&
    requiredString(album.albumName) &&
    optionalNullableString(album.albumThumbnailAssetId) &&
    optionalNonNegativeNumber(album.assetCount)
  );
}

export function isAlbumListResponse(body: unknown): body is AlbumResponseDto {
  if (!isAlbumResponse(body)) {
    return false;
  }

  const album = body as AlbumResponseDto;

  return (
    nullableString(album.albumThumbnailAssetId) &&
    Number.isFinite(album.assetCount) &&
    Number(album.assetCount) >= 0
  );
}

export function isAlbumDetailResponse(body: unknown): body is AlbumDetailResponseDto {
  if (!isAlbumResponse(body)) {
    return false;
  }

  const album = body as AlbumDetailResponseDto;

  return (
    (album.assets === undefined ||
      (Array.isArray(album.assets) && album.assets.every(isAssetResponse))) &&
    (album.order === undefined ||
      album.order === null ||
      album.order === "asc" ||
      album.order === "desc")
  );
}

export function isSearchAssetResponse(body: unknown): body is SearchAssetResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const response = body as { assets?: unknown };

  if (!response.assets || typeof response.assets !== "object") {
    return false;
  }

  const assets = response.assets as SearchAssetResponseDto["assets"];

  return (
    Array.isArray(assets.items) &&
    assets.items.every(isAssetResponse) &&
    optionalPageToken(assets.nextCursor) &&
    optionalPageToken(assets.nextPage) &&
    optionalNonNegativeNumber(assets.count) &&
    optionalNonNegativeNumber(assets.total)
  );
}

export function isTimelineBucketResponseList(body: unknown): body is TimelineBucketResponseDto[] {
  return Array.isArray(body) && body.every(isTimelineBucketResponse);
}

export function isTimelineBucketResponse(body: unknown): body is TimelineBucketResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const bucket = body as TimelineBucketResponseDto;

  return requiredString(bucket.timeBucket) && Number.isFinite(bucket.count) && bucket.count >= 0;
}

export function isTimelineBucketAssetsResponse(
  body: unknown
): body is TimelineBucketAssetsResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const response = body as TimelineBucketAssetsResponseDto;
  const length = Array.isArray(response.id) ? response.id.length : -1;

  return (
    length >= 0 &&
    response.id.every(requiredString) &&
    Array.isArray(response.fileCreatedAt) &&
    response.fileCreatedAt.length === length &&
    response.fileCreatedAt.every(requiredString) &&
    Array.isArray(response.isImage) &&
    response.isImage.length === length &&
    response.isImage.every((value) => typeof value === "boolean") &&
    Array.isArray(response.duration) &&
    response.duration.length === length &&
    response.duration.every((value) => value === null || Number.isFinite(value)) &&
    Array.isArray(response.livePhotoVideoId) &&
    response.livePhotoVideoId.length === length &&
    response.livePhotoVideoId.every((value) => value === null || typeof value === "string") &&
    optionalNullableStringArray(response.city, length) &&
    optionalNullableStringArray(response.country, length)
  );
}

export function isPeopleResponse(body: unknown): body is PeopleResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const response = body as PeopleResponseDto;

  return (
    Array.isArray(response.people) &&
    response.people.every(isPersonResponse) &&
    Number.isSafeInteger(response.total) &&
    response.total >= 0 &&
    (response.hasNextPage === undefined || typeof response.hasNextPage === "boolean")
  );
}

export function isPersonResponse(body: unknown): body is PersonResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const person = body as PersonResponseDto;

  return (
    requiredString(person.id) &&
    optionalNullableString(person.name) &&
    optionalNullableBoolean(person.isFavorite) &&
    (person.isHidden === undefined ||
      person.isHidden === null ||
      typeof person.isHidden === "boolean")
  );
}

export function isMemoryResponseList(body: unknown): body is MemoryResponseDto[] {
  return Array.isArray(body) && body.every(isMemoryResponse);
}

export function isMemoryResponse(body: unknown): body is MemoryResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const memory = body as MemoryResponseDto;

  return (
    requiredString(memory.id) &&
    requiredString(memory.memoryAt) &&
    Number.isFinite(Date.parse(memory.memoryAt)) &&
    requiredString(memory.type) &&
    Array.isArray(memory.assets) &&
    memory.assets.every(isAssetResponse) &&
    Boolean(memory.data) &&
    typeof memory.data === "object" &&
    Number.isInteger(memory.data.year) &&
    memory.data.year >= 1000 &&
    memory.data.year <= 9999 &&
    optionalNullableString(memory.data.personName)
  );
}

export function isAssetResponseList(body: unknown): body is AssetResponseDto[] {
  return Array.isArray(body) && body.every(isAssetResponse);
}

export function isAssetResponse(body: unknown): body is AssetResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const asset = body as AssetResponseDto;

  return (
    requiredString(asset.id) &&
    requiredString(asset.type) &&
    (asset.originalFileName === undefined ||
      asset.originalFileName === null ||
      typeof asset.originalFileName === "string") &&
    optionalNullableString(asset.livePhotoVideoId) &&
    optionalNullableString(asset.localDateTime) &&
    optionalNullableString(asset.fileCreatedAt) &&
    (asset.exifInfo === undefined ||
      asset.exifInfo === null ||
      isAssetExifResponse(asset.exifInfo)) &&
    (asset.duration === undefined ||
      asset.duration === null ||
      typeof asset.duration === "string" ||
      Number.isFinite(asset.duration))
  );
}

export function isAssetExifResponse(
  body: unknown
): body is NonNullable<AssetResponseDto["exifInfo"]> {
  if (!body || typeof body !== "object") {
    return false;
  }

  const exif = body as NonNullable<AssetResponseDto["exifInfo"]>;

  return (
    optionalNullableString(exif.city) &&
    optionalNullableString(exif.state) &&
    optionalNullableString(exif.country)
  );
}

export function isServerVersion(body: unknown): body is ServerVersion {
  if (!body || typeof body !== "object") {
    return false;
  }

  const version = body as ServerVersion;

  return (
    Number.isFinite(version.major) &&
    Number.isFinite(version.minor) &&
    Number.isFinite(version.patch)
  );
}

export function requiredString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function nullableString(value: unknown): boolean {
  return value === null || requiredString(value);
}

export function optionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

export function optionalNullableBoolean(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}

export function optionalNullableStringArray(value: unknown, length: number): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length === length &&
      value.every((item) => item === null || typeof item === "string"))
  );
}

export function optionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined || value === null || (Number.isFinite(value) && Number(value) >= 0);
}

export function optionalPageToken(value: unknown): boolean {
  return (
    value === undefined || value === null || typeof value === "string" || Number.isFinite(value)
  );
}

export function isAssetFaceResponseList(body: unknown): body is AssetFaceResponseDto[] {
  return Array.isArray(body) && body.every(isAssetFaceResponse);
}

function isAssetFaceResponse(body: unknown): body is AssetFaceResponseDto {
  if (!body || typeof body !== "object") {
    return false;
  }

  const face = body as AssetFaceResponseDto;

  return (
    requiredString(face.id) &&
    [
      face.boundingBoxX1,
      face.boundingBoxX2,
      face.boundingBoxY1,
      face.boundingBoxY2,
      face.imageHeight,
      face.imageWidth
    ].every((value) => typeof value === "number" && Number.isFinite(value)) &&
    (face.person === null || isPersonResponse(face.person))
  );
}
