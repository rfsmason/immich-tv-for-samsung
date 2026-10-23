import { describe, expect, it, vi } from "vitest";
import { TestDocument } from "../../test/document";
import {
  createCollectionSortControl,
  readCollectionSort,
  reverseSortOrder
} from "./collection-sort";

function press(keyCode: number) {
  const event = new Event("keydown", { cancelable: true });
  return { event: event as KeyboardEvent, keyCode };
}

describe("collection sort control", () => {
  function setup() {
    const documentRef = new TestDocument();
    const button = documentRef.getElementById("collection-sort-order");
    const options = { onDown: vi.fn(), onLeft: vi.fn(), onToggle: vi.fn() };
    const control = createCollectionSortControl({
      ...options,
      button: button as unknown as HTMLButtonElement
    });

    return { button, control, documentRef, options };
  }

  it("labels the order and hides for a fixed-order collection", () => {
    const { button, control } = setup();

    control.render("oldest-first");
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe("Oldest first");
    expect(button.getAttribute("aria-label")).toBe("Sort order: oldest first");

    control.render(null);
    expect(button.hidden).toBe(true);
    expect(control.focus()).toBe(false);
  });

  it("handles OK, Down and Left only while focused, leaving Back to the screen", () => {
    const { control, options } = setup();
    control.render("newest-first");

    const unfocused = press(13);
    expect(control.handleKeydown(unfocused.event, unfocused.keyCode)).toBe(false);

    expect(control.focus()).toBe(true);
    for (const keyCode of [13, 40, 37, 38, 39]) {
      const { event } = press(keyCode);
      expect(control.handleKeydown(event, keyCode)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(options.onToggle).toHaveBeenCalledTimes(1);
    expect(options.onDown).toHaveBeenCalledTimes(1);
    expect(options.onLeft).toHaveBeenCalledTimes(1);

    const back = press(10009);
    expect(control.handleKeydown(back.event, back.keyCode)).toBe(false);
  });
});

describe("collection sort kinds", () => {
  it("reads which collections can be reversed", () => {
    expect(
      readCollectionSort({ id: "photos", kind: "photos", order: "oldest-first", title: "" })
    ).toEqual({ kind: "photos", order: "oldest-first" });
    expect(
      readCollectionSort({
        feed: { kind: "person", order: "newest-first", personId: "p" },
        id: "person-p",
        kind: "feed",
        parent: "people",
        title: ""
      })
    ).toEqual({ kind: "people", order: "newest-first" });
    expect(
      readCollectionSort({
        feed: { kind: "recently-viewed" },
        id: "recent",
        kind: "feed",
        parent: "home",
        title: ""
      })
    ).toBeNull();
    expect(readCollectionSort(null)).toBeNull();
    expect(reverseSortOrder("newest-first")).toBe("oldest-first");
    expect(reverseSortOrder("oldest-first")).toBe("newest-first");
  });
});
