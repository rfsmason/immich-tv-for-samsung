import { setSearchMediaType, type SearchMediaType } from "../../domain/search";
import { searchMediaTypeLabels } from "../../presentation/search-labels";
import {
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's Type row: All, Photos, Live Photos or Videos. Left and Right move
// between them and OK selects one; the selection has a check mark as well as
// its colour. All clears the criterion.

const mediaTypes: SearchMediaType[] = ["all", "photos", "live-photos", "videos"];
const keyPrefix = "type:";

export function createTypeRow(context: SearchPanelContext): SearchRow {
  const { documentRef } = context;

  return {
    activate(key) {
      if (key.indexOf(keyPrefix) !== 0) {
        return false;
      }

      const mediaType = key.slice(keyPrefix.length) as SearchMediaType;

      if (mediaTypes.indexOf(mediaType) >= 0) {
        context.setCriteria(setSearchMediaType(context.criteria(), mediaType));
        context.update(key);
      }

      return true;
    },
    lines: () => [mediaTypes.map((mediaType) => keyPrefix + mediaType)],
    render() {
      const { controls, row } = createSearchRow(documentRef, "Type");
      const chosen = context.criteria().mediaType;

      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Type");

      mediaTypes.forEach((mediaType) => {
        const label = searchMediaTypeLabels[mediaType];
        const option = createSearchControl(
          documentRef,
          keyPrefix + mediaType,
          label,
          "search-option"
        );

        option.setAttribute("aria-pressed", mediaType === chosen ? "true" : "false");

        if (mediaType === chosen) {
          const check = documentRef.createElement("span");

          check.className = "search-option-check";
          check.setAttribute("aria-hidden", "true");
          check.textContent = "✓";
          option.setAttribute("data-selected", "true");
          option.insertBefore(check, option.firstChild);
        }

        controls.appendChild(option);
      });

      return [row];
    },
    summary() {
      const { mediaType } = context.criteria();

      return mediaType === "all" ? null : searchMediaTypeLabels[mediaType];
    }
  };
}
