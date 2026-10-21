import { destination, type Scenario } from "./shared";
export const albums: Scenario = {
  name: "albums",
  async run({ remote, capture }) {
    await destination(remote, "albums");
    await remote.visible('[data-album-index="0"]');
    await remote.right('[data-album-index="0"]');
    await capture.still("albums");
  }
};
