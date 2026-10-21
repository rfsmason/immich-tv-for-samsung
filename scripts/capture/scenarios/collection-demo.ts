import { slideshow, type ScenarioContext } from "./shared";

const tile = (index: number): string => `[data-asset-index="${index}"]`;
const play = "#asset-viewer-play";

// Both demos use the same first-row browsing and viewer behavior. Inspect only
// existing presentation badges; all focus and playback changes use the remote.
export async function collectionDemo(
  { page, remote, guide }: ScenarioContext,
  requireVideo = true
): Promise<void> {
  await remote.visible("#album-assets-grid .asset-thumbnail");
  const items = await readDemoRow(page);
  const photo = items.find((item) => !item.video && !item.livePhoto);
  const video = items.find((item) => item.video);
  remote.step =
    "demo collection: ordinary photo and playable video required in the first six assets";
  if (!photo || (requireVideo && !video))
    throw new Error("The demo collection needs a photo and video in its first row.");
  let focused = 0;
  async function moveTo(index: number): Promise<void> {
    while (focused !== index) {
      const right = focused < index;
      focused += right ? 1 : -1;
      await remote[right ? "right" : "left"](tile(focused));
    }
  }
  await guide?.highlight(tile(0), "Browse photos and videos with the remote");
  await remote.hold();
  // Show focus movement even when the first item is the selected photo.
  await moveTo(1);
  await moveTo(photo.index);
  await remote.ok(slideshow);
  await remote.visible("#asset-viewer-image");
  await guide?.highlight("#asset-viewer-image", "Your photos on the big screen");
  await remote.hold();
  await remote.back(tile(photo.index));
  if (!video) {
    const nextPhoto = items.find(
      (item) => !item.video && !item.livePhoto && item.index !== photo.index
    );
    if (!nextPhoto)
      throw new Error("The photo-only demo Memory needs at least two ordinary photos.");
    await moveTo(nextPhoto.index);
    await remote.ok(slideshow);
    await remote.visible("#asset-viewer-image");
    await remote.hold();
    await remote.back(tile(nextPhoto.index));
    return;
  }
  await moveTo(video.index);
  await guide?.highlight(tile(video.index), "OK opens the video");
  await remote.hold();
  await remote.ok(play);
  await playDemoVideo({ page, remote });
  await remote.back(tile(video.index));
}

// Read existing badges only; selecting and opening remain remote actions.
export async function readDemoRow(page: ScenarioContext["page"]) {
  return await page.locator("#album-assets-grid [data-asset-index]").evaluateAll((tiles) =>
    tiles
      .filter((element) => Number(element.getAttribute("data-asset-index")) < 6)
      .map((element) => ({
        index: Number(element.getAttribute("data-asset-index")),
        video: Boolean(element.querySelector(".asset-video-badge")),
        livePhoto: Boolean(element.querySelector(".asset-live-photo-badge"))
      }))
  );
}

export async function playDemoVideo({
  page,
  remote
}: Pick<ScenarioContext, "page" | "remote">): Promise<void> {
  await remote.ok(play);
  remote.step = "video playback: wait for three seconds of actual media progress";
  await page.waitForFunction(
    () => {
      const video = document.querySelector<HTMLVideoElement>("#asset-viewer-video");
      return video && !video.hidden && !video.paused && video.currentTime >= 3;
    },
    undefined,
    { timeout: 30_000 }
  );
  await remote.ok(play); // Pause before returning to the collection.
  await remote.visible('#asset-viewer-status[data-player-state="paused"]');
}
