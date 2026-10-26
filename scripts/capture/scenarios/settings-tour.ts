import { maskConnectionFields } from "../privacy";
import { destination, nav, type Scenario } from "./shared";

export const settingsTour: Scenario = {
  name: "settings-tour",
  video: true,
  async run({ page, remote, guide }) {
    // Must precede even the nav press that opens Settings. Never disable this
    // for --no-highlights, and never remove it while recording is active.
    await maskConnectionFields(page);
    await destination(remote, "settings");
    await remote.right("#settings-section-connection");
    await remote.ok("#server-url");
    await guide?.highlight("#server-url", "Connection details masked for this recording");
    await remote.hold();
    await remote.down("#api-key");
    await remote.left("#settings-section-connection");
    await remote.down("#settings-section-display");
    await remote.right("#autoplay-videos");
    await remote.ok("#autoplay-videos");
    await remote.down("#show-viewer-date");
    await remote.ok("#show-viewer-date");
    await remote.down("#show-viewer-time");
    await remote.down("#show-viewer-exif");
    await remote.ok("#show-viewer-exif");
    // Arriving on the interval opens its list on the seeded interval.
    await remote.down('#settings-panel-display .dropdown-option[aria-selected="true"]');
    await guide?.highlight(
      "#settings-panel-display .dropdown-list",
      "Choose the slideshow interval"
    );
    await remote.hold();
    await remote.ok("#slideshow-interval"); // Keeps the seeded interval.
    await remote.up("#show-viewer-exif");
    await remote.left("#settings-section-display");
    await remote.down("#settings-save");
    await remote.ok("#settings-save");
    await remote.visible('#settings-summary[data-state="success"]');
    await remote.back(nav("search"));
    await remote.up(nav("albums"));
    await remote.up(nav("photos"));
    await remote.up(nav("home"));
  }
};
