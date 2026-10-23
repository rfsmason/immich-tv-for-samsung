import { remoteKeys } from "../../platform/tizen/keys";
import { focusWithoutPageScroll } from "../grid-presentation";
import {
  type HomeRailId,
  type HomeScreenElements,
  type HomeScreenOptions,
  type HomeScreenState,
  clamp,
  getAssetRailState,
  getRailElement,
  getRailState,
  homeRailOrder,
  isHomeRailId,
  readAssetRailTitle,
  readRailItemCount
} from "./home-model";
import { renderHome } from "./home-rails";

// Remote focus within and between Home rails, and tile activation.

export function isHomeRailNavigationActive(
  documentRef: Document,
  elements: HomeScreenElements
): boolean {
  const activeElement = documentRef.activeElement;

  return Boolean(
    activeElement &&
    homeRailOrder.some((railId) => getRailElement(elements, railId).contains(activeElement))
  );
}

export function moveHomeFocus(
  keyCode: number,
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  const rail = getRailState(state, state.activeRail);

  if (keyCode === remoteKeys.left && rail.focusedIndex === 0) {
    options.onReturnToShell();
    return;
  }

  if (keyCode === remoteKeys.left || keyCode === remoteKeys.right) {
    const offset = keyCode === remoteKeys.left ? -1 : 1;
    rail.focusedIndex = clamp(
      rail.focusedIndex + offset,
      0,
      Math.max(0, readRailItemCount(state, state.activeRail) - 1)
    );
    focusActiveRailItem(elements, options, state);
    return;
  }

  if (keyCode === remoteKeys.up) {
    const previousRail = findUsableRail(state, state.activeRail, -1);

    if (previousRail) {
      moveToRail(previousRail, elements, options, state);
    }

    return;
  }

  if (keyCode === remoteKeys.down) {
    const nextRail = findUsableRail(state, state.activeRail, 1);

    if (nextRail) {
      moveToRail(nextRail, elements, options, state);
    }
  }
}

export function moveToRail(
  railId: HomeRailId,
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  const targetRail = getRailState(state, railId);

  // Each rail keeps its own selection, so returning to a rail lands on the
  // item last selected there.
  state.activeRail = railId;
  targetRail.focusedIndex = clamp(
    targetRail.focusedIndex,
    0,
    Math.max(0, readRailItemCount(state, railId) - 1)
  );
  focusActiveRailItem(elements, options, state);
}

export function findUsableRail(
  state: HomeScreenState,
  currentRail: HomeRailId,
  direction: -1 | 1
): HomeRailId | null {
  const currentIndex = homeRailOrder.indexOf(currentRail);

  for (
    let index = currentIndex + direction;
    index >= 0 && index < homeRailOrder.length;
    index += direction
  ) {
    const railId = homeRailOrder[index];
    const rail = railId ? getRailState(state, railId) : null;

    if (rail && readRailItemCount(state, railId!) > 0) {
      return railId || null;
    }
  }

  return null;
}

export function focusActiveRailItem(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  // Every rail is off: focus the way to Settings.
  if (state.enabledRails.length === 0) {
    renderHome(elements, options, state, state.loadGeneration);
    focusWithoutPageScroll(elements.openSettingsButton);
    return;
  }

  if (readRailItemCount(state, state.activeRail) === 0) {
    state.activeRail =
      homeRailOrder.find((candidate) => readRailItemCount(state, candidate) > 0) ||
      state.activeRail;
  }

  const rail = getRailState(state, state.activeRail);
  const railElement = getRailElement(elements, state.activeRail);

  // Nothing to focus on Home yet: focus stays with the left rail.
  if (readRailItemCount(state, state.activeRail) === 0) {
    options.onReturnToShell();
    return;
  }

  rail.focusedIndex = clamp(rail.focusedIndex, 0, readRailItemCount(state, state.activeRail) - 1);
  renderHome(elements, options, state, state.loadGeneration);

  const tile = railElement.querySelector<HTMLElement>(`[data-home-index="${rail.focusedIndex}"]`);

  // renderHome has already moved the rails so this tile sits at the fixed
  // focus position.
  if (tile) {
    focusWithoutPageScroll(tile);
  }
}

