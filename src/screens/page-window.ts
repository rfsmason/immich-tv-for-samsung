// A bounded window of numbered pages for a card browser reached from Home
// (Memories, People; ADR 0011, ADR 0013). Pages load in either direction near
// remote focus. Beyond `retainedPageCount`, the page furthest from the focused
// item is evicted, and its number becomes the next one to load that way, so
// moving back reloads it. The window knows nothing about requests or the DOM.

export type PageWindowDirection = "after" | "before";

export type PageWindow<T> = {
  // Records a loaded page: moves past it in that direction, adds the items not
  // already shown, then evicts pages away from `focusedId`. Returns how many
  // items were added; a page of only known items adds none.
  accept(direction: PageWindowDirection, page: number, items: T[], focusedId?: string): number;
  indexOf(id: string | undefined): number;
  items(): T[];
  // The page to load next in a direction. Before the first page this is 0.
  nextPage(direction: PageWindowDirection): number;
  reset(): void;
};

type RetainedPage<T> = {
  items: T[];
  page: number;
};

export function createPageWindow<T>(options: {
  idOf(item: T): string;
  retainedPageCount: number;
}): PageWindow<T> {
  let pages: Array<RetainedPage<T>> = [];
  let afterPage = 1;
  let beforePage = 0;

  function items(): T[] {
    return pages.reduce<T[]>((all, page) => all.concat(page.items), []);
  }

  function indexOf(id: string | undefined): number {
    return id === undefined ? -1 : items().findIndex((item) => options.idOf(item) === id);
  }

  function trim(focusedId: string | undefined): void {
    while (pages.length > options.retainedPageCount) {
      const position = pages.findIndex((page) =>
        page.items.some((item) => options.idOf(item) === focusedId)
      );

      if (position < pages.length / 2) {
        const removed = pages.pop()!;
        afterPage = Math.min(afterPage, removed.page);
      } else {
        const removed = pages.shift()!;
        beforePage = Math.max(beforePage, removed.page);
      }
    }
  }

  return {
    accept(direction, page, loaded, focusedId) {
      const known = new Set(items().map(options.idOf));
      const added = loaded.filter((item) => !known.has(options.idOf(item)));

      if (direction === "before") {
        beforePage = page - 1;
      } else {
        afterPage = page + 1;
      }

      if (added.length === 0) {
        return 0;
      }

      if (direction === "before") {
        pages.unshift({ items: added, page });
      } else {
        pages.push({ items: added, page });
      }

      trim(focusedId || options.idOf(added[0]!));

      if (pages[0]?.page === page) {
        beforePage = page - 1;
      }

      return added.length;
    },
    indexOf,
    items,
    nextPage(direction) {
      return direction === "before" ? beforePage : afterPage;
    },
    reset() {
      pages = [];
      afterPage = 1;
      beforePage = 0;
    }
  };
}
