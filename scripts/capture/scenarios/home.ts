import type { Scenario } from "./shared";
export const home: Scenario = {
  name: "home",
  async run({ remote, capture }) {
    await remote.right('[data-home-rail="recently-added"][data-home-index="0"]');
    await capture.still("home");
  }
};
