import type { Album } from "../domain/album";

export type AlbumStatus = {
  message: string;
  state: "idle" | "success";
};

export function getAlbumStatus(albums: Album[]): AlbumStatus {
  if (albums.length === 0) {
    return {
      message: "No albums found in this Immich account.",
      state: "idle"
    };
  }

  // The grid itself shows the albums; no count is needed.
  return { message: "", state: "success" };
}
