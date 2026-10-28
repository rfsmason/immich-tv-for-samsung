import type { AlbumAsset } from "../domain/album";

// One asset's media on screen: a still in an <img> and playback in a
// <video>. The full-screen viewer and ambient mode both present assets
// through these, so every still and video is shown and released the same
// way (ADR 0005, ADR 0019). Preview URLs come from the bounded viewer image
// window (asset-viewer-window.ts); these only show and release elements.

// Shows `url`, an asset's preview or poster, in `image`.
export function showStill(image: HTMLImageElement, asset: AlbumAsset, url: string): void {
  image.src = url;
  image.alt = asset.name;
  image.setAttribute("data-asset-id", asset.id);
  image.hidden = false;
}

// Hides `image` and drops its picture, so the browser can release the
// decoded image.
export function clearStill(image: HTMLImageElement): void {
  image.hidden = true;
  image.removeAttribute("src");
}

// Stops `video` and drops its source, so the browser releases the stream and
// its decoder.
export function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.hidden = true;
  video.style.opacity = "";
  video.loop = false;
  video.removeAttribute("src");
  video.load();
}
