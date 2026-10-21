import { asset, homeRail, type Scenario } from "./shared";
// Home → Favourites rail → OK on its first item → the Favourites library view.
export const favorites: Scenario = {
  name: "favorites",
  async run(context) {
    await homeRail(context, "favorites");
    await context.remote.ok(asset);
    await context.remote.visible("#album-assets-grid .asset-thumbnail");
    await context.capture.still("favorites");
  }
};