// Mouse activation in the desktop preview; the remote uses activateFocusedTile.
export function handleTileActivation(
  event: Event,
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState
): boolean {
  const target = event.target as HTMLElement | null;
  const tile = target?.closest<HTMLElement>("[data-home-rail][data-home-index]");

  if (!tile || !homeRailOrder.some((railId) => getRailElement(elements, railId).contains(tile))) {
    return false;
  }

  event.preventDefault();
  tile.focus();

  return openRailTile(tile, options, state);
}

export function activateFocusedTile(
  documentRef: Document,
  options: HomeScreenOptions,
  state: HomeScreenState
): boolean {
  const activeElement = documentRef.activeElement as HTMLElement | null;

  return activeElement ? openRailTile(activeElement, options, state) : false;
}

// Opens a rail tile: an item, or the rail's See more tile at index items.length.
function openRailTile(
  tile: HTMLElement,
  options: HomeScreenOptions,
  state: HomeScreenState
): boolean {
  const railId = tile.getAttribute("data-home-rail");
  const index = Number(tile.getAttribute("data-home-index"));

  if (!isHomeRailId(railId) || !Number.isFinite(index)) {
    return false;
  }

  const rail = getRailState(state, railId);

  if (rail.more && index === rail.items.length) {
    state.activeRail = railId;
    rail.focusedIndex = index;
    openSeeMore(railId, options, state);
    return true;
  }

  if (
    railId === "recently-added" ||
    railId === "favorites" ||
    railId === "videos" ||
    railId === "recently-viewed"
  ) {
    const assetRail = getAssetRailState(state, railId);

    if (!assetRail.items[index]) {
      return false;
    }

    state.activeRail = railId;
    assetRail.focusedIndex = index;
    options.onOpenAssetCollection({
      assets: assetRail.items.slice(),
      entry: "item",
      index,
      rail: railId,
      title: readAssetRailTitle(railId)
    });
    return true;
  }

  if (railId === "albums") {
    const album = state.albums.items[index];

    if (!album) {
      return false;
    }

    state.activeRail = "albums";
    state.albums.focusedIndex = index;
    options.onOpenAlbum(album);
    return true;
  }

  if (railId === "people") {
    const person = state.people.items[index];

    if (!person) {
      return false;
    }

    state.activeRail = "people";
    state.people.focusedIndex = index;
    options.onOpenPerson(person);
    return true;
  }

  const memory = state.memories.items[index];

  if (!memory) {
    return false;
  }

  state.activeRail = "memories";
  state.memories.focusedIndex = index;
  options.onOpenMemory(memory);
  return true;
}

// See more opens a library view (Favourites, Videos, Recently Added) on its
// first item, continues Recently Viewed at the rail's last item, and opens
// the full Albums, People or Memories screens.
function openSeeMore(railId: HomeRailId, options: HomeScreenOptions, state: HomeScreenState): void {
  if (
    railId === "recently-added" ||
    railId === "favorites" ||
    railId === "videos" ||
    railId === "recently-viewed"
  ) {
    const items = getAssetRailState(state, railId).items;

    options.onOpenAssetCollection({
      assets: items.slice(),
      entry: "see-more",
      index: railId === "recently-viewed" ? Math.max(0, items.length - 1) : 0,
      rail: railId,
      title: readAssetRailTitle(railId)
    });
    return;
  }

  if (railId === "albums") {
    options.onBrowseAlbums();
    return;
  }

  if (railId === "people") {
    options.onBrowsePeople();
    return;
  }

  if (railId === "memories") {
    options.onBrowseMemories();
  }
}
