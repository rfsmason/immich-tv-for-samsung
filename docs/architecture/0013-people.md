# 0013 - First-class People

## Context

Home's People rail showed at most 18 people with no way to see the rest. Milestone 12 adds a People destination using Immich's existing face recognition. The TV client stays read-only: naming, merging, hiding and editing people remain in Immich. ADR 0012 sets the pattern: a new ordered collection reuses the shared grid, viewer (`ViewerCollection`), slideshow and playback with no new media lifecycle, and a new child screen registers with the screen registry and gets an `AppRoute` variant with an explicit parent. The target remains Tizen 5.0 / Chromium 63.

## Decision

- **Placement.** People is a child destination of Home, exactly as Memories is. The People rail's See more tile opens it. It is not added to the permanent left rail; promoting it later is a user decision if TV use shows that is better.
- **Browser.** A six-column grid of circular faces, each above a name sized for the sofa and truncated with an ellipsis. Favourite people carry a small heart marker. Initial focus is the first person. Loading, empty ("No people yet…"), error and timeout states stay remote-operable, with Retry only after a failure. Left at a row start hands focus to the shell, and Back returns to Home's See more tile.
- **Paging and retention.** The browser asks for 30 people per page (five rows), loads the next page when focus is within two rows of the loaded end and the previous page within two rows of the start, and retains at most four pages (120 people). The DOM is windowed (two rows before and four after focus, at most 42 cards), and faces are retained three rows before and five after focus through the shared thumbnail queue, with at most eight requests at once. Evicted pages reload when the user moves back. The opened card's page is always retained, so returning from a person restores focus to that card.
- **Shared helper.** The Memories browser's numbered-page window (load in either direction, skip items already shown, evict the page furthest from focus and reload it on the way back) is now `src/screens/page-window.ts`, used by both browsers. Memories was characterised first with an exact page-sequence test, which is unchanged. Each browser keeps its own request, end-of-list and status rules: Memories bounds pages with today's statistics count and scans server-emptied pages, while People ends at the page Immich reports has no successor. The retention count must exceed the pages a load can be triggered from, as both browsers' does. No generic browser framework was built.
- **Person collection.** Opening a person, from the rail or the browser, uses the shared collection's person `feed` source, paged by structured search cursor (`filter.personIds.any`, not trashed, timeline visibility, newest first, 120 per page). There is no person-specific grid or viewer, and the header shows the person's name with no asset count.
- **Routes.** `{ kind: "people" }` has Home as parent. `{ kind: "person"; parent: "home" | "people" }` replaces the person's use of the generic `home-collection` route. Grid Back returns to the originating Home tile or People card, and viewer Back returns to the last viewed asset. The grid's Back control reads "Back to Home" or "Back to People".
- **History.** Viewing history records a `person` source kind, a backward-compatible extension of the version 1 store like Milestone 11's `memory`. Entries of every earlier kind still load.
- **Permissions.** People needs only the People read permission (`person.read`), used by `GET /people` and `GET /people/{id}/thumbnail`, plus the asset read access the rest of the app already needs. `GET /people/{id}/statistics` needs a separate `person.statistics` permission and is not called. A 403 uses the existing `permission` error kind naming People.
- **Domain.** `Person` is `{ id, isFavorite, name }` with `name: null` for an unnamed person; `src/presentation/person-labels.ts` shows "Unnamed person". `PeoplePage` adds `page`, `total` and `hasMore`. Raw DTOs stay in `src/api/immich/dto.ts`, `validators.ts` and `mappers.ts`. The unused `faceAssetId` was removed, since current Immich no longer returns it.

## API behaviour verified on 16 October 2026

Checked against Immich `main` at `e5094d5` (16 October 2026) and the latest release, v3.3.3:

