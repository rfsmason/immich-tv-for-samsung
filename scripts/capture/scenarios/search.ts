import { asset, destination, searchControl, toShowPhotos, type Scenario } from "./shared";
export const search: Scenario = {
  name: "search",
  async run({ remote, capture }) {
    await destination(remote, "search");
    await remote.right(searchControl("add-people"));
    await remote.ok('#search-people-grid [data-person-index="0"]');
    await remote.ok('#search-people-grid [aria-pressed="true"]');
    await remote.back(searchControl("add-people"));
    await toShowPhotos(remote, "add-people");
    await capture.still("search-criteria");
    await remote.ok(asset);
    await capture.still("search-results");
  }
};
