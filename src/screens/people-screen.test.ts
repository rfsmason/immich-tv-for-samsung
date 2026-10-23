// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeoplePage, Person } from "../domain/home";
import { AppError } from "../errors/app-error";
import { remoteKeys } from "../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../test/app-markup";
import {
  mountPeopleScreen,
  peoplePageSize,
  retainedPeoplePageCount,
  type PeopleScreenController
} from "./people-screen";

const person = (index: number): Person => ({
  id: `person-${index}`,
  isFavorite: index === 0,
  name: index % 7 === 3 ? null : `Person ${index}`
});

// These tests simulate 60-80 remote presses through paging and eviction.
const longScrollTimeoutMs = 20000;

let controller: PeopleScreenController | null = null;

function setup(total = 200) {
  const people = Array.from({ length: total }, (_, index) => person(index));
  const loadPeoplePage = vi.fn(async (page: number, size: number): Promise<PeoplePage> => ({
    hasMore: page * size < total,
    page,
    people: people.slice((page - 1) * size, page * size),
    total
  }));
  const loadPersonThumbnailUrl = vi.fn(async (item: Person) => `blob:${item.id}`);
  const revokeThumbnailUrl = vi.fn();
  const onBack = vi.fn();
  const onOpenPerson = vi.fn();
  const onReturnToShell = vi.fn();

  controller = mountPeopleScreen({
    onBack,
    onOpenPerson,
    onReturnToShell,
    service: { loadPeoplePage, loadPersonThumbnailUrl, revokeThumbnailUrl }
  });

  const status = () => byId("people-status");
  const settled = () => vi.waitFor(() => expect(status().getAttribute("data-state")).toBe("idle"));
  const focusedId = () => document.activeElement?.getAttribute("data-person-id") ?? null;
  const cards = () => byId("people-grid").querySelectorAll(".person-card");
  const pagesRequested = () => loadPeoplePage.mock.calls.map(([page]) => page);
  // Settles each press with zero-delay ticks rather than waitFor's 50 ms
  // polling, so long scrolls stay fast under coverage.
  const press = async (keyCode: number, times = 1) => {
    for (let step = 0; step < times; step += 1) {
      pressKey(keyCode);
      for (let tick = 0; tick < 20 && status().getAttribute("data-state") !== "idle"; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await settled();
    }
  };

  return {
    cards,
    focusedId,
    loadPeoplePage,
    loadPersonThumbnailUrl,
    onBack,
    onOpenPerson,
    onReturnToShell,
    pagesRequested,
    press,
    revokeThumbnailUrl,
    settled,
    status
  };
}

beforeEach(() => {
  loadAppMarkup();
});

afterEach(() => {
  controller?.destroy();
  controller = null;
});

describe("People browser", () => {
  it("loads the first page, focuses the first person and shows names and faces", async () => {
    const f = setup();
    controller!.show();
    expect(f.status().textContent).toBe("Loading people...");
    await f.settled();

    expect(f.loadPeoplePage).toHaveBeenCalledWith(1, peoplePageSize);
    expect(f.focusedId()).toBe("person-0");
    const first = f.cards()[0]!;
    expect(first.querySelector(".person-name")?.textContent).toBe("Person 0");
    expect(first.getAttribute("aria-label")).toBe("Person 0, favourite");
    expect(first.querySelector(".person-favourite")).not.toBeNull();
    expect(f.cards()[3]!.querySelector(".person-name")?.textContent).toBe("Unnamed person");
    await vi.waitFor(() =>
      expect(first.querySelector<HTMLImageElement>(".person-face-image")?.src).toBe("blob:person-0")
    );
  });

  it("moves deterministically in six columns and hands Left at a row start to the shell", async () => {
    const f = setup();
    controller!.show();
    await f.settled();

    await f.press(remoteKeys.right, 2);
    expect(f.focusedId()).toBe("person-2");
    await f.press(remoteKeys.down);
    expect(f.focusedId()).toBe("person-8");
    await f.press(remoteKeys.up);
    expect(f.focusedId()).toBe("person-2");
    await f.press(remoteKeys.left, 2);
    expect(f.focusedId()).toBe("person-0");
    pressKey(remoteKeys.left);
    expect(f.onReturnToShell).toHaveBeenCalledTimes(1);
  });

  it("opens the focused person with OK and goes Back with Back", async () => {
    const f = setup();
    controller!.show();
    await f.settled();

    await f.press(remoteKeys.right);
    const event = pressKey(remoteKeys.enter);
    expect(event.defaultPrevented).toBe(true);
    expect(f.onOpenPerson).toHaveBeenCalledWith(person(1));

    pressKey(remoteKeys.back);
    expect(f.onBack).toHaveBeenCalledTimes(1);
  });

  it(
    "loads near focus, evicts distant pages and reloads them on the way back",
    async () => {
      const f = setup(300);
      controller!.show();
      await f.settled();

      // 30 people per page, six per row: 40 rows reach person 240 (page 9).
      await f.press(remoteKeys.down, 40);
      expect(f.focusedId()).toBe("person-240");
      expect(f.pagesRequested()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(f.cards().length).toBeLessThanOrEqual(6 * 9);
      expect(f.revokeThumbnailUrl).toHaveBeenCalled();

      await f.press(remoteKeys.up, 40);
      expect(f.focusedId()).toBe("person-0");
      const requested = f.pagesRequested();
      // Coming back up reloads the evicted pages, newest-evicted first.
      expect(requested.slice(10)).toEqual([6, 5, 4, 3, 2, 1]);
      expect(retainedPeoplePageCount).toBe(4);
    },
    longScrollTimeoutMs
  );

  it("stops requesting at Immich's last page", async () => {
    const f = setup(40);
    controller!.show();
    await f.settled();

    await f.press(remoteKeys.down, 10);
    expect(f.focusedId()).toBe("person-36");
    expect(f.pagesRequested()).toEqual([1, 2]);
  });

  it(
    "restores focus to the opened card, even after earlier pages were evicted",
    async () => {
      const f = setup(300);
      controller!.show();
      await f.settled();
      await f.press(remoteKeys.down, 30);
      await f.press(remoteKeys.right, 2);
      expect(f.focusedId()).toBe("person-182");

      pressKey(remoteKeys.enter);
      controller!.hide();
      expect(f.cards()).toHaveLength(0);
      controller!.show();

      expect(f.focusedId()).toBe("person-182");
      expect(f.pagesRequested()).toHaveLength(8);

      await f.press(remoteKeys.up, 30);
      expect(f.focusedId()).toBe("person-2");
      expect(f.pagesRequested().slice(8)).toEqual([4, 3, 2, 1]);
    },
    longScrollTimeoutMs
  );

  it("explains an empty People list and stays operable with Back", async () => {
    const f = setup(0);
    controller!.show();
    await f.settled();

    expect(f.status().textContent).toBe(
      "No people yet. People appear here once Immich's face recognition has found them."
    );
    expect(document.activeElement).toBe(f.status());
    pressKey(remoteKeys.down);
    expect(document.activeElement).toBe(f.status());
    pressKey(remoteKeys.back);
    expect(f.onBack).toHaveBeenCalledTimes(1);
  });

  it("offers Retry after a failure and keeps the people already shown", async () => {
    const f = setup();
    f.loadPeoplePage.mockRejectedValueOnce(new AppError("network", "Offline"));
    controller!.show();
    await vi.waitFor(() => expect(f.status().getAttribute("data-state")).toBe("error"));

    expect(f.status().textContent).toContain("Select Retry or press Back.");
    expect(document.activeElement).toBe(byId("people-retry"));
    pressKey(remoteKeys.enter);
    // Retry hides itself while loading, so focus waits visibly on the status.
    expect(document.activeElement).toBe(f.status());
    await f.settled();
    expect(f.focusedId()).toBe("person-0");

    f.loadPeoplePage.mockRejectedValueOnce(
      new AppError("permission", "Forbidden", { feature: "People" })
    );
    // Three rows down reaches the last two rows of the first page.
    for (let row = 0; row < 3; row += 1) pressKey(remoteKeys.down);
    await vi.waitFor(() => expect(f.status().getAttribute("data-state")).toBe("error"));
    expect(f.status().textContent).toContain("not allowed to show People");
    expect(f.cards().length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(byId("people-retry"));
    pressKey(remoteKeys.down);
    expect(f.focusedId()).not.toBeNull();
  });

  it("ignores a load that finishes after the browser was left, without stealing focus", async () => {
    const f = setup();
    let finish: (page: PeoplePage) => void = () => undefined;
    f.loadPeoplePage.mockImplementationOnce(
      () => new Promise<PeoplePage>((resolve) => (finish = resolve))
    );
    controller!.show();
    controller!.hide();
    const elsewhere = byId("memories-retry");
    elsewhere.hidden = false;
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    finish({ hasMore: false, page: 1, people: [person(0)], total: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(f.cards()).toHaveLength(0);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("revokes a face that arrives after the browser was hidden", async () => {
    const f = setup();
    let finish: (url: string) => void = () => undefined;
    f.loadPersonThumbnailUrl.mockImplementation(
      () => new Promise<string>((resolve) => (finish = resolve))
    );
    controller!.show();
    await f.settled();
    controller!.hide();

    finish("blob:late");
    await vi.waitFor(() => expect(f.revokeThumbnailUrl).toHaveBeenCalledWith("blob:late"));
  });

  it("releases faces on hide and forgets people on reset", async () => {
    const f = setup();
    controller!.show();
    await f.settled();
    await vi.waitFor(() => expect(f.loadPersonThumbnailUrl).toHaveBeenCalled());
    await Promise.resolve();

    controller!.hide();
    expect(f.revokeThumbnailUrl).toHaveBeenCalledWith("blob:person-0");

    controller!.reset();
    controller!.show();
    await f.settled();
    expect(f.loadPeoplePage).toHaveBeenCalledTimes(2);
  });
});
