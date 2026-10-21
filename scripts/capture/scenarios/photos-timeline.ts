import { asset, destination, type Scenario } from "./shared";
export const photosTimeline: Scenario = {
  name: "photos-timeline",
  async run({ remote, capture }) {
    await destination(remote, "photos");
    await remote.visible(asset);
    await remote.right(asset);
    await remote.visible(".asset-date-section-heading");
    await remote.visible("#photos-timeline-rail");
    await capture.still("photos-timeline");
  }
};
