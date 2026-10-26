import { destination, searchControl as control, type Scenario } from "./shared";

// Search v2 stills (Milestone 16): the panel with a person, a type, a place
// and an album; the place picker one level in; and the album picker. The
// demo library's first country needs a region or city, so the picker shows
// "Anywhere in <country>" (docs/capture.md).

const placeRow = '#search-place-list [data-place-index="0"]';
const anywhere = "#search-place-list .search-place-anywhere";
const firstAlbum = '#search-albums-grid [data-album-index="0"]';
const selectedAlbum = '#search-albums-grid [aria-pressed="true"]';

export const searchPlacePicker: Scenario = {
  name: "search-place-picker",
  async run({ remote, capture }) {
    await destination(remote, "search");
    await remote.right(control("add-people"));
    await remote.down(control("from"));
    await remote.down(control("type:all"));
    await remote.down(control("choose-place"));
    await remote.ok(placeRow);
    await remote.ok(anywhere);
    await capture.still("search-place-picker");
  }
};

export const searchAlbumPicker: Scenario = {
  name: "search-album-picker",
  async run({ remote, capture }) {
    await destination(remote, "search");
    await remote.right(control("add-people"));
    await remote.down(control("from"));
    await remote.down(control("type:all"));
    await remote.down(control("choose-place"));
    await remote.down(control("add-albums"));
    await remote.ok(firstAlbum);
    await remote.ok(selectedAlbum);
    await capture.still("search-album-picker");
  }
};

export const searchV2Panel: Scenario = {
  name: "search-v2-panel",
  async run({ remote, capture }) {
    await destination(remote, "search");
    await remote.right(control("add-people"));
    await remote.ok('#search-people-grid [data-person-index="0"]');
    await remote.ok('#search-people-grid [aria-pressed="true"]');
    await remote.back(control("add-people"));
    await remote.down(control("from"));
    await remote.down(control("type:all"));
    await remote.right(control("type:photos"));
    await remote.ok(control("type:photos"));
    await remote.down(control("choose-place"));
    await remote.ok(placeRow);
    await remote.ok(anywhere);
    await remote.ok(control("place-chip"));
    await remote.down(control("add-albums"));
    await remote.ok(firstAlbum);
    await remote.ok(selectedAlbum);
    await remote.back(control("add-albums"));
    await remote.down(control("show"));
    await capture.still("search-v2-panel");
  }
};
