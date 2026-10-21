import type { AlbumAsset } from "../domain/album";
import { formatDurationLabel } from "../presentation/duration-labels";

// Shared presentation helpers for remote-navigated grids and rails:
// virtualisation spacers, focus scrolling and tile media badges. Every grid's
// tiles are Home's size, set once in the stylesheet (--asset-tile-size).

// An empty, hidden block standing in for `rowCount` virtualised rows.
export function createGridSpacer(
  documentRef: Document,
  className: string,
  rowsProperty: string,
  rowCount: number
): HTMLElement {
  const spacer = documentRef.createElement("div");
  spacer.className = className;
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.setProperty(rowsProperty, String(rowCount));

  return spacer;
}

// `preventScroll` needs Chrome 64; Chromium 63 ignores it, so callers always
// correct the scroll position themselves afterwards.
export function focusWithoutPageScroll(element: HTMLElement): void {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

// Scrolls `container` just enough to show `element` with `padding` pixels of
// room for the focus ring.
export function scrollIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  padding: number,
  axis: "horizontal" | "vertical" = "vertical"
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  if (axis === "horizontal") {
    const visibleLeft = containerRect.left + padding;
    const visibleRight = containerRect.right - padding;

    if (elementRect.left < visibleLeft) {
      container.scrollLeft -= visibleLeft - elementRect.left;
      return;
    }

    if (elementRect.right > visibleRight) {
      container.scrollLeft += elementRect.right - visibleRight;
    }

    return;
  }

  const visibleTop = containerRect.top + padding;
  const visibleBottom = containerRect.bottom - padding;

  if (elementRect.top < visibleTop) {
    container.scrollTop -= visibleTop - elementRect.top;
    return;
  }

  if (elementRect.bottom > visibleBottom) {
    container.scrollTop += elementRect.bottom - visibleBottom;
  }
}

export function createVideoBadge(documentRef: Document, asset: AlbumAsset): HTMLElement {
  const badge = documentRef.createElement("span");
  badge.className = "asset-media-badge asset-video-badge";
  badge.setAttribute("aria-hidden", "true");

  const icon = documentRef.createElement("span");
  icon.className = "asset-video-icon";
  badge.appendChild(icon);

  if (asset.durationMs !== null) {
    const duration = documentRef.createElement("span");
    duration.className = "asset-video-duration";
    duration.textContent = formatDurationLabel(asset.durationMs);
    badge.appendChild(duration);
  }

  return badge;
}

export function createLivePhotoBadge(documentRef: Document): HTMLElement {
  const badge = documentRef.createElement("span");
  badge.className = "asset-media-badge asset-live-photo-badge";
  badge.setAttribute("aria-hidden", "true");

  const icon = documentRef.createElement("span");
  icon.className = "asset-live-photo-icon";
  badge.appendChild(icon);

  return badge;
}
