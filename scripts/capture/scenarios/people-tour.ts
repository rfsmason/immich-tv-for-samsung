import { asset, homeRail, homeTile, showFaces, viewer, type Scenario } from "./shared";

// The first person straight from Home's People rail, their first photo with
// its face tags, and back to the same Home tile.
export const peopleTour: Scenario = {
  name: "people-tour",
  video: true,
  async run(context) {
    const { remote } = context;
    await homeRail(context, "people");
    await remote.ok(asset);
    await remote.visible("#album-assets-grid .asset-thumbnail");
    await viewer(context);
    await showFaces(context);
    await remote.back(asset);
    await remote.back(homeTile("people"));
    await remote.visible("#home-screen");
  }
};
