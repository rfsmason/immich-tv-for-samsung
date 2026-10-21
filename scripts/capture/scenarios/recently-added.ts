import { asset, homeRail, type Scenario } from "./shared";
// Home → Recently added rail → OK on its first item → the Recently added library view.
export const recentlyAdded: Scenario = {
  name: "recently-added",
  async run(context) {
    await homeRail(context, "recently-added");
    await context.remote.ok(asset);
    await context.remote.visible("#album-assets-grid .asset-thumbnail");
    await context.capture.still("recently-added");
  }
};
