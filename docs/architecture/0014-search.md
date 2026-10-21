# 0014 - Search v1

## Context

Search has been a top-level destination with a placeholder since Milestone 8. Milestone 13 adds remote-first search by one or more people, a date from and a date to, and combinations of them. There is no keyboard, so there is no text entry or on-screen keyboard. The app stays read-only and needs Immich v3.2.0 or later. ADR 0013 lists what the People milestone left for reuse; ADR 0012 sets the pattern for new collections and child screens. The target remains Tizen 5.0 / Chromium 63.

## Decision

### Criteria model

- `src/domain/search.ts`: `SearchCriteria = { people: SearchPerson[]; takenFrom: CalendarDate | null; takenTo: CalendarDate | null }`.
  - `SearchPerson` is `{ id, name }`.
  - `CalendarDate` is `{ year, month, day }`, a local calendar date rather than a `Date`, so the UI has no time-zone surprises.
- Pure helpers cover emptiness, the number of set criteria, range validity (From ≤ To), add, remove and set operations, month lengths, leap years and next-day stepping.
- A later criterion (location, media type, album, Favourites) adds one field, its helpers, one line in the filter mapper and one row in the panel. There is no generic expression tree or query builder.
- **People semantics: all.** Every selected person must appear in a result (`personIds.all`), which is what "photos of Mum and Dad" usually means. The panel says so in plain words: "Photos with all of these people". There is no any/all toggle in v1. Selection is capped at ten people.
- **Date semantics.**
  - From is inclusive from the start of that local day.
  - To is inclusive to the end of that local day, sent as `lt` the start of the next day.
  - Dates are never swapped; a reversed range is explained ("From must be on or before To") and Show photos stays unavailable.

### Search request

- `src/api/immich/search-filter.ts` maps criteria to a structured filter:
  - `personIds.all` when people are chosen;
  - `takenAt.gte` and `takenAt.lt` when dates are set;
  - always `trashedAt: { eq: null }` and `visibility: { eq: "timeline" }`, as Photos and People do.
- `ImmichClient.searchAssetsPage` sends it through `buildFilteredSearchBody`: cursor paging only, `fileCreatedAt` descending (the same column `takenAt` filters, so ordering and range agree), and 120 per page. Screens never build request bodies.
- **No result count.** `POST /search/statistics` would give a count, but it needs the `asset.statistics` API-key permission. The app otherwise needs only asset read and People read, so it isn't called. The results header shows the criteria without a count.
- A 403 uses the `permission` error kind naming "Search"; the existing request timeouts apply.

### Search panel (`src/screens/search/search-screen.ts`)

- There is no large "Search" heading, since the rail already says where you are. Three rows sit inside the safe area:
  - **People:** `+ Add people`, then chips with a face and a name. The first four show, followed by `+N more`. OK on a chip removes that person.
  - **Taken:** From and To read "Any date" or a UK date ("16 Oct 2026").
  - **Actions:** Show photos, plus Clear all once anything is set.
- Up/Down move between rows (keeping the column where possible) and Left/Right within a row. Left from a row's first control, or Back, reaches the rail.
- Initial focus is Add people when no criteria are set and Show photos otherwise. Returning from the picker or results lands on Show photos.
- Show photos is `aria-disabled` until at least one criterion is set and the range is valid. With no criteria, the panel explains what to pick and points plain browsing to Photos.
- Clear all clears immediately when one criterion is set and asks first ("Clear all of these choices?", focused on Keep them) when several are.
- Criteria live in memory for the session: leaving Search and coming back keeps them. They are not stored, and saving connection settings clears them.
- Chip faces use the People thumbnail endpoint, at most four at a time, and are revoked when a chip goes, on hide and on reset. Stale results revoke their own URL.

### Date stepper

`src/screens/search/date-stepper.ts` is a pure model, and the panel renders it inline below the date row.

- **Columns:** day, month and year in UK order, then a Clear action.
- **Keys:**
  - Left/Right move between columns.
  - Up raises the value and Down lowers it.
  - OK sets the date (on Clear it returns the date to Any date).
  - Back cancels without changing anything.
- **Values:** days wrap within the real month length, including leap years. Months wrap, and the day is kept valid (31 Jan becomes 28 or 29 Feb). Years stop at the bounds.
- **Defaults:** To starts at today. From starts at the first day of the library's oldest timeline month.
- **Year bounds:** from the oldest timeline month to the current year, using `GET /timeline/buckets` (already used by Photos, requested once per session). Without it, the last hundred years are offered.
- There are no timers, key repeat or native pickers: each press is one step.

### People picker (`src/screens/search/people-picker-screen.ts`)

