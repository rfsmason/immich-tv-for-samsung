export type Album = {
  assetCount: number;
  id: string;
  name: string;
  thumbnailAssetId: string | null;
};

// The order a collection lists its assets in, by capture date.
export type SortOrder = "newest-first" | "oldest-first";

export type AlbumAssetType = "audio" | "image" | "other" | "video";

export type AlbumAsset = {
  capturedAt: string | null;
  // Video length in milliseconds; null for stills or when unknown.
  durationMs: number | null;
  id: string;
  livePhotoVideoId: string | null;
  location: string | null;
  name: string;
  type: AlbumAssetType;
};

export type AlbumAssetPageToken =
  | {
      cursor: string;
      kind: "cursor";
    }
  | {
      bucketIndex: number;
      kind: "bucket";
    }
  | {
      kind: "page";
      page: number;
    }
  | {
      // Recently Added: an upload month by its Immich timeBucket value, with
      // the months still to come from the list fetched on the first page.
      kind: "time-bucket";
      later: string[];
      timeBucket: string;
    };

export type AlbumAssetPage = {
  assets: AlbumAsset[];
  nextPageToken: AlbumAssetPageToken | null;
  total: number | null;
};

export type TimelineBucket = {
  assetCount: number;
  // The bucket's ISO start date, which also identifies it in Immich requests.
  timeBucket: string;
};

export type AlbumDetail = Album & {
  // The album's own order, set in Immich.
  order: SortOrder;
};
