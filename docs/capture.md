# Website screenshot and video captures

**Use only a dedicated demo Immich library containing properly licensed images and consenting, identifiable people. Never use your personal library or personal photos. These files are intended for a public website.** Review every frame before publishing, including filenames, faces, locations and metadata.

This is development tooling for the desktop preview. Playwright's modern Chromium does **not** prove Tizen 5.0 / Chromium 63 compatibility. The physical QE55Q950R remains the integration authority. Captures are not run as a required CI job.

## Setup

Use the project's Node 22.22.0 and project-local dependencies:

```sh
npm ci
npx playwright install chromium
cp .env.capture.example .env.capture
```

Install only Chromium (its headless shell and FFmpeg recorder are included); no global packages or second TypeScript runtime are needed. The pinned `playwright` library is used instead of the test runner because these are small, sequential capture jobs without fixtures, retries or test reports. The existing esbuild compiles capture TypeScript for Node into ignored `.capture-tools/`; the app compiler never imports it.

Fill in `.env.capture` with the demo server URL and API key. Alternatively export `CAPTURE_IMMICH_URL`, `CAPTURE_IMMICH_API_KEY` and `CAPTURE_DEMO_LIBRARY=yes`. Existing environment variables take precedence over the file. Missing credentials fail before building or launching. The demo-library confirmation is required to reduce accidental use of a personal server. The URL must be HTTP(S), without embedded credentials, query parameters or a fragment. TLS verification remains enabled.

The demo key needs read access for the existing app's albums, assets/thumbnails, timeline, People, Memories and Search calls. See the app's existing connection and permission error guidance. The Settings video tour applies a mandatory recording-only glyph mask to both the URL and API-key fields before navigating to Settings, and verifies the mask is supported before continuing. It remains active even with `--no-highlights` and until the browser context closes. The key is never typed, printed, written to the manifest or placed in a filename. Do not enable Playwright traces, HAR recording or verbose request logs with credentials.

## Demo-library shape

Ordering must stay stable between runs: do not upload, edit, rename or reorder while capturing. Scenarios use positions, not hard-coded IDs, names or image content:

- For `media-tour`, Recently Added must have an ordinary video and a Live Photo among its first six assets. The video needs at least five seconds of playable footage; the Live Photo needs a short playable motion companion (under 20 seconds). Both must decode in desktop Chromium. The tour requires actual decoded motion and fails if only a poster loads.
- For `albums-tour`, the first album in the Albums section must have an ordinary photo and an ordinary video in its first row (up to six items). The video must play in desktop Chromium and last at least five seconds.
- At least two non-empty albums. The **second album as shown on Home** must contain at least three ordinary still photos first in its configured sort order, so the slideshow can advance twice. Include date/time and location metadata if those should appear in the website viewer still.
- Recent uploads, at least **six favourites** and at least **six timeline videos** (ordinary videos, not Live Photo motion clips, which Immich hides) so Home's Recently Added, Favourites and Videos rails, and the first row of each library view, have content. For each rail to end with See more, include at least 19 of each. Recently Viewed starts empty in every scenario; a tour populates it naturally.
- At least **19 visible, named people** with valid face thumbnails, so Home's bounded 18-person rail has a **See more** tile. The first person in the full People grid needs at least one photo, with an ordinary still photo first. That person's search must return at least one asset. For `viewer-faces`, that first photo must have at least one tagged face of a demo person, and the capture API key needs `face.read`; the scenario fails rather than capturing a photo without face tags.
- At least one Memory returned for the pinned date (default **2026-10-19**, UTC), with at least one asset. Prepare a Memory for your chosen date and pass `--date`; changing the browser date cannot manufacture a server-side Memory.
- At least two non-empty monthly timeline buckets for a useful timeline/date-heading still.
- For the Search v2 stills (`search-v2-panel`, `search-place-picker`, `search-album-picker`), some photos need location metadata (country, and region or city), so the place picker lists them. The **first country** in alphabetical order needs at least one region or city below it, so the picker opens a second level showing "Anywhere in <country>". Place names show on screen: use the demo library's own invented or public places, never a home address. `search-album-picker` and `search-v2-panel` choose the first album in the Albums order. `search-v2-panel` also chooses the first person and Photos; its combined criteria need not match any photo, because it captures the panel, not results.
- For representative Home/grid thumbnails, include at least one video and one Live Photo elsewhere in the library, outside the first three photos in the second album and outside the first photo of the first person. The Albums and Memories video demos explicitly start and pause ordinary video playback with the remote. Other scenarios retain their existing behavior; video autoplay is seeded off.

