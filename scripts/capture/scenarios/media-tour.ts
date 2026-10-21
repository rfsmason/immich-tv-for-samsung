import { playDemoVideo, readDemoRow } from "./collection-demo";
import { asset, homeRail, homeTile, type Scenario, type ScenarioContext } from "./shared";

const tile = (index: number): string => `[data-asset-index="${index}"]`;
const play = "#asset-viewer-play";

export async function playDemoLivePhoto({ page, remote, guide }: ScenarioContext): Promise<void> {
  await remote.visible(`${play}[data-media-kind="live-photo"]`);
  await remote.visible("#asset-viewer-image");
  await guide?.highlight(play, "OK brings this Live Photo to life");
  await remote.hold();
  remote.step = "Live Photo playback: observe visible motion, then return to the still";
  // Observe before pressing OK: the app naturally plays a short motion clip
  // once, so waiting until after an editorial hold could miss it entirely.
  await Promise.all([
    page
      .waitForFunction(
        () => {
          const video = document.querySelector<HTMLVideoElement>("#asset-viewer-video");
          return (
            video &&
            !video.hidden &&
            video.style.opacity === "1" &&
            video.readyState >= 2 &&
            !video.paused &&
            video.currentTime >= 0.15
          );
        },
        undefined,
        { timeout: 30_000 }
      )
      .then((handle) => handle.dispose()),
    remote.ok(play, { pauseAfter: false })
  ]);
  await remote.visible(`${play}[data-play-state="idle"]`);
  await remote.visible("#asset-viewer-image");
  await remote.ready();
  await guide?.highlight("#asset-viewer-image", "Motion finishes and the photo returns");
  await remote.hold();
}

export const mediaTour: Scenario = {
  name: "media-tour",
  video: true,
  async run(context) {
    const { page, remote, guide } = context;
    await homeRail(context, "recently-added");
    await guide?.highlight(
      homeTile("recently-added"),
      "Immich TV for Samsung – Videos & Live Photos Demo"
    );
    await remote.hold();
    await remote.ok(asset);
    await remote.visible("#album-assets-grid .asset-thumbnail");
    const items = await readDemoRow(page);
    const video = items.find((item) => item.video);
    const live = items.find((item) => item.livePhoto);
    remote.step = "Recently Added demo: video and Live Photo required in the first six items";
    if (!video || !live)
      throw new Error("Recently Added needs a video and Live Photo in its first row.");
    let focused = 0;
    async function moveTo(index: number): Promise<void> {
      while (focused !== index) {
        const right = focused < index;
        focused += right ? 1 : -1;
        await remote[right ? "right" : "left"](tile(focused));
      }
    }
    await moveTo(video.index);
    await guide?.highlight(tile(video.index), "Open a video, then press OK to play");
    await remote.hold();
    await remote.ok(play);
    await remote.visible(`${play}[data-media-kind="video"]`);
    await playDemoVideo(context);
    await remote.back(tile(video.index));
    await moveTo(live.index);
    await remote.ok(play);
    await playDemoLivePhoto(context);
    await remote.back(tile(live.index));
    // Leaving the library grid restores its originating Home preview tile.
    await remote.back(homeTile("recently-added"));
    await remote.visible("#home-screen");
  }
};
