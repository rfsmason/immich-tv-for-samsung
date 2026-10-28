import {
  asset,
  destination,
  indexOfName,
  moveInGrid,
  nav,
  searchControl as control,
  type Scenario,
  type ScenarioContext
} from "./shared";

// Every Search criterion with the demo library's own choices (docs/capture.md):
// two people, the default date range, Photos, a region and an album.
const people = ["Person B", "Person A"];
const country = "Spain";
const region = "Balearic Islands";
const album = "Mallorca";

// Both pickers show six cards a row; the place picker is a single column.
const pickerColumns = 6;
const personCard = (index: number) => `#search-people-grid [data-person-index="${index}"]`;
const albumCard = (index: number) => `#search-albums-grid [data-album-index="${index}"]`;
const placeRow = (index: number) => `#search-place-list [data-place-index="${index}"]`;
const anywhere = "#search-place-list .search-place-anywhere";

async function choosePeople(context: ScenarioContext): Promise<void> {
  const { page, remote } = context;
  await remote.ok(personCard(0));
  let at = 0;
  for (const name of people) {
    const index = await indexOfName(
      page,
      "#search-people-grid [data-person-index]",
      "data-person-index",
      name,
      ".person-name"
    );
    await moveInGrid(remote, personCard, at, index, pickerColumns);
    await remote.ok(`${personCard(index)}[aria-pressed="true"]`);
    at = index;
  }
  await remote.back(control("add-people")); // Back from a picker lands on its row.
}

// OK on each date opens its stepper at the default, and OK keeps it: From is
// the library's first month and To is today.
async function chooseDefaultDates({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.down(control("from"));
  await remote.ok(control("stepper:day"));
  await guide?.highlight(".search-stepper", "Set the start date with the remote");
  await remote.hold();
  await remote.ok(control("from"));
  await remote.right(control("to"));
  await remote.ok(control("stepper:day"));
  await remote.ok(control("to"));
}

async function choosePhotos({ remote }: ScenarioContext): Promise<void> {
  await remote.right(control("asset-type"));
  await remote.ok(control("asset-type:all")); // OK opens the list.
  await remote.down(control("asset-type:photos"));
  await remote.ok(control("asset-type"));
}

async function choosePlace(context: ScenarioContext): Promise<void> {
  const { page, remote } = context;
  const rows = "#search-place-list [data-place-index]";
  await remote.down(control("choose-place"));
  await remote.ok(placeRow(0));
  await moveInGrid(
    remote,
    placeRow,
    0,
    await indexOfName(page, rows, "data-place-index", country),
    1
  );
  await remote.ok(anywhere);
  await moveInGrid(
    remote,
    placeRow,
    0,
    await indexOfName(page, rows, "data-place-index", region),
    1
  );
  await remote.ok(anywhere);
  await remote.ok(control("place-chip")); // "Anywhere in" the region.
}

async function chooseAlbum(context: ScenarioContext): Promise<void> {
  const { page, remote } = context;
  await remote.down(control("add-albums"));
  await remote.ok(albumCard(0));
  const index = await indexOfName(
    page,
    "#search-albums-grid [data-album-index]",
    "data-album-index",
    album,
    ".album-name"
  );
  await moveInGrid(remote, albumCard, 0, index, pickerColumns);
  await remote.ok(`${albumCard(index)}[aria-pressed="true"]`);
  await remote.back(control("add-albums"));
}

export const searchTour: Scenario = {
  name: "search-tour",
  video: true,
  async run(context) {
    const { remote, guide } = context;
    await destination(remote, "search");
    await remote.right(control("add-people"));
    await choosePeople(context);
    await chooseDefaultDates(context);
    await choosePhotos(context);
    await choosePlace(context);
    await chooseAlbum(context);
    await remote.down(control("show"));
    await guide?.highlight(control("show"), "Find these people, in this place and album");
    await remote.hold();
    await remote.ok(asset);
    await remote.visible("#album-assets-grid .asset-thumbnail");
    await remote.back(control("show")); // Criteria remain intact after results.
    await remote.back(nav("search"));
    await remote.up(nav("albums"));
    await remote.up(nav("photos"));
    await remote.up(nav("home"));
  }
};
