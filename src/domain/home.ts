import type { AlbumAsset } from "./album";

export type Person = {
  id: string;
  isFavorite: boolean;
  // The name assigned in Immich, or null for an unnamed person.
  name: string | null;
};

// One page of Immich's ordered People list (favourites, then named people by
// face count). Pages are numbered from 1.
export type PeoplePage = {
  hasMore: boolean;
  page: number;
  people: Person[];
  total: number;
};

export type MemoryKind = "birthday" | "on-this-day" | "other";

export type Memory = {
  assetCount: number;
  // Discovery retains only the cover; loadMemory(id) supplies the full ordered sequence.
  assets: AlbumAsset[];
  id: string;
  kind: MemoryKind;
  // ISO timestamp the Memory belongs to.
  memoryAt: string;
  personName: string | null;
  year: number;
};

// Immich's `for` parameter is a calendar date, not a UTC timestamp.
export function localMemoryDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
