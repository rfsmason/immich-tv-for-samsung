import { describe, expect, it } from "vitest";
import type { HomeRailId, HomeScreenElements, HomeScreenState } from "./home-model";
import { homeRailOrder } from "./home-model";
import { TestDocument, type TestElement } from "../../test/document";
import { alignHomeRails } from "./home-rails";
import { replaceAlbumCover } from "./home-thumbnails";

// Layout offsets as a browser would report them; transforms do not change them.
function fakeRail(sectionTop: number, tileStep: number) {
  const section = { offsetTop: sectionTop };
  const style = { transform: "" };
  const rail = {
    closest: () => section,
    querySelector: (selector: string) => {
      const index = Number(/data-home-index="(\d+)"/.exec(selector)?.[1]);
      return Number.isFinite(index) ? { offsetLeft: 24 + index * tileStep } : null;
    },
    style
  };

  return rail;
}

function fixture(activeRail: HomeRailId, focused: Partial<Record<HomeRailId, number>>) {
  const rails = Object.fromEntries(
    homeRailOrder.map((railId, index) => [railId, fakeRail(index * 326, 272)])
  ) as Record<HomeRailId, ReturnType<typeof fakeRail>>;
  const stack = { style: { transform: "" } };
  const elements = {
    albumsRail: rails.albums,
    favoritesRail: rails.favorites,
    memoriesRail: rails.memories,
    peopleRail: rails.people,
    recentlyAddedRail: rails["recently-added"],
    recentlyViewedRail: rails["recently-viewed"],
    root: { querySelector: () => stack },
    videosRail: rails.videos
  } as unknown as HomeScreenElements;
  const railState = (railId: HomeRailId) => ({ focusedIndex: focused[railId] ?? 0, items: [] });
  const state = {
    activeRail,
    albums: railState("albums"),
    favorites: railState("favorites"),
    memories: railState("memories"),
    people: railState("people"),
    recentlyAdded: railState("recently-added"),
    recentlyViewed: railState("recently-viewed"),
    videos: railState("videos")
  } as unknown as HomeScreenState;

  return { elements, rails, stack, state };
}

describe("fixed-focus Home rails", () => {
  it("orders seven rails with Videos directly after Favourites", () => {
    expect(homeRailOrder).toEqual([
      "recently-added",
      "favorites",
      "videos",
      "people",
      "recently-viewed",
      "albums",
      "memories"
    ]);
  });

  it("moves each rail so its own selected tile sits where its second tile sits", () => {
    const f = fixture("favorites", { favorites: 3, people: 1, albums: 0 });

    alignHomeRails(f.elements, f.state);

    // The previous item stays visible in the first position.
    expect(f.rails.favorites.style.transform).toBe("translateX(-544px)");
    expect(f.rails.people.style.transform).toBe("");
    expect(f.rails.albums.style.transform).toBe("");
  });

  it("moves the rail stack so the active rail sits where the first rail sits", () => {
    const f = fixture("people", {});

    alignHomeRails(f.elements, f.state);
    // People is the fourth rail, after Recently Added, Favourites and Videos.
    expect(f.stack.style.transform).toBe("translateY(-978px)");

    f.state.activeRail = "videos";
    alignHomeRails(f.elements, f.state);
    expect(f.stack.style.transform).toBe("translateY(-652px)");

    f.state.activeRail = "memories";
    alignHomeRails(f.elements, f.state);
    expect(f.stack.style.transform).toBe("translateY(-1956px)");

    f.state.activeRail = "recently-added";
    alignHomeRails(f.elements, f.state);
    expect(f.stack.style.transform).toBe("");
  });
});

describe("Home tile covers", () => {
  it("shows a person's face without the blurred backdrop used by album covers", () => {
    const documentRef = new TestDocument();
    const personTile = documentRef.createElement("button");
    const albumTile = documentRef.createElement("button");
    const classes = (tile: TestElement) =>
      tile.children[0]!.children.map((image) => image.className);

    replaceAlbumCover(
      documentRef as unknown as Document,
      personTile as unknown as HTMLElement,
      "blob:face",
      {
        backdrop: false
      }
    );
    replaceAlbumCover(
      documentRef as unknown as Document,
      albumTile as unknown as HTMLElement,
      "blob:cover"
    );

    expect(classes(personTile)).toEqual(["album-cover"]);
    expect(classes(albumTile)).toEqual(["album-cover-backdrop", "album-cover"]);
  });
});
