export type ViewingSource = {
  kind: "album" | "photos" | "collection" | "library" | "memory" | "person" | "search";
  id: string;
  title: string;
};

export type ViewingHistoryEntry = {
  assetId: string;
  viewedAt: number;
  source: ViewingSource;
};
