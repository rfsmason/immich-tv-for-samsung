import {
  asset,
  destination,
  nav,
  reverseOrder,
  sortOrder,
  type Scenario,
  type ScenarioContext
} from "./shared";

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

// Year steps with CH ▲ / CH ▼ (ADR 0017) from the newest month: the rail has
// at most this many year boundaries worth showing.
const yearSteps = 2;

export const photosTour: Scenario = {
  name: "photos-tour",
  video: true,
  async run(context) {
    const { remote, page, guide } = context;
    await destination(remote, "photos");
    await remote.visible(asset);
    await remote.right(asset);
    // Reverse the order, then put it back as it was.
    await reverseOrder(context, "oldest-first");
    await remote.ok(`${sortOrder}[data-sort-order="newest-first"]`);
    await remote.visible(asset);
    await remote.down(asset);
    await remote.visible(bucket(1));
    await guide?.highlight("#photos-timeline-rail", "Right opens the date rail");
    await remote.hold();
    // By month: Down to the second month and OK jumps to its photos.
    await enterTimelineRail(context);
    await remote.down(bucket(1));
    await guide?.highlight(bucket(1), "Up / Down chooses a month · OK jumps");
    await remote.hold();
    await remote.ok("[data-asset-index]");
    await remote.visible(`${bucket(1)}[data-active="true"]`);
    // By year: CH ▼ steps to each older year, and OK jumps there.
    await enterTimelineRail(context);
    for (let step = 0; step < yearSteps; step += 1) {
      await remote.channelDown(
        `${marker}:not([data-bucket-index="${await focusedBucket(context)}"])`
      );
    }
    const year = await focusedBucket(context);
    await guide?.highlight(bucket(Number(year)), "CH ▲ / CH ▼ jumps a year · OK jumps");
    await remote.hold();
    await remote.ok("[data-asset-index]");
    await remote.visible(`${bucket(Number(year))}[data-active="true"]`);
    // Back up through the years to the newest month.
    await enterTimelineRail(context);
    for (let step = 0; (await focusedBucket(context)) !== "0"; step += 1) {
      if (step > yearSteps) throw new Error("Photos tour could not return to the newest year.");
      await remote.channelUp(
        `${marker}:not([data-bucket-index="${await focusedBucket(context)}"])`
      );
    }
    await remote.ok("[data-asset-index]");
    await remote.visible(`${bucket(0)}[data-active="true"]`);
    await remote.back(nav("photos"));
    await remote.up(nav("home"));
    await page.locator("#home-screen").waitFor({ state: "visible" });
  }
};

async function focusedBucket({ page }: ScenarioContext): Promise<string> {
  const index = await page.locator(":focus").getAttribute("data-bucket-index");
  if (index === null) throw new Error("Photos tour lost focus on the date rail.");
  return index;
}
