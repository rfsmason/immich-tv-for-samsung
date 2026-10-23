import { maskConnectionFields } from "../privacy";
import { destination, type Scenario } from "./shared";

// Settings > Home: the On/Off choice for each Home rail.
export const settingsHome: Scenario = {
  name: "settings-home",
  async run({ page, remote, capture }) {
    // The Connection panel stays closed, but mask its fields regardless.
    await maskConnectionFields(page);
    await destination(remote, "settings");
    await remote.right("#settings-section-connection");
    await remote.down("#settings-section-display");
    await remote.down("#settings-section-home");
    await remote.right("#home-rail-recently-added");
    await capture.still("settings-home");
  }
};
