import { secondAlbum, viewer, type Scenario } from "./shared";
export const viewerImage: Scenario = {
  name: "viewer-image",
  async run(context) {
    await secondAlbum(context);
    await viewer(context);
    await context.capture.still("viewer-image");
  }
};
