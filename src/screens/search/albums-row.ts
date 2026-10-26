import { removeSearchAlbum, type SearchAlbum } from "../../domain/search";
import { formatSearchAlbumsSummary, searchAlbumsRule } from "../../presentation/search-labels";
import {
  createRemovableChip,
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's Albums row: + Add albums opens the album picker, each chosen album
// is a chip (OK removes it), and "+N more" reopens the picker.

// Chips shown before "+N more"; the rest stay selected.
export const visibleAlbumChipCount = 4;
const chipPrefix = "album:";

type AlbumsRowOptions = {
  onAddAlbums(albums: SearchAlbum[]): void;
};

export function createAlbumsRow(context: SearchPanelContext, options: AlbumsRowOptions): SearchRow {
  const { documentRef } = context;
  const albums = () => context.criteria().albums;

  function removeChip(id: string): void {
    const index = albums().findIndex((album) => album.id === id);

    context.setCriteria(removeSearchAlbum(context.criteria(), id));

    const remaining = albums();
    const nextIndex = Math.min(index, remaining.length - 1);
    const next = remaining[nextIndex];

    context.update(next && nextIndex < visibleAlbumChipCount ? chipPrefix + next.id : "add-albums");
  }

  return {
    activate(key) {
      if (key === "add-albums" || key === "more-albums") {
        options.onAddAlbums(albums().slice());
        return true;
      }

      if (key.indexOf(chipPrefix) === 0) {
        removeChip(key.slice(chipPrefix.length));
        return true;
      }

      return false;
    },
    lines() {
      const chosen = albums();
      const line = ["add-albums"].concat(
        chosen.slice(0, visibleAlbumChipCount).map((album) => chipPrefix + album.id)
      );

      if (chosen.length > visibleAlbumChipCount) {
        line.push("more-albums");
      }

      return [line];
    },
    render() {
      const { controls, row } = createSearchRow(documentRef, "Albums");
      const chosen = albums();

      controls.appendChild(
        createSearchControl(documentRef, "add-albums", "+ Add albums", "search-add")
      );

      chosen.slice(0, visibleAlbumChipCount).forEach((album) => {
        controls.appendChild(createRemovableChip(documentRef, chipPrefix + album.id, album.name));
      });

      if (chosen.length > visibleAlbumChipCount) {
        const more = createSearchControl(
          documentRef,
          "more-albums",
          `+${chosen.length - visibleAlbumChipCount} more`,
          "search-more"
        );
        more.setAttribute("aria-label", `${chosen.length} albums selected. Change albums`);
        controls.appendChild(more);
      }

      if (chosen.length > 1) {
        const rule = documentRef.createElement("p");
        rule.className = "search-rule";
        rule.textContent = searchAlbumsRule;
        row.appendChild(rule);
      }

      return [row];
    },
    summary: () => formatSearchAlbumsSummary(albums())
  };
}
