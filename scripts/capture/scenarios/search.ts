import { asset, destination, type Scenario } from "./shared";
export const search: Scenario = {
  name: "search",
  async run({ remote, capture }) {
    await destination(remote, "search");
    await remote.right('[data-search-control="add-people"]');
    await remote.ok('#search-people-grid [data-person-index="0"]');
    await remote.ok('#search-people-grid [aria-pressed="true"]');
    await remote.back('[data-search-control="show"]');
    await capture.still("search-criteria");
    await remote.ok(asset);
    await capture.still("search-results");
  }
};
