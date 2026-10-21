import { secondAlbum, type Scenario } from "./shared";
export const albumGrid: Scenario = {
  name: "album-grid",
  async run(context) {
    await secondAlbum(context);
    await context.capture.still("album-grid");
  }
};
