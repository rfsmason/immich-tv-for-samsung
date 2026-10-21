import { asset, homeRail, type Scenario } from "./shared";
// Home → Videos rail → OK on its first item → the Videos library view.
export const videos: Scenario = {
  name: "videos",
  async run(context) {
    await homeRail(context, "videos");
    await context.remote.ok(asset);
    await context.remote.visible("#album-assets-grid .asset-thumbnail");
    await context.capture.still("videos");
  }
};
