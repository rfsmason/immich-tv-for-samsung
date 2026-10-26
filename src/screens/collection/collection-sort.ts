import type { SortOrder } from "../../domain/album";
import type { SavedSortOrderKind } from "../../domain/app-settings";
import { remoteKeys } from "../../platform/tizen/keys";
import type { AppSettingsStore } from "../../storage/app-settings-store";
import { focusWithoutPageScroll } from "../grid-presentation";
import type { CollectionSource } from "./collection-model";

// The collection header's sort order button (ADR 0017): a down arrow for
// newest first, an up arrow for oldest first, with the order in its label.
// OK reverses the order and reloads from the start with focus kept on the
// button. Up from the grid's first row reaches it and Down returns to the
// first item. Memories, Recently Viewed and Recently Added keep their own
// order and show no button.

export type SortableCollectionKind = SavedSortOrderKind | "album";

export type CollectionSort = { kind: SortableCollectionKind; order: SortOrder };

export type CollectionSortControl = {
  focus(): boolean;
  handleKeydown(event: KeyboardEvent, keyCode: number): boolean;
  isFocused(): boolean;
  // Shows the button for a sortable collection's order, or hides it.
  render(order: SortOrder | null): void;
};

type CollectionSortControlOptions = {
  button: HTMLButtonElement;
  onDown(): void;
  onLeft(): void;
  onToggle(): void;
};

export function createCollectionSortControl(
  options: CollectionSortControlOptions
): CollectionSortControl {
  const { button } = options;

  function isFocused(): boolean {
    return button.ownerDocument.activeElement === button;
  }

  return {
    focus() {
      if (button.hidden) {
        return false;
      }

      focusWithoutPageScroll(button);
      return true;
    },
    handleKeydown(event, keyCode) {
      if (!isFocused()) {
        return false;
      }

      if (keyCode === remoteKeys.enter) {
        event.preventDefault();
        options.onToggle();
        return true;
      }

      if (keyCode === remoteKeys.down) {
        event.preventDefault();
        options.onDown();
        return true;
      }

      if (keyCode === remoteKeys.left) {
        event.preventDefault();
        options.onLeft();
        return true;
      }

      if (keyCode === remoteKeys.up || keyCode === remoteKeys.right) {
        event.preventDefault();
        return true;
      }

      return false;
    },
    isFocused,
    render(order) {
      const oldestFirst = order === "oldest-first";

      button.hidden = order === null;
      button.setAttribute("data-sort-order", oldestFirst ? "oldest-first" : "newest-first");
      button.setAttribute(
        "aria-label",
        `Sort order: ${oldestFirst ? "oldest first" : "newest first"}`
      );
      button.title = oldestFirst ? "Oldest first" : "Newest first";
    }
  };
}

// The sortable kind and current order of a collection, or null when its
// order is fixed.
export function readCollectionSort(source: CollectionSource | null): CollectionSort | null {
  if (source?.kind === "photos" || source?.kind === "album") {
    return { kind: source.kind, order: source.order };
  }

  if (source?.kind !== "feed") {
    return null;
  }

  const feed = source.feed;

  if (feed.kind === "favorites" || feed.kind === "videos" || feed.kind === "search") {
    return { kind: feed.kind, order: feed.order };
  }

  return feed.kind === "person" ? { kind: "people", order: feed.order } : null;
}

export function reverseSortOrder(order: SortOrder): SortOrder {
  return order === "newest-first" ? "oldest-first" : "newest-first";
}

export function readSavedSortOrder(
  settingsStore: Pick<AppSettingsStore, "load">,
  kind: SavedSortOrderKind
): SortOrder {
  return settingsStore.load().sortOrders[kind];
}

export function saveSortOrder(
  settingsStore: AppSettingsStore,
  kind: SavedSortOrderKind,
  order: SortOrder
): void {
  const settings = settingsStore.load();

  settingsStore.save({ ...settings, sortOrders: { ...settings.sortOrders, [kind]: order } });
}