- `GET /people` takes `page` (integer, at least 1, default 1), `size` (1-1000, default 500), `withHidden`, `closestPersonId` and `closestAssetId`, plus newer `sharedById`, `sharedWithId`, `isFavorite`, `isHidden` and `name` filters this client does not send. The client always sends `page`, `size` and `withHidden=false`. (`PersonSearchSchema`, [person.dto.ts](https://github.com/immich-app/immich/blob/main/server/src/dtos/person.dto.ts))
- The response has `people`, `total`, `hidden` and an optional `hasNextPage`, marked "TODO: make required after a few versions". The client requires `total`, treats `hasNextPage` as optional, and falls back to `page * size < total`. (`PeopleResponseSchema`, same file)
- Paging is offset-based: `skip = (page - 1) * size`, fetching `size + 1` rows to decide `hasNextPage`. (`PersonService.getAll`, [person.service.ts](https://github.com/immich-app/immich/blob/main/server/src/services/person.service.ts); `getAllForUser`, [person.repository.ts](https://github.com/immich-app/immich/blob/main/server/src/repositories/person.repository.ts))
- Ordering: hidden last, favourites first, then named before unnamed, then face count descending, then name, then creation date. The client preserves this order and does not re-sort. (`getAllForUser`)
- Hidden people are excluded unless `withHidden` is set, or an explicit `isHidden` filter is sent. (`getAllForUser`)
- Unnamed people appear only with at least the user's `people.minimumFaces` preference (default 3) of visible faces on timeline assets; named people always appear. Face counts include partners' assets and shared albums. (`getVisiblePeopleQuery`, same repository)
- A person has `id`, `name`, `birthDate`, `thumbnailPath`, `isHidden`, optional `isFavorite`, `color` and `updatedAt`, plus `otherPeople`, `sharedBy` and `sharedWith`. There is no `faceAssetId`. (`PersonResponseSchema`, `mapPerson`)
- **`personGroupId`.** `mapPerson` returns `id: person.personGroupId`. That group id is also what `GET /people/{id}/thumbnail` takes (`getThumbnail(auth, personGroupId)`, falling back to a shared thumbnail, 404 when none), and what the structured search `personIds` filter matches (`asset_face.personGroupId`, `personIdsPredicates`, [database.ts](https://github.com/immich-app/immich/blob/main/server/src/utils/database.ts)). The id from `GET /people` therefore works for both, and the client uses it unchanged.
- Permissions: `GET /people` and the thumbnail need `person.read`; `GET /people/{id}/statistics` needs `person.statistics`. ([person.controller.ts](https://github.com/immich-app/immich/blob/main/server/src/controllers/person.controller.ts))
- Structured search (`filter`/`orderBy`/`cursor`) was added in v3.2.0 and rejects deprecated flat fields combined with it. Its cursor is an offset with an `id` tie-break for stable pages. It does not exclude trashed assets unless `trashedAt` is filtered, so album, person, Favourites and Photos searches all send `trashedAt: { eq: null }`. A page's `assets.total` is its own item count. (`withShapeExclusivity`, [search.dto.ts](https://github.com/immich-app/immich/blob/main/server/src/dtos/search.dto.ts); `searchMetadataV3` and `mapResponse`, [search.service.ts](https://github.com/immich-app/immich/blob/main/server/src/services/search.service.ts); `searchAssetBuilder` and `withSearchOrder`, database.ts)

## Reuse for Milestone 13 (Search)

Search needs a remote-friendly picker for one or more people. It should reuse, without copying browser code:

- `createPersonCard` and `setPersonCardFace` in `src/screens/people/person-card.ts`, adding its own selected state;
- `AlbumService.loadPeoplePage` and the `Person` / `PeoplePage` domain model;
- `createPageWindow` and the generic thumbnail queue, if the picker pages.

The person `feed` search body (`filter.personIds`) is the starting point for Search's person criterion.

Milestone 13 update: the Search people picker reuses the person card with a selected state (a check mark and a green ring). The People browser's screen logic is now the shared `src/screens/people/people-grid.ts`, which both the browser and the picker use, along with `loadPeoplePage`, the page window and the thumbnail queue ([ADR 0014](0014-search.md)). The People browser's behaviour is unchanged, except that focus now waits visibly on the status line while Retry reloads.

## Consequences

- No framework, router library, dependency or extra media engine was added. Faces use `border-radius: 50%` with `overflow: hidden`; the CSS compatibility check passes.
- Memory is bounded independently of library and people count: at most 120 people's metadata, 42 cards and about 54 faces in the browser, plus Home's 18-person rail. A person's collection uses the existing windowed grid and viewer.
- Faces and pages are released on hide, reset (including a connection change) and destroy. Stale page loads are dropped by generation, and stale faces revoke their own URLs. Completions never move focus unless the browser already owns it.
- Physical Q950R acceptance of the browser, person collections and long-running resource use is pending.
