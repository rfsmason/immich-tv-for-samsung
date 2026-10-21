import { asset, destination, nav, type Scenario, type ScenarioContext } from "./shared";

const marker = "#photos-timeline-rail [data-bucket-index]";
const bucket = (index: number): string => `#photos-timeline-rail [data-bucket-index="${index}"]`;

// The grid opens the RHS rail with Right from the end of any date-section row.
// A short date section can end before the normal six-column row does.
export async function enterTimelineRail({ page, remote }: ScenarioContext): Promise<void> {
  for (let step = 0; step <= 6; step += 1) {
    if ((await page.locator(":focus").getAttribute("data-bucket-index")) !== null) return;
    if (step === 6) break;
    const current = await page.locator(":focus").getAttribute("data-asset-index");
    if (current === null)
      throw new Error("Photos tour lost grid focus before entering the timeline.");
    await remote.right(`[data-asset-index]:not([data-asset-index="${current}"]), ${marker}`);
  }
  throw new Error("Photos tour could not reach the right-hand timeline rail.");
}

export const photosTour: Scenario = {
  name: "photos-tour",
  video: true,
  async run(context) {
    const { remote, page, guide } = context;
    await destination(remote, "photos");
    await remote.visible(asset);
    await remote.right(asset);
    await remote.visible(bucket(1));
    await guide?.highlight("#photos-timeline-rail", "Right opens the date rail");
    await remote.hold();
    await enterTimelineRail(context);
    await remote.down(bucket(1));
    await guide?.highlight(bucket(1), "Up / Down chooses a month · OK jumps");
    await remote.hold();
    await remote.ok("[data-asset-index]");
    await remote.visible(`${bucket(1)}[data-active="true"]`);
    // Re-enter from the newly focused grid row and jump back to the newest month.
    await enterTimelineRail(context);
    await remote.up(bucket(0));
    await remote.ok("[data-asset-index]");
    await remote.visible(`${bucket(0)}[data-active="true"]`);
    await remote.back(nav("photos"));
    await remote.up(nav("home"));
    await page.locator("#home-screen").waitFor({ state: "visible" });
  }
};
