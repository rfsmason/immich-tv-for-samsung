import { collectionDemo } from "./collection-demo";
import { asset, destination, nav, type Scenario } from "./shared";

const album = (index: number): string => `[data-album-index="${index}"]`;

export const albumsTour: Scenario = {
  name: "albums-tour",
  video: true,
  async run(context) {
    const { remote, guide } = context;
    await destination(remote, "albums");
    await guide?.highlight(nav("albums"), "Immich TV for Samsung – Albums Demo");
    await remote.hold();
    await remote.visible(album(0));
    await remote.right(album(0));
    await remote.right(album(1));
    await remote.left(album(0));
    await remote.ok(asset);
    await collectionDemo(context);
    await remote.back(nav("albums"));
    await remote.up(nav("photos"));
    await remote.up(nav("home"));
  }
};