- A child of Search with route `{ kind: "search-people"; parent: "search" }`, registered with the screen registry.
- The People browser's screen logic was extracted into `src/screens/people/people-grid.ts`: paging, retention, windowing, faces, states and remote navigation. Each screen supplies what OK does, optional controls above the grid and card decoration. The People browser became a thin wrapper, and its existing tests and the routing tests passed unchanged. The one deliberate change: after Retry, focus moves to the status line instead of staying on the now-hidden Retry button.
- Paging and retention match the People browser (30 per page, at most four pages, a windowed DOM and the shared thumbnail queue). Only the People read permission is needed.
- OK toggles a person. A selected card has a green ring and a check mark, so the state doesn't rely on colour alone, and stays selected through eviction and reload.
- Done ("Done (2 selected)") sits above the grid, reached by Up from the first row. **Back keeps the selection, just as Done does**, because cancelling a multi-select by accident would be frustrating on a remote. Trying to pick an eleventh person explains the limit.

### Results

- Show photos opens a typed `search` feed (carrying the criteria) in the shared collection, with route `{ kind: "search-results"; parent: "search" }`. There is no search-specific grid or viewer; images, video, Live Photos, slideshow and lifecycle pause use the existing paths.
- The header is a short summary, for example "Rory & Sam · From 1 Jul 2012" or "3 people · 1 Jan 2020 – 31 Dec 2020".
- Empty results read "No photos match. Try fewer people or a wider date range.", and the Back control reads "Back to Search".
- Viewer Back returns to the last viewed asset; grid Back returns to Search on Show photos with the criteria unchanged. A new search starts a new collection generation, so a slower earlier result is dropped.
- Viewing history records a `search` source kind (title only, not the criteria), a backward-compatible extension of the version 1 store. Older entries still load.

## API behaviour verified on 16 October 2026

Against Immich `main` at `e5094d5` and release v3.3.3:

- **Structured filters** ([search.dto.ts](https://github.com/immich-app/immich/blob/main/server/src/dtos/search.dto.ts)):
  - `personIds` takes `any`, `all` or `none`, each a non-empty array of UUIDv4s (`IdsFilterSchema`);
  - `takenAt`, `createdAt` and `updatedAt` take `eq`, `ne`, `gt`, `gte`, `lt` and `lte`, as ISO 8601 date-times with offset (`isoDatetimeToDate`, [validation.ts](https://github.com/immich-app/immich/blob/main/server/src/validation.ts));
  - `trashedAt` is nullable;
  - the filter is a strict object, so unknown keys are rejected, and its fields combine as AND, with an optional `or` array of branches;
  - deprecated flat fields can't be combined with `filter`/`orderBy`/`cursor`.
- **People semantics** (`idsPredicates`, `personIdsPredicates`, `visibleFaces`, [database.ts](https://github.com/immich-app/immich/blob/main/server/src/utils/database.ts)):
  - `any` is an asset with a visible, non-deleted face of at least one listed person;
  - `all` is an asset whose faces cover every listed person, by distinct `personGroupId` count; a single id is treated as `any`;
  - `none` excludes the listed people.
- **Dates and time zones:**
  - `takenAt` filters `asset.fileCreatedAt` (`branchPredicates`), which is a UTC instant. It is not `localDateTime`, the photo's own wall-clock time.
  - The client therefore converts a calendar day to the instants between this TV's local midnight and the next (`new Date(y, m - 1, d).toISOString()`).
  - **Edge cases:**
    - A photo taken in another time zone is placed by when it happened in the TV's zone. A holiday photo taken at 23:30 local time abroad can fall on the adjacent day.
    - On a day with a clock change, the range follows that day's actual length.
    - Where midnight doesn't exist on a clock-change day, JavaScript uses the first valid time.
  - Ordering uses `fileCreatedAt` too (`withSearchOrder`), so results and range agree.
- **Statistics:** `POST /search/statistics` takes a structured `filter` and returns only `total` (`StatisticsSearchSchema`, `SearchStatisticsResponseSchema`). It needs `Permission.AssetStatistics`, while `POST /search/metadata` needs `Permission.AssetRead` ([search.controller.ts](https://github.com/immich-app/immich/blob/main/server/src/controllers/search.controller.ts)).
- **Paging:** the structured cursor is an offset with an `id` tie-break, and trashed assets aren't excluded unless filtered (`searchMetadataV3`, [search.service.ts](https://github.com/immich-app/immich/blob/main/server/src/services/search.service.ts); `searchAssetBuilder`, database.ts).

## Consequences and resource bounds

- No framework, date library, router, dependency, text input or native date control was added. The CSS uses sibling margins, not flex `gap`; the compatibility checks pass.
- Search keeps one small criteria object and at most four chip faces. The picker holds at most 120 people's metadata, 42 cards and about 54 faces. Results use the shared windowed grid and viewer.
- No new timers or media were added. Faces and pages are released on hide, reset and destroy, and stale completions are revoked or dropped by generation.
- Physical Q950R acceptance is pending, together with Milestone 12's.
