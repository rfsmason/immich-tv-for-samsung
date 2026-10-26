import type { AlbumService } from "../../app/album-service";
import type { Person } from "../../domain/home";
import { toUserMessage } from "../../errors/app-error";
import { getNextGridIndex, type GridDirection } from "../../navigation/grid-navigation";
import { getKeyCode, readArrowDirection, remoteKeys } from "../../platform/tizen/keys";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  gridRenderRows,
  gridThumbnailRows
} from "../album-assets-window";
import {
  createAssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails
} from "../asset-thumbnail-window";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration
} from "../async-generation";
import {
  createGridSpacer,
  focusWithoutPageScroll,
  readRowScrollTop,
  scrollIntoContainer
} from "../grid-presentation";
import { createPageWindow, type PageWindowDirection } from "../page-window";
import { createPersonCard, personCardLabel, setPersonCardFace } from "./person-card";

// A paged, windowed grid of people in Immich's order (ADR 0013, ADR 0014):
// the People browser and the Search people picker. Pages load near remote
// focus; at most four pages of people and the faces around focus are
// retained. Each screen decides what OK on a person does and may add
// controls above the grid.

const columnCount = 6;
export const peoplePageSize = 30;
export const retainedPeoplePageCount = 4;
// Room above and below a focused card for its face's 6% growth and 12 px
// focus ring.
const focusedFaceMargin = 24;

export type PeopleGridElements = {
  grid: HTMLElement;
  retry: HTMLElement;
  root: HTMLElement;
  status: HTMLElement;
};

export type PeopleGridOptions = {
  // Adds a screen's own state to a card, such as the picker's selection. It
  // runs again on cards that stay on screen, so it must also remove that state
  // when it no longer applies.
  decorateCard?(card: HTMLButtonElement, person: Person): void;
  documentRef?: Document;
  elements: PeopleGridElements;
  emptyMessage: string;
  onActivate(person: Person): void;
  onBack(): void;
  onReturnToShell?(): void;
  // OK on one of `topControls`.
  onTopControl?(control: HTMLElement): void;
  service: Pick<AlbumService, "loadPeoplePage" | "loadPersonThumbnailUrl" | "revokeThumbnailUrl">;
  // Controls above the grid, after Retry, that Up from the first row reaches.
  topControls?(): HTMLElement[];
};

type PeopleGridState = {
  destroyed: boolean;
  failedDirection: PageWindowDirection | null;
  focusedIndex: number;
  // The last page Immich reported having no successor, once known.
  lastPage: number | null;
  loadGeneration: number;
  loading: boolean;
  preferredColumn: number;
};

export type PeopleGridController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  // Re-renders the visible cards, keeping focus, after a screen's state changes.
  refreshCards(): void;
  // Forgets every loaded person, for example after connection changes.
  reset(): void;
  show(): void;
};

