import { asset, homeTile, secondAlbum, slideshow, viewer, type Scenario } from "./shared";
export const tour: Scenario = {
  name: "tour",
  video: true,
  async run(context) {
    const { remote, page, interval } = context;
    await secondAlbum(context);
    await viewer(context);
    let previous = await page.locator("#asset-placeholder-summary").textContent();
    // Start watching immediately, rather than consuming the first interval
    // with an editorial pause. Real slideshow timers keep running.
    await remote.ok(slideshow, { pauseAfter: false });
    await remote.visible(`${slideshow}[data-slideshow-state="playing"]`);
    try {
      await context.guide?.highlight(slideshow, "Next photo countdown", "::after");
      const changes = context.slideChanges ?? 2;
      for (let index = 0; index < changes; index += 1) {
        const advance = await page.waitForFunction(
          (value) => {
            const current = document.querySelector("#asset-placeholder-summary")?.textContent;
            return current && current !== value ? current : null;
          },
          previous,
          { timeout: (interval + 30) * 1000 }
        );
        previous = await advance.jsonValue();
        await advance.dispose();
        // Pause on the final advance before waiting for image decoding or
        // adding a viewing hold, so those waits cannot add another slide.
        if (index === changes - 1) await remote.ok(slideshow);
        await remote.visible("#asset-viewer-image");
        await remote.ready();
      }
    } finally {
      await context.guide?.clear();
    }
    await remote.back("[data-asset-index]");
    await remote.visible(asset);
    await remote.back(homeTile("albums", 1));
    await remote.visible("#home-screen");
  }
};
