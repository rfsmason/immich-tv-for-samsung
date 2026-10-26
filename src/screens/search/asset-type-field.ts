import type { SearchMediaType } from "../../domain/search";
import { searchMediaTypeLabels } from "../../presentation/search-labels";
import {
  createDropdownState,
  renderDropdownControl,
  renderDropdownList,
  type DropdownKey
} from "../dropdown";
import { createSearchControl } from "./search-row";

// Search's Asset type field: the app's drop-down (dropdown.ts) beside the
// dates. The panel re-renders on every change, so this keeps only the
// drop-down state and builds the field afresh each time.

export const assetTypeKey = "asset-type";
const optionPrefix = "asset-type:";

export const assetTypes: SearchMediaType[] = ["all", "photos", "live-photos", "videos"];

export type AssetTypeKeyResult = { focus: string } | { chosen?: SearchMediaType; closed: true };

export type AssetTypeField = {
  close(): void;
  handleKey(key: DropdownKey): AssetTypeKeyResult;
  isOpen(): boolean;
  // Opens on the current type; returns the key to focus.
  open(current: SearchMediaType): string;
  // The option keys while open, top to bottom.
  optionKeys(): string[];
  render(documentRef: Document, current: SearchMediaType): HTMLElement;
};

export function createAssetTypeField(): AssetTypeField {
  const dropdown = createDropdownState(assetTypes.length);
  const optionKey = (index: number) => optionPrefix + assetTypes[index]!;

  return {
    close: dropdown.close,
    handleKey(key) {
      const result = dropdown.handleKey(key);

      if ("focus" in result) {
        return { focus: optionKey(result.focus) };
      }

      return {
        chosen: result.chosen === undefined ? undefined : assetTypes[result.chosen],
        closed: true
      };
    },
    isOpen: dropdown.isOpen,
    open(current) {
      return optionKey(dropdown.open(assetTypes.indexOf(current)));
    },
    optionKeys: () => (dropdown.isOpen() ? assetTypes.map((_, index) => optionKey(index)) : []),
    render(documentRef, current) {
      const field = documentRef.createElement("div");
      const name = documentRef.createElement("span");
      const control = createSearchControl(documentRef, assetTypeKey, "", "dropdown-control");

      field.className = "search-field dropdown-field";
      name.className = "field-label";
      name.textContent = "Asset type";
      renderDropdownControl(
        control,
        "Asset type",
        searchMediaTypeLabels[current],
        dropdown.isOpen()
      );
      field.appendChild(name);
      field.appendChild(control);

      if (dropdown.isOpen()) {
        field.appendChild(
          renderDropdownList(
            documentRef,
            "Asset type",
            assetTypes.map((mediaType) => searchMediaTypeLabels[mediaType]),
            assetTypes.indexOf(current),
            (index) => createSearchControl(documentRef, optionKey(index), "", "")
          )
        );
      }

      return field;
    }
  };
}
