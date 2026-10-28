import type { Page } from "playwright";
import type { Remote } from "../remote";
import type { TourGuide } from "../tour-guide";

export type Capture = { still(name: string): Promise<void> };
export type ScenarioContext = {
  page: Page;
  remote: Remote;
  capture: Capture;
  interval: number;
  slideChanges?: 1 | 2 | 3;
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
export const sortOrder = "#collection-sort-order";
export const faces = "#asset-viewer-faces";

export const searchControl = (name: string): string => `[data-search-control="${name}"]`;

// Search's rows from People down, as their first control is with nothing
// chosen below People (Taken, Place, Albums, then Show photos).
const searchColumnZero = ["add-people", "from", "choose-place", "add-albums", "show"];

// Moves Down the Search panel's first column to Show photos, from a row
// whose first control is `from` and with no place or albums chosen.
export async function toShowPhotos(remote: Remote, from: string): Promise<void> {
  for (const control of searchColumnZero.slice(searchColumnZero.indexOf(from) + 1)) {
    await remote.down(searchControl(control));
  }
}

// The position of the item with this name among those rendered, read from
// the screen so a tour can name its demo choices (docs/capture.md). The name
// is the item's text, or its `label` element's text when it has one.
export async function indexOfName(
  page: Page,
  items: string,
  attribute: string,
  name: string,
  label?: string
): Promise<number> {
  const index = await page.evaluate(
    ({ items, attribute, name, label }) => {
      const match = Array.from(document.querySelectorAll(items)).find((item) => {
        const text = (label && item.querySelector(label)) || item;
        return text.textContent?.trim() === name;
      });
      return match?.getAttribute(attribute) ?? null;
    },
    { items, attribute, name, label }
  );
  if (index === null) throw new Error(`The demo library has no "${name}" here.`);
  return Number(index);
}

// Moves focus from one grid position to another, a row at a time and then
// along the row, as the remote would.
export async function moveInGrid(
  remote: Remote,
  item: (index: number) => string,
  from: number,
  to: number,
  columns: number
): Promise<void> {
  const row = (index: number) => Math.floor(index / columns);
  let at = from;
  while (row(at) !== row(to)) {
    const down = row(to) > row(at);
    at += down ? columns : -columns;
    await (down ? remote.down : remote.up)(item(at));
  }
  while (at !== to) {
    const right = to > at;
    at += right ? 1 : -1;
    await (right ? remote.right : remote.left)(item(at));
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

// Opens the album at this position on Home's Albums rail.
export async function homeAlbum(context: ScenarioContext, index: number): Promise<void> {
  const { remote } = context;
  await homeRail(context, "albums");
  await remote.visible(homeTile("albums", index));
  for (let tile = 1; tile <= index; tile += 1) {
    await remote.right(homeTile("albums", tile));
  }
  await remote.ok(asset);
  await remote.visible("#album-assets-grid .asset-thumbnail");
}

export const secondAlbum = (context: ScenarioContext): Promise<void> => homeAlbum(context, 1);

// From a collection's first item: Up to the sort order button, OK to reverse
// the order. Focus stays on the button.
export async function reverseOrder(
  { remote, guide }: ScenarioContext,
  to: "newest-first" | "oldest-first"
): Promise<void> {
  await remote.up(sortOrder);
  await guide?.highlight(sortOrder, "OK reverses the order");
  await remote.hold();
  await remote.ok(`${sortOrder}[data-sort-order="${to}"]`);
  await remote.visible(asset);
}

// From the viewer's Slideshow button: Down to Faces and OK to show the tags.
export async function showFaces({ remote, guide }: ScenarioContext): Promise<void> {
  await remote.down(faces);
  await remote.ok(`${faces}[aria-pressed="true"]`);
  await remote.visible("#asset-viewer-face-overlay .asset-viewer-face-box");
  await guide?.highlight("#asset-viewer-face-overlay", "Faces shows who is in the photo");
  await remote.hold();
}

// During a slideshow or video the viewer's buttons hide after a few seconds,
// and the key that shows them does nothing else (viewer-autohide.ts). OK
// pauses, pressed once more if the first press only showed the buttons.
export async function okToPause(
  { page, remote }: Pick<ScenarioContext, "page" | "remote">,
  control: string,
  paused: string
): Promise<void> {
  await remote.ok(control, { pauseAfter: false });
  if ((await page.locator(paused).count()) === 0) await remote.ok(control, { pauseAfter: false });
  await remote.visible(paused);
  await remote.hold();
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
