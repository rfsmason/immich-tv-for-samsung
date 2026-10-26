import { toUserMessage } from "../errors/app-error";
import { getNextGridIndex, type GridDirection } from "../navigation/grid-navigation";
import { getKeyCode, readArrowDirection, remoteKeys } from "../platform/tizen/keys";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  gridRenderRows,
  gridThumbnailRows
} from "./album-assets-window";
import {
  createAssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails
} from "./asset-thumbnail-window";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration
} from "./async-generation";
import {
  createGridSpacer,
  focusWithoutPageScroll,
  readRowScrollTop,
  scrollIntoContainer
} from "./grid-presentation";
import { createPageWindow, type PageWindowDirection } from "./page-window";

// A paged, windowed grid of cards (ADR 0013, ADR 0014, ADR 0018): the People
// browser and Search's people and album pickers. Pages load near remote
// focus; a bounded number of pages and the images around focus are
// retained. Each screen supplies its cards, decides what OK on a card does
// and may add controls above the grid.

export type CardGridElements = {
  grid: HTMLElement;
  retry: HTMLElement;
  root: HTMLElement;
  status: HTMLElement;
};

export type CardGridPage<T> = {
  hasMore: boolean;
  items: T[];
};

// How one kind of item appears as a card.
export type CardGridCards<T> = {
  // The attributes carrying a card's item id and grid index, which screens
  // and tests use to find cards.
  attributes: { id: string; index: string };
  create(documentRef: Document, item: T): HTMLButtonElement;
  // The card's spoken label before any screen adds its own state to it.
  label(item: T): string;
  setImage(card: HTMLElement, url: string): void;
};

export type CardGridOptions<T extends { id: string }> = {
  cards: CardGridCards<T>;
  columnCount: number;
  // Adds a screen's own state to a card, such as the picker's selection. It
  // runs again on cards that stay on screen, so it must also remove that state
  // when it no longer applies.
  decorateCard?(card: HTMLButtonElement, item: T): void;
  documentRef?: Document;
  elements: CardGridElements;
  emptyMessage: string;
  // Room above and below a focused card for its focus growth and ring.
  focusMargin: number;
  // Status while the first page, and then further pages, load.
  loadingMessages: { first: string; more: string };
  loadImageUrl(item: T): Promise<string | null>;
  loadPage(page: number, size: number): Promise<CardGridPage<T>>;
  onActivate(item: T): void;
  onBack(): void;
  onReturnToShell?(): void;
  // OK on one of `topControls`.
  onTopControl?(control: HTMLElement): void;
  pageSize: number;
  retainedPageCount: number;
  revokeImageUrl(url: string): void;
  // The grid's custom properties and spacer class in styles/main.css: its
  // gap, and a spacer's row count.
  styles: { gapProperty: string; spacerClass: string; spacerRowsProperty: string };
  // Controls above the grid, after Retry, that Up from the first row reaches.
  topControls?(): HTMLElement[];
};

type CardGridState = {
  destroyed: boolean;
  failedDirection: PageWindowDirection | null;
  focusedIndex: number;
  // The last page Immich reported having no successor, once known.
  lastPage: number | null;
  loadGeneration: number;
  loading: boolean;
  preferredColumn: number;
};

export type CardGridController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  // Re-renders the visible cards, keeping focus, after a screen's state changes.
  refreshCards(): void;
  // Forgets every loaded item, for example after connection changes.
  reset(): void;
  show(): void;
};