Missing items, failed images, inaccessible screens or unexpected focus cause a failed run instead of silently selecting different content. Check the library shape and permissions first if a scenario times out. There are no credentials or private API response bodies in terminal diagnostics.

## Running

```sh
npm run capture -- --list
npm run capture
npm run capture -- --scenario tour
npm run capture -- --scenario home --scale-factor 2
npm run capture -- --scenario memories --date 2026-10-19
npm run capture -- --scenario tour --interval 8 --port 5174
npm run capture -- --scenario tour --tour-delay 1800 --slide-changes 1
npm run capture -- --scenario tour --no-highlights
npm run capture -- --scenario photos-tour
npm run capture -- --scenario search-tour
npm run capture -- --scenario settings-tour
npm run capture -- --scenario albums-tour
npm run capture -- --scenario memories-tour
npm run capture -- --scenario media-tour
npm run capture -- --dry-run --port 5174
```

Every capture builds fresh output, starts its own preview on the fixed port (default 5173), waits for a successful response, and shuts it down after success, failure or Ctrl+C. A busy port fails; it never attaches to someone else's preview. `--dry-run` builds, starts, checks and stops the preview without credentials, a browser or captures. `--list` needs neither credentials nor an installed browser. Manual `npm run preview` retains its existing port fallback; `PORT` sets its starting port and `PREVIEW_STRICT_PORT=1` disables fallback.

Options:

| Option | Default | Meaning |
|---|---|---|
| `--scenario NAME` | all | One of the names printed by `--list` |
| `--scale-factor 1\|2` | 1 | Always a 1920×1080 CSS viewport; scale 2 produces 3840×2160 PNGs with identical layout |
| `--date YYYY-MM-DD` | 2026-10-19 | Fixed app date at UTC midnight; an ISO UTC timestamp also works |
| `--port NUMBER` | 5173 | Owned loopback preview port; fail if occupied |
| `--interval SECONDS` | 8 | Integer 3–60, seeded through the app's own slideshow settings writer |
| `--tour-delay MILLISECONDS` | 1200 | Extra viewing time after each ready action in videos only; integer 0–10000 |
| `--slide-changes 1\|2` | 2 | Automatic slideshow advances shown in the album tour |
| `--no-highlights` | off | Disable recording-only callouts for clean tour footage |

**Memories seen in a manual preview use the manual preview’s date.** The capture default stays pinned to 19 October 2026 for repeatability. If your demo Memories are for 19 October, run `npm run capture -- --scenario memories --date 2026-10-19`. An attachment timeout can mean there are no Memory tiles for the pinned date; scrolling cannot reveal a tile that the server did not return. The runner prints its effective date and includes it in scenario failures.

The default fixed timestamp is `2026-10-19T12:00:00Z`. Locale is en-GB and timezone is UTC. `page.clock.setFixedTime` pins only `Date`; real timers, animation frames, slideshow intervals, request timeouts and image loading keep running. Do not substitute `clock.install` or `pauseAt`, which can freeze those operations. Stable library ordering, date, locale, viewport, browser version and fonts are prerequisites for repeatable still frames. WebM timing depends on request/render latency and is not byte-identical between runs.

Each scenario gets an entirely fresh context. Storage is seeded before application load using the real connection and app-settings writers through an in-memory adapter, then replayed with `page.addInitScript`. This shares the storage keys and schemas directly; no duplicate schema or storage export is added to the app. Viewing history, screen focus and cookies cannot leak between scenarios.

## Creating demo Memories

