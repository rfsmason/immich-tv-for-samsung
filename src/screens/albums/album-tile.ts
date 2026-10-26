import type { Album } from "../../domain/album";

// An album as a remote-focusable square tile: its cover, or its initial
// until the cover loads, under its name and asset count. The Albums screen
// and Search's album picker use it.

export function albumTileLabel(album: Album): string {
  return `${album.name}, ${formatAssetCount(album.assetCount)}`;
}

export function createAlbumTile(documentRef: Document, album: Album): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable album-tile";
  tile.type = "button";
  tile.setAttribute("aria-label", albumTileLabel(album));

  const placeholder = documentRef.createElement("span");
  placeholder.className = "album-cover-placeholder";
  placeholder.textContent = readAlbumInitial(album.name);
  tile.appendChild(placeholder);

  const meta = documentRef.createElement("span");
  meta.className = "album-meta";

  const name = documentRef.createElement("span");
  name.className = "album-name";
  name.textContent = album.name;
  meta.appendChild(name);

  const count = documentRef.createElement("span");
  count.className = "album-count";
  count.textContent = formatAssetCount(album.assetCount);
  meta.appendChild(count);

  tile.appendChild(meta);

  return tile;
}

// Shows a loaded cover over a blurred copy of itself, replacing the initial,
// or swaps the image of a cover already shown.
export function setAlbumTileCover(tile: HTMLElement, url: string): void {
  const existingCover = tile.querySelector(".album-cover");

  if (existingCover) {
    existingCover.setAttribute("src", url);
    return;
  }

  const documentRef = tile.ownerDocument;
  const stage = documentRef.createElement("span");
  stage.className = "album-cover-stage";

  const backdrop = documentRef.createElement("img");
  backdrop.alt = "";
  backdrop.className = "album-cover-backdrop";
  backdrop.decoding = "async";
  backdrop.src = url;
  backdrop.setAttribute("aria-hidden", "true");
  stage.appendChild(backdrop);

  const image = documentRef.createElement("img");
  image.alt = "";
  image.className = "album-cover";
  image.decoding = "async";
  image.src = url;
  image.setAttribute("aria-hidden", "true");
  stage.appendChild(image);

  const placeholder = tile.querySelector(".album-cover-placeholder");

  if (placeholder) {
    tile.replaceChild(stage, placeholder);
  }
}

function formatAssetCount(count: number): string {
  return count === 1 ? "1 asset" : `${count} assets`;
}

function readAlbumInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed.charAt(0).toUpperCase() : "A";
}
