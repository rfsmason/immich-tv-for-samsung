import type { SearchMediaType } from "../../domain/search";
import { searchMediaTypeLabels } from "../../presentation/search-labels";
import { createSearchControl } from "./search-row";

// Search's Asset type field: a Settings-style field whose list drops down
// beneath it. Arriving on the field by remote opens the list on the current
// type; Up and Down move through it, OK chooses and closes it, and Back
// closes it unchanged. Left, Right, or moving past either end also close it
// unchanged, so the list never traps focus. Closed, OK opens it again and
// any arrow moves on.

export const assetTypeKey = "asset-type";
const optionPrefix = "asset-type:";

export const assetTypes: SearchMediaType[] = ["all", "photos", "live-photos", "videos"];

export type AssetTypeKeyResult =
  // Focus this key; the list stays open.
  | { focus: string }
  // The list closed, choosing `chosen` when set.
  | { closed: true; chosen?: SearchMediaType };

export type AssetTypeField = {
  // The option keys while open, top to bottom.
  optionKeys(): string[];
  close(): void;
  handleKey(key: "down" | "enter" | "left" | "right" | "up" | "back"): AssetTypeKeyResult;
  isOpen(): boolean;
  // Opens on the current type; returns the key to focus.
  open(current: SearchMediaType): string;
  render(documentRef: Document, current: SearchMediaType): HTMLElement;
};

export function createAssetTypeField(): AssetTypeField {
  let highlighted: number | null = null;

  const optionKey = (index: number) => optionPrefix + assetTypes[index]!;

  return {
    optionKeys: () => (highlighted === null ? [] : assetTypes.map((_, index) => optionKey(index))),
    close() {
      highlighted = null;
    },
    handleKey(key) {
      const index = highlighted ?? 0;

      if (key === "enter") {
        highlighted = null;
        return { chosen: assetTypes[index], closed: true };
      }

      if (key === "up" && index > 0) {
        highlighted = index - 1;
        return { focus: optionKey(highlighted) };
      }

      if (key === "down" && index < assetTypes.length - 1) {
        highlighted = index + 1;
        return { focus: optionKey(highlighted) };
      }

      highlighted = null;
      return { closed: true };
    },
    isOpen: () => highlighted !== null,
    open(current) {
      highlighted = Math.max(0, assetTypes.indexOf(current));
      return optionKey(highlighted);
    },
    render(documentRef, current) {
      const field = documentRef.createElement("div");
      const name = documentRef.createElement("span");
      const control = createSearchControl(documentRef, assetTypeKey, "", "search-select");
      const value = documentRef.createElement("span");
      const arrow = documentRef.createElement("span");
      const label = searchMediaTypeLabels[current];

      field.className = "search-field search-select-field";
      name.className = "field-label";
      name.textContent = "Asset type";
      value.className = "search-select-value";
      value.textContent = label;
      arrow.className = "search-select-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "▾";
      control.appendChild(value);
      control.appendChild(arrow);
      control.setAttribute("aria-haspopup", "listbox");
      control.setAttribute("aria-expanded", highlighted === null ? "false" : "true");
      control.setAttribute("aria-label", `Asset type: ${label}`);
      field.appendChild(name);
      field.appendChild(control);

      if (highlighted !== null) {
        const list = documentRef.createElement("div");

        list.className = "search-dropdown";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", "Asset type");

        assetTypes.forEach((mediaType, index) => {
          const chosen = mediaType === current;
          const option = createSearchControl(
            documentRef,
            optionKey(index),
            "",
            "search-dropdown-option"
          );
          const check = documentRef.createElement("span");
          const text = documentRef.createElement("span");

          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", chosen ? "true" : "false");
          check.className = "search-dropdown-check";
          check.setAttribute("aria-hidden", "true");
          check.textContent = chosen ? "✓" : "";
          text.textContent = searchMediaTypeLabels[mediaType];
          option.appendChild(check);
          option.appendChild(text);

          if (chosen) {
            option.setAttribute("data-selected", "true");
          }

          list.appendChild(option);
        });

        field.appendChild(list);
      }

      return field;
    }
  };
}
