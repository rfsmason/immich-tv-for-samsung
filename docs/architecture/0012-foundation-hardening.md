# 0012 - Foundation hardening and structural refactor

Status: accepted (Milestone 11.5). Physical-TV acceptance pending.

## Context

A codebase review on 15 October 2026 found:

- two probable Chromium 63 runtime defects: `Element.toggleAttribute` and CSS `gap`;
- compatibility checked only for syntax;
- requests with no timeout;
- every HTTP 403 reported as a rejected key;
- `Error` details lost from logs;
- no Tizen lifecycle handling and no Back at the application root;
- structural debt: a 3,400-line collection screen, a 1,900-line Home screen, and routing through hand-written hide lists.

People (M12), Search (M13) and Favorites (M14) build on the shared collection and viewer, so this debt was paid first. ADR 0007 (shell) and ADR 0008 (one shared collection, viewer, slideshow and playback path) remain in force.

## Verified platform facts

| Fact | Source |
|---|---|
| Tizen 5.0 (2019 TVs) runs web engine Chromium M63. | Samsung, [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html), Table 1 |
| Hide and resume arrive as the document `visibilitychange` event, read through `document.hidden`; JavaScript is paused while hidden. | Samsung, [Multitasking](https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html) |
| From an app's home page, Return must show an HTML exit confirmation, and the app terminates only on "Yes", via `tizen.application.getCurrentApplication().exit()`. | Samsung, [Terminating Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html) |
| Return closes an open popup. | Samsung, [Development checklist, Common](https://developer.samsung.com/smarttv/develop/development-checklist/common.html), CO-US-05 |
| `getCurrentApplication()` and `exit()` exist since Tizen 2.0 and need no privilege. | Samsung, [Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html) |
| Back (10009) is delivered without key registration. | Samsung, [Remote Control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html) |
| `toggleAttribute`: Chrome 69. `AbortController`: 66. `focus({ preventScroll })`: 64. `gap`: grid 66, flexbox 84. `inset`: 87. `aspect-ratio`: 88. `:focus-visible`: 86. `:is()`/`:where()`: 88. `:has()`: 105. `clamp()`/`min()`/`max()`: 79. `backdrop-filter`: 76. `visibilitychange`/`document.hidden`: 33 or earlier. | [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) |

Samsung's newer checklist text describes Return on the home page closing the app outright. The Terminating Applications guide requires confirmation. Confirming satisfies both, so the app confirms.

## Decisions

### Compatibility enforcement

The runtime target is declared once, as the `browserslist` entry `chrome 63`, and enforced at three points:

1. **`eslint-plugin-compat`.** Exact-pinned and maintained, run with `lintAllEsApis`. It flags unsupported globals and ES built-ins such as `AbortController` and `Array.prototype.flat`, which esbuild's `chrome63` target never polyfills.
2. **DOM-member denylist.** Verified in this setup: the plugin does **not** flag DOM methods called on element instances (`button.toggleAttribute`) or option bags (`focus({ preventScroll })`). TypeScript's DOM library cannot be version-limited either. So `scripts/check-js-compat.mjs` scans the sources (`npm run lint`) and the built bundle (`npm run check`) for a documented denylist of post-Chrome-63 DOM members. Member names survive minification, so the bundle scan is meaningful.
3. **CSS check.** `scripts/check-css-compat.mjs`, run by lint, fails on:
   - `gap` without `grid-gap`, and flex `gap`;
   - `inset` and `aspect-ratio`;
   - `:focus-visible`, `:is()`, `:where()` and `:has()`;
   - CSS `clamp()`/`min()`/`max()`;
   - `backdrop-filter` without a background.

`tsconfig` keeps `lib: ES2017`, so newer ES built-ins are also type errors. Each check was shown to fail on a deliberate violation.

Grid rules carry an equal `grid-gap`. Flex rows use adjacent visible-sibling margins (`:not([hidden]) ~ :not([hidden])`), so hidden controls never leave stray edge spacing. Tile sizing reads the gap custom property, because Chromium 63 reports grid `columnGap` as `normal`. `focus({ preventScroll })` is kept for newer engines, but scroll is always corrected manually.

### Timeouts

`src/api/immich/http.ts` races every JSON and media request, including the response body, against a central timeout: 20 s for JSON and 30 s for media. Both are injectable through the client and service options. With no `AbortController`, the race rejects and a late response settles nothing. The screens' generation guards still discard stale work.

A distinct `timeout` error kind is used rather than `network` with a detail. The household message differs ("taking too long to respond" rather than "could not reach"), and the diagnosis differs: the server was reached but stalled.

Every screen that shows a loading state reaches an error with Retry and a working Back. An album load gained Retry. A failed page no longer marks itself as loaded, so the next remote movement retries it.

### Error kinds and logging

`AppError` kinds are `invalid-config`, `network`, `timeout`, `api`, `auth` (401: the key is not accepted), `permission` (403), and `invalid-response`.

- Each request names the household capability it serves ("People", "Memories" and so on), so a permission message names it without exposing endpoints or permission identifiers. The Memories statistics special case is now an instance of this mechanism.
- `AppError.cause` is kept for diagnostics only.
- The logger serialises errors explicitly: name, message, a stack bounded to 12 lines, kind, status and feature, and a cause chain bounded to four levels.
- It redacts credential keys and credential query values such as `apiKey=`, and bounds nesting depth.

### Lifecycle and Back

`src/platform/tizen/lifecycle.ts` is the only module that reads `visibilitychange` or calls the Tizen Application API. On hide, composition pauses the slideshow, video and Live Photo motion, including a pending playback start. On return nothing resumes, and focus is restored if the TV dropped it.

The shell sees Back on the rail in the capture phase and reports `onRootBack`. Composition shows an HTML exit confirmation with focus on "Keep browsing"; Exit calls the lifecycle exit, which is harmless in the desktop preview. Unsaved Settings stay guarded. Back inside child screens is unchanged.

### Collection screen decomposition

| Module | Responsibility |
|---|---|
| `collection/collection-model.ts` | Shared collection data and the state unions. |
| `collection/collection-grid.ts` | Windowed tiles, the thumbnail lifecycle, focus and key navigation, paging in both directions, status, empty and error states, and the Back/Refresh and Retry controls. |
| `collection/photos-timeline.ts` | Buckets, the date-section layout, the timeline rail and bucket jumps. |
| `collection/asset-viewer.ts` and `collection/viewer-playback.ts` | The full-screen viewer, slideshow, video and Live Photo playback, and suspension. |
| `album-detail-screen.ts` | A thin composition that keeps the existing `AlbumDetailScreenController` contract. |

Paging lives in the grid controller because the brief scopes it there. A separate `collection-paging.ts`, considered in the draft, would only have split one responsibility across two files.

State unions replace the overlapping flags:

- `CollectionView` is a grid (with asset or timeline focus) or the viewer, so timeline focus cannot coexist with the viewer.
- `CollectionLoad` is idle, loading or failed, and carries the request a Retry repeats. It replaces `loading`, `remoteCollection` and `albumRetry`.
- `CollectionSource` carries its parent and presentation, replacing `viewerOnly` and the duplicated `source.total`.

The interfaces between the parts are narrow:

- **`ViewerCollection`.** The viewer's only view of a collection: assets, current index and selection, total, absolute index, generation, loading state, next and previous paging, viewing-history source, and exit. Any ordered asset list can provide it. Tests drive the viewer through a fake.
- **`GridLayout`.** Plain rows or Photos date sections.
- **`GridRail`.** The Photos timeline rail, attached beside the grid.

All resource bounds, generation guards, focus restoration and viewing-history callbacks are unchanged. There is still one viewer, slideshow and playback lifecycle.

Home is split the same way into `home/` modules: model, loaders, rails, navigation and thumbnails. Albums, Memories, Home and the collection grid share `grid-presentation.ts` for tile sizing, spacers, focus scrolling and media badges.

### Routing

Composition moved from module-level code in `main.ts` into `composeApplication(dependencies)`, so it can be tested with real screens and fake services. `main.ts` only creates the real services and platform adapters.

`createScreenRegistry` holds every mounted screen and provides one `showOnly(id)` operation. A typed `AppRoute` union records:

- a top-level destination, or
- a child route: the Memories browser, an album, a Home collection, or a Memory.

Child routes carry their typed parent, and Back from the collection screen is derived from it. This replaces the nine-state `ActiveScreen`, the separate `memoryParent` and the repeated hide lists.

ADR 0007's shell contract is unchanged. Destinations' `hide` is now a no-op because the registry hides every other screen. There is no router library, event bus or global state.

### Presentation

The Immich client maps responses to domain values only. A timeline bucket keeps its ISO start date and count. A Memory carries its kind, `memoryAt`, person name and year. `src/presentation/` formats bucket labels, years, Memory titles and context lines with unchanged output.

### Tooling

- The production bundle is minified: 318,043 to 145,908 bytes, 37,799 gzipped. `npm run build:debug` or `IMMICH_TV_DEBUG_BUILD=1` gives an unminified bundle for on-TV diagnosis.
- Prettier (exact-pinned) is the enforced formatter. ESLint has no stylistic rules, so it needs no integration shim.
- `happy-dom` (exact-pinned, dev-only) lets screen tests run against the shipped `index.html`.
- `@vitest/coverage-v8` enforces minimums for `src/screens` and `src/app`.
- CI runs typecheck, format check, lint with compatibility checks, tests with coverage, build, static and bundle checks, and Tizen staging.
- Node.js is pinned by `.nvmrc`. Tizen tool versions are recorded in `docs/toolchain.md`.

## Consequences

- **M12 People, M13 Search, M14 Favorites.** A new ordered collection adds a source and loader to the collection model and reuses the grid, the viewer (through `ViewerCollection`), slideshow and playback, with no new media lifecycle. New destinations or child screens register with the screen registry and add a route variant with an explicit parent. Permission errors already name People.
- **Compatibility.** Regressions fail lint or static checks rather than on the TV. Adding a newer DOM API means extending the denylist only after checking Chromium 63 support.
- **Lifecycle.** New media or timers must pause through the collection screen's `suspendPlayback`, or a similar hook wired from composition.
- **Limitations.**
  - The DOM denylist is curated, not exhaustive.
  - The CSS check is rule-level, not a full parser.
  - The viewer still records a visit when paging re-renders the current asset, as before.
  - The `Sep`/`Sept` month abbreviation differs between the viewer and the timeline, as before.
- **Pending.** Physical-TV acceptance of A1-A4, lifecycle, exit and the regression smoke test (see the Milestone 11.5 checklist).
