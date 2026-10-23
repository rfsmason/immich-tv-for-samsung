import { asset, peopleBrowser, slideshow, type Scenario } from "./shared";

// The first person's first photo with Faces on. The demo library's people are
// named, consenting demo people, so their faces carry tags (docs/capture.md).
export const viewerFaces: Scenario = {
  name: "viewer-faces",
  async run(context) {
    const { remote, page } = context;
    await peopleBrowser(context);
    await remote.ok(asset);
    await remote.visible("#album-assets-grid .asset-thumbnail");
    await remote.ok(slideshow);
    await remote.visible("#asset-viewer-image");
    if (await page.locator("#asset-viewer-play").isVisible()) {
      throw new Error("The first person's collection must start with a still photo.");
    }
    await remote.down("#asset-viewer-faces");
    await remote.ok("#asset-viewer-faces");
    await remote.visible('#asset-viewer-faces[aria-pressed="true"]');
    await remote.visible("#asset-viewer-face-overlay .asset-viewer-face-box");
    await context.capture.still("viewer-faces");
  }
};
