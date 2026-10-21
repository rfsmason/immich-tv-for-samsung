// Immich response shapes this client reads, as the server sends them. They
// stay inside the integration layer; validators.ts checks them and mappers.ts
// turns them into domain models.

export type AlbumResponseDto = {
  albumName: string;
  albumThumbnailAssetId?: string | null;
  assetCount?: number | null;
  id: string;
};

export type AlbumDetailResponseDto = AlbumResponseDto & {
  assets?: AssetResponseDto[];
  order?: string | null;
};

export type AssetResponseDto = {
  duration?: number | string | null;
  exifInfo?: {
    city?: string | null;
    country?: string | null;
    state?: string | null;
  } | null;
  fileCreatedAt?: string | null;
  id: string;
  livePhotoVideoId?: string | null;
  localDateTime?: string | null;
  originalFileName?: string | null;
  type: string;
};

export type SearchAssetResponseDto = {
  assets: {
    count?: number;
    items: AssetResponseDto[];
    nextPage?: number | string | null;
    nextCursor?: string | null;
    total?: number;
  };
};

export type PeopleResponseDto = {
  // Optional until Immich makes it required ("after a few versions").
  hasNextPage?: boolean;
  people: PersonResponseDto[];
  total: number;
};

export type PersonResponseDto = {
  id: string;
  isFavorite?: boolean | null;
  isHidden?: boolean | null;
  name?: string | null;
};

export type MemoryResponseDto = {
  assets: AssetResponseDto[];
  data: {
    personName?: string | null;
    year: number;
  };
  id: string;
  memoryAt: string;
  type: string;
};

export type TimelineBucketResponseDto = {
  count: number;
  timeBucket: string;
};

export type TimelineBucketAssetsResponseDto = {
  city?: Array<string | null>;
  country?: Array<string | null>;
  duration: Array<number | null>;
  fileCreatedAt: string[];
  id: string[];
  isImage: boolean[];
  livePhotoVideoId: Array<string | null>;
};