export function mountCardGrid<T extends { id: string }>(
  options: CardGridOptions<T>
): CardGridController {
  const documentRef = options.documentRef || document;
  const { cards, columnCount, elements, styles } = options;
  const pages = createPageWindow<T>({
    idOf: (item) => item.id,
    retainedPageCount: options.retainedPageCount
  });
  const images = createAssetThumbnailState<T>();
  const state: CardGridState = {
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
      `[${cards.attributes.index}="${state.focusedIndex}"]`
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

  // Scrolls by whole rows, keeping room for the focused card, which may grow
  // and gain a ring beyond its bounds. Without layout (tests) it falls back to
  // scrolling just enough.
  function scrollToCardRow(card: HTMLElement): void {
    const style = documentRef.defaultView?.getComputedStyle(elements.grid);
    const gap = style ? parseFloat(style.getPropertyValue(styles.gapProperty)) : NaN;
    const paddingTop = style ? parseFloat(style.paddingTop) : NaN;
    const rowHeight = card.offsetHeight;

    if (!(rowHeight > 0) || !(gap >= 0) || !(paddingTop >= 0)) {
      scrollIntoContainer(elements.grid, card, 12);
      return;
    }

    const scrollTop = readRowScrollTop({
      margin: options.focusMargin,
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

  const topSpacer = createGridSpacer(documentRef, styles.spacerClass, styles.spacerRowsProperty, 0);
  const bottomSpacer = createGridSpacer(
    documentRef,
    styles.spacerClass,
    styles.spacerRowsProperty,
    0
  );

  function spacerFor(spacer: HTMLElement, rowCount: number): HTMLElement[] {
    spacer.style.setProperty(styles.spacerRowsProperty, String(rowCount));

    return rowCount ? [spacer] : [];
  }

  // Cards that stay in the rendered window keep their element, and with it
  // their decoded image: only rows entering or leaving the window change.
  // Rebuilding every card on each remote press re-created all the images and
  // replayed the focus animation, which flickered on the TV.
  function render(): void {
    const items = pages.items();

    const rendered = calculateRenderedAssetWindow({
      columnCount,
      focusedIndex: state.focusedIndex,
      itemCount: items.length,
      rowsAfter: gridRenderRows.after,
      rowsBefore: gridRenderRows.before
    });

    const existing: Record<string, HTMLButtonElement> = {};
    elements.grid
      .querySelectorAll<HTMLButtonElement>(`[${cards.attributes.id}]`)
      .forEach((card) => {
        existing[card.getAttribute(cards.attributes.id) || ""] = card;
      });

    const nodes: HTMLElement[] = spacerFor(topSpacer, rendered.topSpacerRows);

    for (let index = rendered.startIndex; index < rendered.endIndex; index += 1) {
      const item = items[index]!;
      let card = existing[item.id];

      if (!card) {
        card = cards.create(documentRef, item);
        card.setAttribute(cards.attributes.id, item.id);
      }

      card.setAttribute(cards.attributes.index, String(index));
      card.setAttribute("aria-label", cards.label(item));
      options.decorateCard?.(card, item);
      const url = images.thumbnailUrls[item.id];

      if (url) {
        cards.setImage(card, url);
      }

      nodes.push(card);
    }

    nodes.push(...spacerFor(bottomSpacer, rendered.bottomSpacerRows));
    placeChildren(nodes);
    loadImagesNearFocus(items);
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

  function showImage(item: T, url: string): void {
    const card = elements.grid.querySelector<HTMLElement>(`[${cards.attributes.id}="${item.id}"]`);

    if (card) {
      cards.setImage(card, url);
    }
  }

  function loadImagesNearFocus(items: T[]): void {
    reconcileAssetThumbnails<T>({
      assets: items,
      focusedIndex: state.focusedIndex,
      generation: state.loadGeneration,
      isCurrentGeneration: (generation) =>
        !state.destroyed && isCurrentGeneration(state, generation),
      isHidden: () => elements.root.hidden,
      loadThumbnailUrl: options.loadImageUrl,
      onThumbnailLoaded: (item, _index, url) => showImage(item, url),
      revokeThumbnailUrl: options.revokeImageUrl,
      state: images,
      window: calculateThumbnailRetentionWindow({
        columnCount,
        focusedIndex: state.focusedIndex,
        itemCount: items.length,
        rowsAfter: gridThumbnailRows.after,
        rowsBefore: gridThumbnailRows.before
      })
    });
  }

  function clearImages(): void {
    elements.grid.querySelectorAll("img").forEach((image) => image.removeAttribute("src"));
    revokeAllAssetThumbnails(images, options.revokeImageUrl);
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

    setStatus(
      pages.items().length ? options.loadingMessages.more : options.loadingMessages.first,
      "pending"
    );

    // Retrying hides Retry; keep focus visible on the status while loading.
    if (documentRef.activeElement === elements.retry) {
      elements.status.focus();
    }

    elements.retry.hidden = true;

    try {
      const result = await options.loadPage(page, options.pageSize);

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

      pages.accept(direction, page, result.items.slice(0, options.pageSize), focusedId);
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
    const value = target.getAttribute(cards.attributes.index);
    const item = value === null ? undefined : pages.items()[Number(value)];

    if (!item) {
      return;
    }

    state.focusedIndex = Number(value);
    state.preferredColumn = state.focusedIndex % columnCount;
    options.onActivate(item);
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
        // Only a screen's own controls; a grid without them keeps its status.
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

    // Opening an item makes another screen's listener active at once; keep
    // this press from also activating its focused control.
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
    clearImages();
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
