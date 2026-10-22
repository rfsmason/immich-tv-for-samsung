// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeoplePage, Person } from "../../domain/home";
import { AppError } from "../../errors/app-error";
import { remoteKeys } from "../../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../../test/app-markup";
import { mountPeoplePicker, type PeoplePickerController } from "./people-picker-screen";

const person = (index: number): Person => ({
  id: `person-${index}`,
  isFavorite: false,
  name: `Person ${index}`
});
const choice = (index: number) => ({ id: `person-${index}`, name: `Person ${index}` });
let controller: PeoplePickerController | null = null;

function setup(total = 200, withFaces = false) {
  const people = Array.from({ length: total }, (_, index) => person(index));
  const loadPeoplePage = vi.fn(async (page: number, size: number): Promise<PeoplePage> => ({
    hasMore: page * size < total,
    page,
    people: people.slice((page - 1) * size, page * size),
    total
  }));
  const onDone = vi.fn();

  controller = mountPeoplePicker({
    onDone,
    service: {
      loadPeoplePage,
      loadPersonThumbnailUrl: vi.fn(async ({ id }: Pick<Person, "id">) =>
        withFaces ? `blob:${id}` : null
      ),
      revokeThumbnailUrl: vi.fn()
    }
  });

  const status = () => byId("search-people-status");
  const settled = () => vi.waitFor(() => expect(status().getAttribute("data-state")).toBe("idle"));
  const focusedId = () => document.activeElement?.getAttribute("data-person-id") ?? null;
  const card = (id: string) =>
    byId("search-people-grid").querySelector<HTMLElement>(`[data-person-id="${id}"]`);
  const selectedIds = () =>
    Array.from(byId("search-people-grid").querySelectorAll("[data-selected]")).map((item) =>
      item.getAttribute("data-person-id")
    );
  const press = async (keyCode: number, times = 1) => {
    for (let step = 0; step < times; step += 1) {
      pressKey(keyCode);
      for (let tick = 0; tick < 20 && status().getAttribute("data-state") !== "idle"; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await settled();
  };

  return { card, focusedId, loadPeoplePage, onDone, press, selectedIds, settled, status };
}

beforeEach(() => {
  loadAppMarkup();
});

afterEach(() => {
  controller?.destroy();
  controller = null;
});

describe("Search people picker", () => {
  it("keeps cards and their faces when focus moves, so faces don't flicker", async () => {
    const f = setup(200, true);
    controller!.open([]);
    await f.settled();
    await vi.waitFor(() => expect(f.card("person-1")?.querySelector("img")).toBeTruthy());
    const card = f.card("person-1")!;
    const face = card.querySelector("img");

    await f.press(remoteKeys.right);
    await f.press(remoteKeys.down, 2);
    await f.press(remoteKeys.up);

    expect(f.focusedId()).toBe("person-7");
    expect(f.card("person-1")).toBe(card);
    expect(card.querySelector("img")).toBe(face);
    expect(card.getAttribute("data-person-index")).toBe("1");
  });

  it("marks and unmarks a person on the same card, without rebuilding it", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();
    await f.press(remoteKeys.right);
    const card = f.card("person-1")!;

    pressKey(remoteKeys.enter);
    expect(f.card("person-1")).toBe(card);
    expect(card.getAttribute("data-selected")).toBe("true");
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.querySelectorAll(".person-check")).toHaveLength(1);
    expect(card.getAttribute("aria-label")).toBe("Person 1, selected");

    pressKey(remoteKeys.enter);
    expect(f.card("person-1")).toBe(card);
    expect(card.hasAttribute("data-selected")).toBe(false);
    expect(card.getAttribute("aria-pressed")).toBe("false");
    expect(card.querySelector(".person-check")).toBeNull();
    expect(card.getAttribute("aria-label")).toBe("Person 1");
    expect(document.activeElement).toBe(card);
  });

  it("shows that Back finishes the picker, like Done", () => {
    setup();
    const hints = byId("search-people-screen").querySelector(".key-hints")?.textContent || "";
    expect(hints.replace(/\s+/g, " ").trim()).toBe("OK Select Back Done");
  });

  it("only focuses its status line once it has text, so focus is never lost while loading", async () => {
    // An empty status line is hidden by the stylesheet and cannot take focus.
    const f = setup();
    const textWhenFocused: string[] = [];
    f.status().addEventListener("focus", () => textWhenFocused.push(f.status().textContent || ""));

    controller!.open([]);

    expect(document.activeElement).toBe(f.status());
    expect(textWhenFocused).toEqual(["Loading people..."]);
    await f.settled();
    expect(f.focusedId()).toBe("person-0");
  });

  it("shows people already chosen as selected and focuses the first person", async () => {
    const f = setup();
    controller!.open([choice(2)]);
    await f.settled();

    expect(f.focusedId()).toBe("person-0");
    expect(f.selectedIds()).toEqual(["person-2"]);
    expect(f.card("person-2")?.getAttribute("aria-pressed")).toBe("true");
    expect(f.card("person-2")?.getAttribute("aria-label")).toBe("Person 2, selected");
    expect(f.card("person-2")?.querySelector(".person-check")).not.toBeNull();
    expect(byId("search-people-done").textContent).toBe("Done (1 selected)");
  });

  it("toggles a person with OK and keeps focus on that card", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();

    await f.press(remoteKeys.right);
    pressKey(remoteKeys.enter);
    expect(f.selectedIds()).toEqual(["person-1"]);
    expect(f.focusedId()).toBe("person-1");
    expect(byId("search-people-done").textContent).toBe("Done (1 selected)");

    pressKey(remoteKeys.enter);
    expect(f.selectedIds()).toEqual([]);
    expect(byId("search-people-done").textContent).toBe("Done");
  });

  it("reaches Done from the top row, and Done returns the selection in choice order", async () => {
    const f = setup();
    controller!.open([choice(3)]);
    await f.settled();

    pressKey(remoteKeys.enter);
    await f.press(remoteKeys.up);
    expect(document.activeElement).toBe(byId("search-people-done"));
    pressKey(remoteKeys.down);
    expect(f.focusedId()).toBe("person-0");
    await f.press(remoteKeys.up);
    pressKey(remoteKeys.enter);

    expect(f.onDone).toHaveBeenCalledWith([choice(3), { id: "person-0", name: "Person 0" }]);
  });

  it("keeps the selection when leaving with Back", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();
    pressKey(remoteKeys.enter);

    pressKey(remoteKeys.back);

    expect(f.onDone).toHaveBeenCalledWith([{ id: "person-0", name: "Person 0" }]);
  });

  it("caps the selection at ten and says why", async () => {
    const f = setup();
    controller!.open(Array.from({ length: 10 }, (_, index) => choice(index + 20)));
    await f.settled();

    pressKey(remoteKeys.enter);

    expect(f.selectedIds()).not.toContain("person-0");
    expect(byId("search-people-message").hidden).toBe(false);
    expect(byId("search-people-message").textContent).toBe(
      "You can choose up to 10 people. Remove someone to add Person 0."
    );
    expect(byId("search-people-done").textContent).toBe("Done (10 selected)");
  });

  it("keeps selections through paging, eviction and reload", async () => {
    const f = setup(300);
    controller!.open([]);
    await f.settled();
    pressKey(remoteKeys.enter);

    await f.press(remoteKeys.down, 40);
    expect(f.focusedId()).toBe("person-240");
    pressKey(remoteKeys.enter);
    expect(f.card("person-0")).toBeNull();

    await f.press(remoteKeys.up, 40);
    expect(f.focusedId()).toBe("person-0");
    expect(f.selectedIds()).toEqual(["person-0"]);
    expect(f.loadPeoplePage.mock.calls.map(([page]) => page).slice(-1)).toEqual([1]);
    pressKey(remoteKeys.back);
    expect(f.onDone).toHaveBeenCalledWith([
      { id: "person-0", name: "Person 0" },
      { id: "person-240", name: "Person 240" }
    ]);
  }, 20000);

  it("explains an empty list and still lets Back and Done return", async () => {
    const f = setup(0);
    controller!.open([]);
    await f.settled();

    expect(f.status().textContent).toContain("No people yet.");
    expect(document.activeElement).toBe(f.status());
    pressKey(remoteKeys.up);
    expect(document.activeElement).toBe(byId("search-people-done"));
    pressKey(remoteKeys.enter);
    expect(f.onDone).toHaveBeenCalledWith([]);
  });

  it("offers Retry after a failure, next to Done", async () => {
    const f = setup();
    f.loadPeoplePage.mockRejectedValueOnce(new AppError("network", "Offline"));
    controller!.open([choice(1)]);
    await vi.waitFor(() => expect(f.status().getAttribute("data-state")).toBe("error"));

    expect(document.activeElement).toBe(byId("search-people-retry"));
    pressKey(remoteKeys.left);
    expect(document.activeElement).toBe(byId("search-people-done"));
    pressKey(remoteKeys.right);
    pressKey(remoteKeys.enter);
    await f.settled();
    expect(f.focusedId()).toBe("person-0");
    expect(f.selectedIds()).toEqual(["person-1"]);
  });

  it("forgets loaded people and the selection on reset", async () => {
    const f = setup();
    controller!.open([choice(1)]);
    await f.settled();

    controller!.reset();
    controller!.open([]);
    await f.settled();

    expect(f.loadPeoplePage).toHaveBeenCalledTimes(2);
    expect(f.selectedIds()).toEqual([]);
  });
});