export function mountPeopleGrid(options: PeopleGridOptions): PeopleGridController {
  const documentRef = options.documentRef || document;
  const elements = options.elements;
  const pages = createPageWindow<Person>({
    idOf: (person) => person.id,
    retainedPageCount: retainedPeoplePageCount
  });
  const faces = createAssetThumbnailState<Person>();
  const state: PeopleGridState = {
    destroyed: false,
    failedDirection: null,
    focusedIndex: 0,
    lastPage: null,
    loadGeneration: 0,
    loading: false,
    preferredColumn: 0
  };

  function ownsFocus(): boolean {
    return elements.root.contains(documentRef.activeElement);
  }

  function setStatus(message: string, statusState: string): void {
    elements.status.textContent = message;
    elements.status.setAttribute("data-state", statusState);
  }

  function focusCard(): void {
    const card = elements.grid.querySelector<HTMLElement>(
      `[data-person-index="${state.focusedIndex}"]`
    );

    if (!card) {
      (elements.retry.hidden ? elements.status : elements.retry).focus();
      return;
    }

    // Chromium 63 ignores preventScroll and scrolls a focused card into view
    // itself, centring it; undo that so rows only ever move by whole rows.
    const scrollTop = elements.grid.scrollTop;

    focusWithoutPageScroll(card);
    elements.grid.scrollTop = scrollTop;
    scrollToCardRow(card);
  }

  // Scrolls by whole rows, keeping room for the focused face, which grows
  // and gains a ring beyond its card. Without layout (tests) it falls back to
  // scrolling just enough.
  function scrollToCardRow(card: HTMLElement): void {
    const style = documentRef.defaultView?.getComputedStyle(elements.grid);
    const gap = style ? parseFloat(style.getPropertyValue("--person-grid-gap")) : NaN;
    const paddingTop = style ? parseFloat(style.paddingTop) : NaN;
    const rowHeight = card.offsetHeight;

    if (!(rowHeight > 0) || !(gap >= 0) || !(paddingTop >= 0)) {
      scrollIntoContainer(elements.grid, card, 12);
      return;
    }

    const scrollTop = readRowScrollTop({
      margin: focusedFaceMargin,
      paddingTop,
      row: Math.floor(state.focusedIndex / columnCount),
      rowHeight,
      rowPitch: rowHeight + gap,
      scrollTop: elements.grid.scrollTop,
      viewHeight: elements.grid.clientHeight
    });

    if (scrollTop !== null) {
      elements.grid.scrollTop = scrollTop;
    }
  }

  const topSpacer = createGridSpacer(documentRef, "person-grid-spacer", "--person-spacer-rows", 0);
  const bottomSpacer = createGridSpacer(
    documentRef,
    "person-grid-spacer",
    "--person-spacer-rows",
    0
  );

  function spacerFor(spacer: HTMLElement, rowCount: number): HTMLElement[] {
    spacer.style.setProperty("--person-spacer-rows", String(rowCount));

    return rowCount ? [spacer] : [];
  }

  // Cards that stay in the rendered window keep their element, and with it
  // their decoded face: only rows entering or leaving the window change.
  // Rebuilding every card on each remote press re-created all the faces and
  // replayed the focus animation, which flickered on the TV.
  function render(): void {
    const people = pages.items();

    const rendered = calculateRenderedAssetWindow({
      columnCount,
      focusedIndex: state.focusedIndex,
      itemCount: people.length,
      rowsAfter: gridRenderRows.after,
      rowsBefore: gridRenderRows.before
    });

    const existing: Record<string, HTMLButtonElement> = {};
    elements.grid.querySelectorAll<HTMLButtonElement>(".person-card").forEach((card) => {
      existing[card.getAttribute("data-person-id") || ""] = card;
    });

    const nodes: HTMLElement[] = spacerFor(topSpacer, rendered.topSpacerRows);

    for (let index = rendered.startIndex; index < rendered.endIndex; index += 1) {
      const person = people[index]!;
      let card = existing[person.id];

      if (card) {
        card.setAttribute("data-person-index", String(index));
        card.setAttribute("aria-label", personCardLabel(person));
      } else {
        card = createPersonCard(documentRef, person, index);
      }

      options.decorateCard?.(card, person);
      const url = faces.thumbnailUrls[person.id];

      if (url) {
        setPersonCardFace(card, url);
      }

      nodes.push(card);
    }

    nodes.push(...spacerFor(bottomSpacer, rendered.bottomSpacerRows));
    placeChildren(nodes);
    loadFacesNearFocus(people);
  }

  // Puts exactly `nodes` in the grid, in order, without moving nodes that are
  // already in place (moving a node would reload its image and drop focus).
  function placeChildren(nodes: HTMLElement[]): void {
    const wanted = new Set<Node>(nodes);

    Array.prototype.slice.call(elements.grid.childNodes).forEach((child: Node) => {
      if (!wanted.has(child)) {
        elements.grid.removeChild(child);
      }
    });

    nodes.forEach((node, position) => {
      const current = elements.grid.childNodes[position] || null;

      if (current !== node) {
        elements.grid.insertBefore(node, current);
      }
    });
  }

  function showFace(person: Person, url: string): void {
    const card = elements.grid.querySelector<HTMLElement>(`[data-person-id="${person.id}"]`);

    if (card) {
      setPersonCardFace(card, url);
    }
  }

  function loadFacesNearFocus(people: Person[]): void {
    reconcileAssetThumbnails<Person>({
      assets: people,
      focusedIndex: state.focusedIndex,
      generation: state.loadGeneration,
      isCurrentGeneration: (generation) =>
        !state.destroyed && isCurrentGeneration(state, generation),
      isHidden: () => elements.root.hidden,
      loadThumbnailUrl: options.service.loadPersonThumbnailUrl,
      onThumbnailLoaded: (person, _index, url) => showFace(person, url),
      revokeThumbnailUrl: options.service.revokeThumbnailUrl,
      state: faces,
      window: calculateThumbnailRetentionWindow({
        columnCount,
        focusedIndex: state.focusedIndex,
        itemCount: people.length,
        rowsAfter: gridThumbnailRows.after,
        rowsBefore: gridThumbnailRows.before
      })
    });
  }

  function clearFaces(): void {
    elements.grid.querySelectorAll("img").forEach((image) => image.removeAttribute("src"));
    revokeAllAssetThumbnails(faces, options.service.revokeThumbnailUrl);
  }

  function canLoad(direction: PageWindowDirection): boolean {
    const page = pages.nextPage(direction);

    return direction === "before" ? page >= 1 : state.lastPage === null || page <= state.lastPage;
  }

  async function load(direction: PageWindowDirection): Promise<void> {
    if (state.loading || state.destroyed || elements.root.hidden || !canLoad(direction)) {
      return;
    }

    const generation = state.loadGeneration;
    const isStale = () =>
      state.destroyed || elements.root.hidden || !isCurrentGeneration(state, generation);
    const page = pages.nextPage(direction);

    state.loading = true;
    state.failedDirection = null;

    setStatus(pages.items().length ? "Loading more people..." : "Loading people...", "pending");

    // Retrying hides Retry; keep focus visible on the status while loading.
    if (documentRef.activeElement === elements.retry) {
      elements.status.focus();
    }

    elements.retry.hidden = true;

    try {
      const result = await options.service.loadPeoplePage(page, peoplePageSize);

      if (isStale()) {
        return;
      }

      const focusedId = pages.items()[state.focusedIndex]?.id;

      if (!result.hasMore) {
        state.lastPage = page;
      } else if (state.lastPage !== null && state.lastPage <= page) {
        // The list grew since its end was seen.
        state.lastPage = null;
      }

      pages.accept(direction, page, result.people.slice(0, peoplePageSize), focusedId);
      state.focusedIndex = Math.max(0, pages.indexOf(focusedId));

      const shouldFocus = ownsFocus();

      render();
      setStatus(pages.items().length ? "" : options.emptyMessage, "idle");

      if (shouldFocus) {
        focusCard();
      }
    } catch (error) {
      if (isStale()) {
        return;
      }

      state.failedDirection = direction;
      setStatus(`${toUserMessage(error)} Select Retry or press Back.`, "error");
      elements.retry.hidden = false;

      if (ownsFocus()) {
        elements.retry.focus();
      }
    } finally {
      if (isCurrentGeneration(state, generation)) {
        state.loading = false;
      }
    }
  }

  function loadNearFocus(direction: GridDirection): void {
    if (state.failedDirection) {
      return;
    }

    const count = pages.items().length;

    // Load before the rendered rows run out, so every row on screen exists.
    if (
      (direction === "down" || direction === "right") &&
      state.focusedIndex >= count - columnCount * (gridRenderRows.after + 1)
    ) {
      void load("after");
    } else if (
      direction === "up" &&
      state.focusedIndex < columnCount * (gridRenderRows.before + 1)
    ) {
      void load("before");
    }
  }

  function open(target: HTMLElement): void {
    const value = target.getAttribute("data-person-index");
    const person = value === null ? undefined : pages.items()[Number(value)];

    if (!person) {
      return;
    }

    state.focusedIndex = Number(value);
    state.preferredColumn = state.focusedIndex % columnCount;
    options.onActivate(person);
  }

  // Retry (when shown) and the screen's own controls above the grid, in page
  // order so Left and Right match what is on screen.
  function topControls(): HTMLElement[] {
    const extra = options.topControls ? options.topControls() : [];

    return (elements.retry.hidden ? [] : [elements.retry])
      .concat(extra.filter((control) => !control.hidden))
      .sort((left, right) =>
        left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
  }

  function retryLoad(): void {
    if (state.failedDirection) {
      void load(state.failedDirection);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (elements.root.hidden) {
      return;
    }

    const keyCode = getKeyCode(event);

    if (keyCode === remoteKeys.back) {
      event.preventDefault();
      options.onBack();
      return;
    }

    const activeElement = documentRef.activeElement as HTMLElement | null;

    if (!activeElement || !elements.root.contains(activeElement)) {
      return;
    }

    const top = topControls();
    const topIndex = top.indexOf(activeElement);

    if (keyCode === remoteKeys.enter) {
      event.preventDefault();

      if (activeElement === elements.retry) {
        retryLoad();
      } else if (topIndex >= 0) {
        options.onTopControl?.(activeElement);
      } else {
        open(activeElement);
      }

      return;
    }

    const direction = readArrowDirection(keyCode);

    if (!direction) {
      return;
    }

    event.preventDefault();

    if (topIndex >= 0 || activeElement === elements.status) {
      if (direction === "down" && pages.items().length) {
        focusCard();
      } else if (direction === "up" && activeElement === elements.status) {
        // Only a screen's own controls; the People browser's status stays put.
        top.filter((control) => control !== elements.retry)[0]?.focus();
      } else if ((direction === "left" || direction === "right") && topIndex >= 0) {
        top[topIndex + (direction === "left" ? -1 : 1)]?.focus();
      }

      return;
    }

    if (direction === "up" && state.focusedIndex < columnCount && top[0]) {
      top[0].focus();
      return;
    }

    if (direction === "left" && state.focusedIndex % columnCount === 0 && options.onReturnToShell) {
      options.onReturnToShell();
      return;
    }

    const result = getNextGridIndex({
      columnCount,
      currentIndex: state.focusedIndex,
      direction,
      itemCount: pages.items().length,
      preferredColumn: state.preferredColumn
    });

    state.focusedIndex = result.index;
    state.preferredColumn = result.preferredColumn;
    render();
    focusCard();
    loadNearFocus(direction);
  }

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    handleKeydown(event);

    // Opening a person makes the collection screen's listener active at once;
    // keep this press from also activating its focused control.
    if (event.defaultPrevented) {
      event.stopImmediatePropagation();
    }
  };
  const handleClick = (event: MouseEvent) => {
    if (elements.root.hidden) {
      return;
    }

    const target = (event.target as HTMLElement).closest<HTMLElement>("button");

    if (!target || !elements.root.contains(target)) {
      return;
    }

    if (target === elements.retry) {
      retryLoad();
    } else if (topControls().indexOf(target) >= 0) {
      options.onTopControl?.(target);
    } else {
      open(target);
    }
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  elements.root.addEventListener("click", handleClick);

  function hide(): void {
    invalidateAsyncGeneration(state);
    state.loading = false;
    elements.root.hidden = true;
    clearFaces();
    elements.grid.textContent = "";
  }

  function reset(): void {
    hide();
    pages.reset();
    state.focusedIndex = 0;
    state.preferredColumn = 0;
    state.lastPage = null;
    state.failedDirection = null;
  }

  return {
    destroy() {
      reset();
      state.destroyed = true;
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      elements.root.removeEventListener("click", handleClick);
    },
    focusContent() {
      focusCard();
    },
    hide,
    refreshCards() {
      const hadFocus = elements.grid.contains(documentRef.activeElement);

      render();

      if (hadFocus) {
        focusCard();
      }
    },
    reset,
    show() {
      elements.root.hidden = false;
      beginAsyncGeneration(state);

      if (pages.items().length) {
        state.focusedIndex = Math.min(state.focusedIndex, pages.items().length - 1);
        render();
        focusCard();

        if (!state.failedDirection) {
          setStatus("", "idle");
        }

        return;
      }

      void load(state.failedDirection || "after");
      // Loading writes the status first: an empty status line is hidden and
      // could not take focus.
      elements.status.focus();
    }
  };
}
