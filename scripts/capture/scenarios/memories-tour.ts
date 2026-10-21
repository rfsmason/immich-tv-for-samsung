import { collectionDemo } from "./collection-demo";
import { asset, homeRail, homeTile, type Scenario } from "./shared";

export const memoriesTour: Scenario = {
  name: "memories-tour",
  video: true,
  async run(context) {
    const { remote, guide } = context;
    await homeRail(context, "memories");
    await guide?.highlight(homeTile("memories"), "Immich TV for Samsung – Memories Demo");
    await remote.hold();
    await remote.attached(homeTile("memories", 1));
    await remote.right(homeTile("memories", 1));
    await remote.left(homeTile("memories"));
    await guide?.highlight(homeTile("memories"), "OK opens these memories");
    await remote.hold();
    await remote.ok(asset);
    await collectionDemo(context, false);
    await remote.back(homeTile("memories"));
    await remote.visible("#home-screen");
  }
};