The standalone utility writes artificial Memories to Immich, visible to the account in other Immich clients too. Use only a dedicated demo account/library. It requires `CAPTURE_DEMO_LIBRARY=yes`, `CAPTURE_IMMICH_URL` and `CAPTURE_IMMICH_API_KEY` from `.env.capture` or the environment. There is no command-line credential or server override. The key needs permission for [createMemory](https://api.immich.app/endpoints/memories/createMemory) in addition to candidate asset search.

```sh
node scripts/create-demo-memories.mjs --dry-run --seed website
# Review the printed server and planned Memories before authorizing writes:
node scripts/create-demo-memories.mjs --yes --seed website
```

Without `--yes` or `--dry-run`, it prints the target and exits before any API call. Dry-run queries candidate assets but never calls the Memory creation endpoint, including when combined with `--yes`. The plan lists asset IDs and artificial year labels; treat that output as demo metadata. A fixed default seed preserves selection for unchanged candidate ordering; `--seed` overrides it. Re-running writes duplicate Memories.

`--date YYYY-MM-DD` defaults to **2026-10-19**, matching capture. Visibility runs from that day's UTC midnight until the following midnight, independent of when the utility runs. `memoryAt` and year labels derive from that date; labels do not represent actual photo dates. Use the same `--date` for creation and capture when overriding. `--count` (12), `--assets-per-memory` (6) and `--candidate-assets` (200) control the plan size.

## Remote and capture points

Only `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter` and `Backspace` drive the app. Backspace and Escape map to Back on desktop; Backspace in an input, textarea or editable region keeps its normal deletion behaviour. Native Tizen key codes are unchanged. No browser history navigation is used.

The mouse is never moved or clicked. Headless screenshots and recorded page frames exclude the operating-system pointer; no cursor is injected. Video tours can add the recording-only annotations described below; app elements are never restyled. Every press waits for an expected `document.activeElement`, visible images to finish (`complete` and positive `naturalWidth`) and the same-origin Immich proxy requests to settle. A central 350ms delay in `remote.ts` is followed by an observable check that CSS transitions have finished; it does not replace state-based waits. Failed visible images time out rather than being captured as finished.

Existing IDs, `data-home-rail`, `data-home-index`, `data-album-index`, `data-person-index`, `data-asset-index`, `data-place-index`, `.search-place-anywhere`, Search controls, slideshow state attributes and, for Milestone 15, the `#home-rail-*` Settings choices, `#asset-viewer-faces` and `.asset-viewer-face-box` are sufficient; no capture-only hooks were added. Collection headers now have a sort order button above the grid's first row; no scenario presses Up from a first row, so none moved. The Albums, Memories and media tours also read the grid's existing media badges (`.asset-video-badge`, `.asset-live-photo-badge`) and the viewer's playback attributes (`data-media-kind`, `data-play-state`, `data-player-state`). `scripts/capture/scenarios/demo-hooks.test.ts` checks those badges against the app's own rendering and every element ID the tours use against `index.html`, so a renamed hook fails in CI instead of during a capture.

Available still scenarios: `home`, `photos-timeline`, `albums`, `album-grid`, `viewer-image`, `people`, `person`, `memories`, `favorites`, `videos`, `recently-added`, `search`, `search-v2-panel`, `search-place-picker`, `search-album-picker`, `settings-home`, `settings-ambient`, `ambient-clock`, `viewer-faces`. `settings-home` opens Settings > Home with its rail choices (the Connection fields stay masked). `settings-ambient` opens Settings > Ambient. `ambient-clock` turns photo details on, starts ambient mode, captures it with its clock (the pinned capture time) and details once a picture shows, and returns with a key; ambient mode draws demo photos at random, so the picture varies between runs, and the details show each photo's date and place. `viewer-faces` opens the first person's first photo and turns Faces on. `favorites`, `videos` and `recently-added` reach their Home rail by remote and open its first item in the library view's grid. Home has seven rails, in the order Recently Added, Favourites, Videos, People, Recently Viewed, Albums, Memories. Search writes two stills, criteria and results. `search-v2-panel` sets a person, Photos as the asset type (OK opens its list), the first country (Anywhere in it) and the first album, and captures the panel focused on Show photos. `search-place-picker` captures the place picker one level into the first country; `search-album-picker` captures the album picker with the first album selected. Back from a Search picker now lands on that picker's row (ADR 0018), so `search` and `search-tour` move Down to Show photos. `memories` opens a Memory from Home into its collection grid. Video scenarios:

- `tour`: Home → second album → viewer → two slideshow advances → grid → Home.
- `people-tour`: Home → People rail → See more → first person → viewer → People → Home.
- `photos-tour`: Photos grid → Right to the RHS timeline rail → Down to the second month → OK jumps to its photos → re-enter the rail → Up to the newest month → jump → Home. Requires at least two non-empty monthly buckets. It uses row-end navigation and supports short date-section rows.
- `search-tour`: first person → From and To date steppers → matching results → criteria restored → Home. From uses the oldest library month's first day; To uses the pinned capture date, so the range is repeatable and includes existing demo photos through that date. The tour demonstrates day/month/year navigation and editing without hard-coded names, IDs or library dates. The first person's photos must fall within that range.
- `albums-tour` — **Immich TV for Samsung – Albums Demo**: open Albums from the navigation rail → browse the first two album cards → open the first album → browse the asset grid → open a photo → return to the grid → open, play and pause a video → Back to Albums and Home.
- `memories-tour` — **Immich TV for Samsung – Memories Demo**: reach Memories on Home using vertical remote navigation → browse Memory cards horizontally → open the first Memory → browse its assets and open them on the big screen → Back restores the originating Home tile. Requires at least two Memories for the pinned date. The first Memory needs an ordinary photo and video in its first row (a playable clip at least five seconds long), or at least two ordinary photos. It plays and pauses a clip when available; photo-only Memories show two photos instead. This fallback reflects the collection's actual media, without inserting content from another source.
- `media-tour` — **Immich TV for Samsung – Videos & Live Photos Demo**: Home Recently Added → collection → video → OK to play → three seconds of actual playback → pause → grid → Live Photo → OK to play its motion once → original still returns → grid → Home, focused on the originating Recently Added tile. It detects both kinds from the existing media badges, without hard-coded asset IDs or names. A motion observer starts before the Live Photo play press and skips its editorial pause so a short clip cannot be missed; readiness and viewing holds resume after the still returns.
- `settings-tour`: Connection fields (masked) → Display toggles → slideshow interval (OK opens its list, shown and then closed with OK on the seeded interval) → Save → Home. It changes only the fresh capture context's local preferences, never server data or another browser's settings. It does not reveal the key or test/edit credentials; masking cannot be disabled by `--no-highlights`.

## Tour pacing and highlights

Video tours hold Home initially and add 1.2 seconds after each action has reached its expected focus and finished loading. `--tour-delay` adjusts this editorial viewing time independently of the app's slideshow interval. Stills keep their existing speed. These holds are added after readiness checks, never used instead of them.

The album tour shows two slide changes by default, or one with `--slide-changes 1`, then pauses immediately on the final advance before waiting for image decoding or adding a viewing hold. Starting the slideshow skips the editorial hold so watching the first interval begins promptly.

While the slideshow is running without remote actions, a yellow ring and “Next photo countdown” caption highlight the progress bar. The progress-bar bounds come from the slideshow button's existing `::after` pseudo-element. The newer tours use the same helper to explain the RHS date rail, date steppers and settings controls. This is an annotation added to the recording, not a TV feature: it does not change the app's layout, countdown, styling or focus. Settings additionally masks connection-field glyphs for privacy, while preserving their actual values and keyboard behavior. The overlay ignores pointer input and is hidden from accessibility; it disappears before the next remote press, before any still capture, and on cleanup. Use `--no-highlights` for clean video footage. No overlay source or styling reaches the app bundle or widget.

To annotate another idle section in a video scenario:

```ts
await context.guide?.highlight("#some-existing-control", "What to notice");
// Wait for an observable app event here. The next remote action clears it.
```

`guide` is supplied only for video scenarios when highlights are enabled. Prefer a short label and avoid covering the area being explained. The helper adds a separate overlay; do not mutate application elements for recording.

## Outputs and packaging

Output is ignored under `captures/YYYY-MM-DD_HHMMSS/` (UTC):

```text
home.png
search-criteria.png
search-results.png
tour.webm
people-tour.webm
photos-tour.webm
search-tour.webm
settings-tour.webm
albums-tour.webm
memories-tour.webm
media-tour.webm
manifest.json
```

PNGs use the selected density. Videos always use Playwright context recording at 1920×1080 WebM, finalized after context close. V1 retains the short blank/startup lead-in and the keyboard navigation into the first screen; trim it manually when preparing website material. Playwright video is suitable for drafts. OBS recording of the same keyboard sequence can provide higher quality and frame rate for publication. OBS automation, automatic captions, automatic trimming and contact sheets are deferred.

The manifest contains completed/failed scenario names, output filenames, viewport, scale, video size, fixed date, locale/timezone, slideshow interval, tour pacing/change count/highlight options, git commit, app version and numeric Immich server version, obtained using the existing integration call through the preview proxy. It never contains the server URL, key or personal library metadata. Failed video recordings are removed; review any stills and their manifest status before use. Separate runs in the same second are refused to prevent overwriting output.

Capture sources, compiled capture entry points, output, environment files and Playwright artifacts are ignored or confined to development tooling. The static app check enforces a file allowlist for `dist/` and rejects capture/Playwright identifiers in the production bundle. Packaging still stages its original **six explicit runtime files**; `dev-preview.js` remains desktop-only. Capture TypeScript is included in `npm run typecheck`, lint and formatting, but excluded from the app entry point and coverage collection. The small capture-helper unit tests run in Vitest; browser capture jobs do not. CI runs `--list` without any server or browser.

## Adding a scenario

Add a short TypeScript module in `scripts/capture/scenarios/`, export a `Scenario`, and register it in `index.ts`. Use `remote.up/down/left/right/ok/back(expectedFocusSelector)` and `capture.still("name")`. Shared functions handle position-based Home rails, albums and People. `homeRail` first waits up to 15 seconds for the target tile to be attached, then enters Home with Right and checks focused rail membership after each Down press (at most five Down presses for the six Home rails). The target need not be visible before navigation; the app brings it into view as focus moves. Inspect observable app state with locators; never click, call application routing functions, reorder responses or inject application logic. Add any required library shape here. Keep capture filenames static and free of library content. Each scenario starts on Home with the Home navigation button focused.

Run the normal project checks, `npm run capture -- --list`, `npm run capture -- --dry-run`, then one still and a tour against your demo library. Real demo captures and review of every published frame remain necessary even when local checks pass.

## Official Playwright references

- [Browser launch](https://playwright.dev/docs/api/class-browsertype#browser-type-launch) and [context viewport, deviceScaleFactor and recordVideo](https://playwright.dev/docs/api/class-browser#browser-new-context)
- [Keyboard presses](https://playwright.dev/docs/api/class-keyboard#keyboard-press)
- [Init scripts](https://playwright.dev/docs/api/class-page#page-add-init-script)
- [Video size and finalization](https://playwright.dev/docs/videos) and [video.saveAs](https://playwright.dev/docs/api/class-video#video-save-as)
- [Style injection](https://playwright.dev/docs/api/class-page#page-add-style-tag) and [text-security masking](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-text-security) for the mandatory Settings-recording privacy mask
- [Locator bounds](https://playwright.dev/docs/api/class-locator#locator-bounding-box) and [page evaluation](https://playwright.dev/docs/api/class-page#page-evaluate) for recording-only annotations
- [Date-only fixed time](https://playwright.dev/docs/api/class-clock#clock-set-fixed-time)

The capture-only transition wait uses the modern browser’s [Document.getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations) and [Animation.playState](https://developer.mozilla.org/en-US/docs/Web/API/Animation/playState). These APIs are confined to capture tooling and are never shipped to Tizen.
