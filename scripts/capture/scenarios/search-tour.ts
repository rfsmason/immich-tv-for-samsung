import {
  asset,
  destination,
  nav,
  searchControl as control,
  toShowPhotos,
  type Scenario
} from "./shared";

export const searchTour: Scenario = {
  name: "search-tour",
  video: true,
  async run({ remote, guide }) {
    await destination(remote, "search");
    await remote.right(control("add-people"));
    await remote.ok('#search-people-grid [data-person-index="0"]');
    await remote.ok('#search-people-grid [aria-pressed="true"]');
    await remote.back(control("add-people")); // Back from a picker lands on its row.
    await remote.down(control("from"));
    await remote.ok(control("stepper:day"));
    await guide?.highlight(".search-stepper", "Set the start date with the remote");
    await remote.hold();
    // Demonstrate editing, then restore day 1 to include the oldest library month.
    await remote.up(control("stepper:day"));
    await remote.down(control("stepper:day"));
    await remote.right(control("stepper:month"));
    await remote.right(control("stepper:year"));
    await remote.ok(control("from"));
    await remote.right(control("to"));
    await remote.ok(control("stepper:day"));
    await remote.right(control("stepper:month"));
    await remote.left(control("stepper:day"));
    await remote.ok(control("to")); // To defaults to the pinned capture date.
    await remote.left(control("from"));
    await toShowPhotos(remote, "from");
    await guide?.highlight(control("show"), "Find this person within the date range");
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
