import { setSearchPlace, type SearchPlace } from "../../domain/search";
import { formatSearchPlace } from "../../presentation/search-labels";
import {
  createRemovableChip,
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's Place row: + Choose a place opens the place picker; a chosen
// place is a chip, and OK on it removes it.

type PlaceRowOptions = {
  onChoosePlace(current: SearchPlace | null): void;
};

export function createPlaceRow(context: SearchPanelContext, options: PlaceRowOptions): SearchRow {
  const { documentRef } = context;

  return {
    activate(key) {
      if (key === "choose-place") {
        options.onChoosePlace(context.criteria().place);
        return true;
      }

      if (key === "place-chip") {
        context.setCriteria(setSearchPlace(context.criteria(), null));
        context.update("choose-place");
        return true;
      }

      return false;
    },
    lines: () => [[context.criteria().place ? "place-chip" : "choose-place"]],
    render() {
      const { controls, row } = createSearchRow(documentRef, "Place");
      const { place } = context.criteria();

      controls.appendChild(
        place
          ? createRemovableChip(
              documentRef,
              "place-chip",
              formatSearchPlace(place),
              "search-place-chip"
            )
          : createSearchControl(documentRef, "choose-place", "+ Choose a place", "search-add")
      );

      return [row];
    },
    summary() {
      const { place } = context.criteria();

      return place ? formatSearchPlace(place) : null;
    }
  };
}
