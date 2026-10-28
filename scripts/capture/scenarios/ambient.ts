import { maskConnectionFields } from "../privacy";
import { destination, type Scenario, type ScenarioContext } from "./shared";

// Ambient mode (Milestone 18, ADR 0019): Settings → Ambient, and ambient
// mode with its clock and photo details. Capture pins the clock, so the
// time shown is the same on every run. Ambient mode plays the demo
// library's photos at random, so the picture varies between runs.

async function openAmbientSettings({ page, remote }: ScenarioContext): Promise<void> {
  // The Connection panel stays closed, but mask its fields regardless.
  await maskConnectionFields(page);
  await destination(remote, "settings");
  await remote.right("#settings-section-connection");
  await remote.down("#settings-section-display");
  await remote.down("#settings-section-home");
  await remote.down("#settings-section-ambient");
  await remote.right("#ambient-source");
}

export const settingsAmbient: Scenario = {
  name: "settings-ambient",
  async run(context) {
    await openAmbientSettings(context);
    await context.capture.still("settings-ambient");
  }
};

export const ambientClock: Scenario = {
  name: "ambient-clock",
  async run(context) {
    const { capture, remote } = context;

    await openAmbientSettings(context);
    for (const control of [
      "#ambient-interval",
      "#ambient-idle",
      "#ambient-stop",
      "#ambient-include-videos",
      "#ambient-show-clock",
      "#ambient-show-details"
    ]) {
      await remote.down(control);
    }
    // Photo details on (off by default), then Start now.
    await remote.ok("#ambient-show-details:checked");
    await remote.down("#ambient-start");
    await remote.ok("#ambient-screen");
    await remote.visible("#ambient-screen .ambient-layer[data-visible]");
    await capture.still("ambient-clock");
    // Any key returns to Start now.
    await remote.back("#ambient-start");
  }
};
