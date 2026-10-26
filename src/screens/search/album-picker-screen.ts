import type { AlbumService } from "../../app/album-service";
import type { Album } from "../../domain/album";
import { maxSearchAlbums, type SearchAlbum } from "../../domain/search";
import { createAlbumTile, albumTileLabel, setAlbumTileCover } from "../albums/album-tile";
import { mountCardGrid } from "../card-grid";
import { createPickerSelection } from "./picker-selection";

// Search's album picker (ADR 0018): every album you own or that is shared
// with you, as Albums lists them, in the shared card grid. OK toggles an
// album; Done and Back both return the selection, like the people picker.
// GET /albums returns the whole list at once; the grid still pages through
// it so only the tiles and covers near focus exist.

export const albumPickerPageSize = 30;

type AlbumPickerOptions = {
  documentRef?: Document;
  onDone(albums: SearchAlbum[]): void;
  onReturnToShell?(): void;
  service: Pick<AlbumService, "loadAlbums" | "loadThumbnailUrl" | "revokeThumbnailUrl">;
};

export type AlbumPickerController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  // Opens with the albums already chosen shown as selected.
  open(selected: SearchAlbum[]): void;
  reset(): void;
};

export function mountAlbumPicker(options: AlbumPickerOptions): AlbumPickerController {
  const documentRef = options.documentRef || document;
  const done = requireElement(documentRef, "search-albums-done");
  const selection = createPickerSelection<SearchAlbum>({
    capMessage: (name) =>
      `You can choose up to ${maxSearchAlbums} albums. Remove one to add ${name}.`,
    documentRef,
    done,
    max: maxSearchAlbums,
    message: requireElement(documentRef, "search-albums-message")
  });
  // The session's album list, loaded with the first page.
  let albums: Album[] | null = null;

  async function loadPage(page: number, size: number) {
    if (!albums) {
      albums = await options.service.loadAlbums();
    }

    const start = (page - 1) * size;

    return { hasMore: start + size < albums.length, items: albums.slice(start, start + size) };
  }

  function toggle(album: Album): void {
    if (selection.toggle({ id: album.id, name: album.name }, album.name)) {
      grid.refreshCards();
    }
  }

  function finish(): void {
    options.onDone(selection.selected());
  }

  const grid = mountCardGrid<Album>({
    cards: {
      attributes: { id: "data-album-id", index: "data-album-index" },
      create: createAlbumTile,
      label: albumTileLabel,
      setImage: setAlbumTileCover
    },
    columnCount: 6,
    decorateCard: (card, album) => selection.decorateCard(card, album.id),
    documentRef,
    elements: {
      grid: requireElement(documentRef, "search-albums-grid"),
      retry: requireElement(documentRef, "search-albums-retry"),
      root: requireElement(documentRef, "search-albums-screen"),
      status: requireElement(documentRef, "search-albums-status")
    },
    emptyMessage:
      "No albums yet. Albums you create or that are shared with you appear here. Press Back to return to Search.",
    // Room for the tile's focus ring.
    focusMargin: 16,
    loadImageUrl: options.service.loadThumbnailUrl,
    loadingMessages: { first: "Loading albums...", more: "Loading more albums..." },
    loadPage,
    onActivate: toggle,
    onBack: finish,
    onReturnToShell: options.onReturnToShell,
    onTopControl(control) {
      if (control === done) {
        finish();
      }
    },
    pageSize: albumPickerPageSize,
    retainedPageCount: 4,
    revokeImageUrl: options.service.revokeThumbnailUrl,
    styles: {
      gapProperty: "--album-grid-gap",
      spacerClass: "album-pick-spacer",
      spacerRowsProperty: "--album-spacer-rows"
    },
    topControls: () => [done]
  });

  return {
    destroy() {
      grid.destroy();
    },
    focusContent() {
      grid.focusContent();
    },
    hide() {
      grid.hide();
    },
    open(selected) {
      selection.open(selected);
      grid.show();
    },
    reset() {
      grid.reset();
      albums = null;
      selection.open([]);
    }
  };
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}
