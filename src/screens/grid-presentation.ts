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

export type RowScrollInput = {
  // Rows from the top of the grid's content, not the window.
  row: number;
  rowHeight: number;
  // Row height plus the gap between rows.
  rowPitch: number;
  // Room kept around the focused row for its enlarged face and focus ring.
  margin: number;
  scrollTop: number;
  viewHeight: number;
  // The grid's top padding, above its first row.
  paddingTop: number;
};

// The scroll position that shows `row`, moving by whole rows only, or null
// when it is already in view. Rows then always come to rest in the same
// places: scrolling just enough to show a row moved the grid by uneven
// amounts (18 px one step, a full row the next), which read as the grid
// jumping.
export function readRowScrollTop(input: RowScrollInput): number | null {
  const rowTop = input.paddingTop + input.row * input.rowPitch;
  const rowBottom = rowTop + input.rowHeight;
  let target: number | null = null;

  if (rowTop - input.margin < input.scrollTop) {
    target = input.row * input.rowPitch;
  } else if (rowBottom + input.margin > input.scrollTop + input.viewHeight) {
    target =
      Math.ceil((rowBottom + input.margin - input.viewHeight) / input.rowPitch) * input.rowPitch;
  }

  return target === null || Math.max(0, target) === input.scrollTop ? null : Math.max(0, target);
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
