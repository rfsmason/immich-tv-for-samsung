import { describe, expect, it } from "vitest";
import { createPageWindow } from "./page-window";

type Item = { id: string };

const pageOf = (page: number, size = 3): Item[] =>
  Array.from({ length: size }, (_, index) => ({ id: `${page}-${index}` }));

function window(retainedPageCount = 2) {
  return createPageWindow<Item>({ idOf: (item) => item.id, retainedPageCount });
}

describe("page window", () => {
  it("starts at page 1 with nothing before it", () => {
    const pages = window();

    expect(pages.nextPage("after")).toBe(1);
    expect(pages.nextPage("before")).toBe(0);
    expect(pages.items()).toEqual([]);
  });

  it("appends pages, skips items already shown and moves past empty pages", () => {
    const pages = window(3);

    expect(pages.accept("after", 1, pageOf(1))).toBe(3);
    expect(pages.accept("after", 2, [{ id: "1-2" }, { id: "2-0" }])).toBe(1);
    expect(pages.accept("after", 3, [])).toBe(0);
    expect(pages.items().map((item) => item.id)).toEqual(["1-0", "1-1", "1-2", "2-0"]);
    expect(pages.nextPage("after")).toBe(4);
  });

  it("evicts the page furthest from focus and reloads it when moving back", () => {
    const pages = window(3);
    const ids = () => pages.items().map((item) => item.id[0]);

    pages.accept("after", 1, pageOf(1));
    pages.accept("after", 2, pageOf(2), "1-2");
    pages.accept("after", 3, pageOf(3), "2-2");
    pages.accept("after", 4, pageOf(4), "3-2");
    expect(ids()).toEqual(["2", "2", "2", "3", "3", "3", "4", "4", "4"]);
    expect(pages.nextPage("before")).toBe(1);
    expect(pages.indexOf("3-2")).toBe(5);
    expect(pages.indexOf("1-0")).toBe(-1);

    // Back near the top: page 1 returns and the last page goes.
    pages.accept("before", 1, pageOf(1), "2-0");
    expect(ids()).toEqual(["1", "1", "1", "2", "2", "2", "3", "3", "3"]);
    expect(pages.nextPage("before")).toBe(0);
    expect(pages.nextPage("after")).toBe(4);
  });

  it("forgets every page on reset", () => {
    const pages = window();

    pages.accept("after", 1, pageOf(1));
    pages.reset();

    expect(pages.items()).toEqual([]);
    expect(pages.nextPage("after")).toBe(1);
    expect(pages.indexOf(undefined)).toBe(-1);
  });
});
