import { maskConnectionFields } from "../privacy";
import {
  asset,
  destination,
  homeRail,
  nav,
  secondAlbum,
  viewer,
  type Scenario,
  type ScenarioContext
} from "./shared";

// Milestone 18.5 stills (ADR 0020): Settings → Display with High contrast and
// Hide playback buttons, Home and the viewer in high contrast, and a video's
// progress bar focused while skipping. High contrast is turned on with the
// remote, in the fresh capture context's own settings.

const seekBar = "#asset-viewer-seek";
const play = "#asset-viewer-play";

async function openDisplaySettings({ page, remote }: ScenarioContext): Promise<void> {
  // The Connection panel stays closed, but mask its fields regardless.
  await maskConnectionFields(page);
  await destination(remote, "settings");
  await remote.right("#settings-section-connection");
  await remote.down("#settings-section-display");
  await remote.right("#high-contrast");
}

// Turns High contrast on, saves, and returns to Home with its nav focused.
async function turnOnHighContrast(context: ScenarioContext): Promise<void> {
  const { remote } = context;

  await openDisplaySettings(context);
  await remote.ok("#high-contrast:checked");
  await remote.left("#settings-section-display");
  await remote.down("#settings-section-home");
  await remote.down("#settings-section-ambient");
  await remote.down("#settings-save");
  await remote.ok("#settings-save");
  await remote.visible('html[data-contrast="high"]');
  // Back from Settings returns to the last destination the rail passed.
  await remote.back(nav("search"));
  await remote.up(nav("albums"));
  await remote.up(nav("photos"));
  await remote.up(nav("home"));
}

export const settingsDisplay: Scenario = {
  name: "settings-display",
  async run(context) {
    await openDisplaySettings(context);
    await context.capture.still("settings-display");
  }
};

export const homeHighContrast: Scenario = {
  name: "home-high-contrast",
  async run(context) {
    await turnOnHighContrast(context);
    await context.remote.visible("#home-screen");
    await context.capture.still("home-high-contrast");
  }
};

export const viewerHighContrast: Scenario = {
  name: "viewer-high-contrast",
  async run(context) {
    await turnOnHighContrast(context);
    await secondAlbum(context);
    await viewer(context);
    await context.capture.still("viewer-high-contrast");
  }
};

// The first video in Videos: play it, pause on the bar, then skip ahead.
export const viewerSeek: Scenario = {
  name: "viewer-seek",
  async run(context) {
    const { page, remote } = context;

    await homeRail(context, "videos");
    await remote.ok(asset);
    await remote.visible("#album-assets-grid .asset-thumbnail");
    await remote.ok(play);
    await remote.ok(play);
    remote.step = "video playback: wait for the video's length";
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>("#asset-viewer-video");
      return Boolean(video && !video.paused && video.duration > 0);
    });
    await remote.up(seekBar);
    await remote.ok(seekBar); // Pause.
    await remote.visible('#asset-viewer-status[data-player-state="paused"]');
    await remote.right(seekBar);
    await remote.right(seekBar);
    await context.capture.still("viewer-seek");
  }
};
