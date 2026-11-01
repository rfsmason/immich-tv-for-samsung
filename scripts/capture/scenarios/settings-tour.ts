import { maskConnectionFields } from "../privacy";
import {
  destination,
  indexOfName,
  moveInGrid,
  nav,
  type Scenario,
  type ScenarioContext
} from "./shared";

// Every Settings section in turn: Connection (masked, then tested), Display,
// Home's rails, Ambient, which plays the demo library's album, and Support
// Us, before Save (docs/capture.md). It changes only the fresh capture context's local
// preferences, never server data.

const ambientAlbum = "Mallorca";
const albumCard = (index: number) => `#search-albums-grid [data-album-index="${index}"]`;
const option = (panel: string, index: number) =>
  `#settings-panel-${panel} .dropdown-option:nth-child(${index + 1})`;
const selected = (panel: string) =>
  `#settings-panel-${panel} .dropdown-option[aria-selected="true"]`;
const testConnection = '#settings-panel-connection [data-action="test-connection"]';

// How long the tour waits for ambient mode's first crossfade: the
// 10-second interval, plus loading and the fade.
const crossfadeWaitMs = 40_000;
const clockStepMs = 250;

// Capture pins Date.now() (run-capture.ts), and ambient mode measures its
// waits against the wall clock (ADR 0019), so the pinned time is moved on in
// step with real time until the second picture has faded in.
async function watchCrossfade({ page }: ScenarioContext): Promise<void> {
  const pinned = await page.evaluate(() => Date.now());
  const started = Date.now();
  while (Date.now() - started < crossfadeWaitMs) {
    const faded = await page.evaluate(
      () =>
        document.querySelectorAll("#ambient-screen .ambient-layer[data-visible]").length === 1 &&
        document.querySelector("#ambient-layer-b[data-visible]") !== null
    );
    if (faded) return;
    await new Promise((resolve) => setTimeout(resolve, clockStepMs));
    await page.clock.setFixedTime(pinned + Date.now() - started);
  }
  throw new Error("Ambient mode did not move on to a second picture.");
}

async function connection({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.right("#settings-section-connection");
  await remote.ok("#server-url");
  await guide?.highlight("#server-url", "Connection details masked for this recording");
  await remote.hold();
  await remote.down("#api-key");
  // Up from the first field wraps to Test connection, so focus never rests
  // on the API key's Show button.
  await remote.up("#server-url");
  await remote.up(testConnection);
  await remote.ok(testConnection);
  await remote.visible(
    '#connection-status[data-state="success"], #connection-status[data-state="warning"]'
  );
  await guide?.highlight("#connection-status", "The server's Immich version and your user");
  await remote.hold();
  await remote.left("#settings-section-connection");
}

async function display({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.down("#settings-section-display");
  await remote.right("#high-contrast");
  await remote.down("#autoplay-videos");
  await remote.down("#show-viewer-date");
  await remote.down("#show-viewer-time");
  await remote.down("#show-viewer-exif");
  await remote.ok("#show-viewer-exif");
  // OK opens the interval's list on the seeded interval.
  await remote.down("#slideshow-interval");
  await remote.ok(selected("display"));
  await guide?.highlight("#settings-panel-display .dropdown-list", "Choose the slideshow interval");
  await remote.hold();
  await remote.ok("#slideshow-interval"); // Keeps the seeded interval.
  await remote.left("#settings-section-display");
}

async function homeRails({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.down("#settings-section-home");
  await remote.right("#home-rail-recently-added");
  await guide?.highlight("#settings-panel-home", "Choose which rails Home shows");
  await remote.hold();
  for (const rail of ["favorites", "videos", "people", "recently-viewed"]) {
    await remote.down(`#home-rail-${rail}`);
  }
  await remote.ok("#home-rail-recently-viewed:not(:checked)");
  await remote.left("#settings-section-home");
}

// Moves down to a drop-down and opens its list to show the choices, then OK
// keeps the one already chosen.
async function showChoices(
  { remote, guide }: ScenarioContext,
  control: string,
  callout: string
): Promise<void> {
  await remote.down(control);
  await remote.ok(selected("ambient"));
  await guide?.highlight("#settings-panel-ambient .dropdown-list", callout);
  await remote.hold();
  await remote.ok(control);
}

async function supportUs({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.down("#settings-section-support");
  await remote.right("#support-supporter");
  await guide?.highlight(
    ".support-qr-figure",
    "Scan to tip on Ko-fi; it's optional and unlocks nothing"
  );
  await remote.hold();
  await remote.left("#settings-section-support");
}

async function ambient(context: ScenarioContext): Promise<void> {
  const { page, remote, guide } = context;
  await remote.down("#settings-section-ambient");
  // Source: Album (the fourth choice), then the album itself.
  await remote.right("#ambient-source");
  await remote.ok(selected("ambient"));
  await guide?.highlight(
    "#settings-panel-ambient .dropdown-list",
    "Choose what ambient mode shows"
  );
  await remote.hold();
  for (let index = 1; index <= 3; index += 1) await remote.down(option("ambient", index));
  await remote.ok("#ambient-source");
  await remote.down("#ambient-album");
  await remote.ok(albumCard(0));
  const album = await indexOfName(
    page,
    "#search-albums-grid [data-album-index]",
    "data-album-index",
    ambientAlbum,
    ".album-name"
  );
  await moveInGrid(remote, albumCard, 0, album, 6);
  await remote.ok("#ambient-album"); // A single choice returns at once.
  await showChoices(context, "#ambient-order", "Shuffle, or the album in order");
  // Interval: 10 seconds, the first choice, so the recording sees it change.
  await remote.down("#ambient-interval");
  await remote.ok(selected("ambient"));
  for (let index = 1; index >= 0; index -= 1) await remote.up(option("ambient", index));
  await remote.ok("#ambient-interval");
  await showChoices(context, "#ambient-idle", "Start by itself when the TV sits idle");
  await showChoices(context, "#ambient-stop", "Stop after a while, or never");
  for (const control of [
    "#ambient-include-videos",
    "#ambient-show-clock",
    "#ambient-show-details"
  ]) {
    await remote.down(control);
  }
  await remote.ok("#ambient-show-details:checked");
  // Start now plays the choices on the form, saved or not.
  await remote.down("#ambient-start");
  await remote.ok("#ambient-screen");
  await remote.visible("#ambient-screen .ambient-layer[data-visible]");
  await watchCrossfade(context);
  await remote.hold();
  await remote.back("#ambient-start"); // Any key returns to Start now.
}

export const settingsTour: Scenario = {
  name: "settings-tour",
  video: true,
  async run(context) {
    const { page, remote } = context;
    // Must precede even the nav press that opens Settings. Never disable this
    // for --no-highlights, and never remove it while recording is active.
    await maskConnectionFields(page);
    await destination(remote, "settings");
    await connection(context);
    await display(context);
    await homeRails(context);
    await ambient(context);
    await remote.left("#settings-section-ambient");
    await supportUs(context);
    await remote.down("#settings-save");
    await remote.ok("#settings-save");
    await remote.visible('#settings-summary[data-state="success"]');
    await remote.back(nav("search"));
    await remote.up(nav("albums"));
    await remote.up(nav("photos"));
    await remote.up(nav("home"));
  }
};
