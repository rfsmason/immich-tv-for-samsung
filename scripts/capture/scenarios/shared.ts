import type { Page } from "playwright";
import type { Remote } from "../remote";
import type { TourGuide } from "../tour-guide";

export type Capture = { still(name: string): Promise<void> };
export type ScenarioContext = {
  page: Page;
  remote: Remote;
  capture: Capture;
  interval: number;
  slideChanges?: 1 | 2;
  guide?: TourGuide;
};
export type Scenario = {
  name: string;
  video?: boolean;
  run(context: ScenarioContext): Promise<void>;
};

export const nav = (destination: string): string => `[data-destination="${destination}"]`;
export const homeTile = (rail: string, index = 0): string =>
  `[data-home-rail="${rail}"][data-home-index="${index}"]`;
export const asset = '[data-asset-index="0"]';
export const person = '#people-grid [data-person-index="0"]';
export const slideshow = "#asset-viewer-slideshow";

export const searchControl = (name: string): string => `[data-search-control="${name}"]`;

// Search's rows from People down, as their first control is with nothing
// chosen below People (Taken, Type, Place, Albums, then Show photos).
const searchColumnZero = ["add-people", "from", "type:all", "choose-place", "add-albums", "show"];

// Moves Down the Search panel's first column to Show photos, from a row
// whose first control is `from` and with no place or albums chosen.
export async function toShowPhotos(remote: Remote, from: string): Promise<void> {
  for (const control of searchColumnZero.slice(searchColumnZero.indexOf(from) + 1)) {
    await remote.down(searchControl(control));
  }
}

// All scenarios begin on Home with the Home nav button focused.
export async function destination(
  remote: Remote,
  name: "photos" | "albums" | "search" | "settings"
): Promise<void> {
  await remote.down(nav("photos"));
  if (name === "photos") return;
  await remote.down(nav("albums"));
  if (name === "albums") return;
  await remote.down(nav("search"));
  if (name === "search") return;
  await remote.down(nav("settings"));
}

export async function homeRail({ page, remote }: ScenarioContext, rail: string): Promise<void> {
  // Home brings rails into view as remote focus moves. The target only needs
  // to be attached before navigation, including when its data loads later.
  await remote.attached(homeTile(rail));
  await remote.right("[data-home-rail][data-home-index]");
  for (let index = 0; index < 7; index += 1) {
    const current = await page.locator(":focus").getAttribute("data-home-rail");
    if (current === rail) return;
    if (index === 6) break; // Seven rails: at most six Down presses.
    await remote.down(`[data-home-rail]:not([data-home-rail="${current}"])`);
  }
  throw new Error("Required demo Home rail was not reachable.");
}

export async function secondAlbum(context: ScenarioContext): Promise<void> {
  const { remote } = context;
  await homeRail(context, "albums");
  await remote.visible(homeTile("albums", 1));
  await remote.right(homeTile("albums", 1));
  await remote.ok(asset);
  await remote.visible("#album-assets-grid .asset-thumbnail");
}

export async function viewer({ remote, page }: ScenarioContext): Promise<void> {
  // The first asset must be a still photo; fail rather than silently capturing a video poster.
  await remote.ok(slideshow);
  await remote.visible("#asset-viewer-image");
  if (await page.locator("#asset-viewer-play").isVisible()) {
    throw new Error("The demo collection must start with a still photo.");
  }
}

export async function peopleBrowser(context: ScenarioContext): Promise<void> {
  const { remote, page } = context;
  await homeRail(context, "people");
  const more = "#home-people-rail .home-more-tile";
  await remote.visible(more);
  // Position-based navigation through the bounded rail, including its See more tile.
  const count = await page.locator("#home-people-rail [data-home-index]").count();
  for (let index = 1; index < count; index += 1) {
    await remote.right(homeTile("people", index));
  }
  await remote.focus(more);
  await remote.ok(person);
  await remote.visible("#people-grid .person-face-image");
}

export async function returnHomeFromPeople({ remote }: ScenarioContext): Promise<void> {
  await remote.back(person);
  await remote.back("#home-people-rail .home-more-tile");
  await remote.visible("#home-screen");
}
