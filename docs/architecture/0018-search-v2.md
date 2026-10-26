# 0018 - Search v2

## Context

Search v1 (ADR 0014) finds photos by people and dates. Milestone 16 adds three criteria that still work with only the remote: media type, one place and albums. ADR 0014 planned for this: each criterion is one field and its helpers, one line in the filter mapper and one row in the panel, with no query builder. The app stays read-only, adds no dependency and targets Tizen 5.0 / Chromium 63.

## Decision

### Criteria

`SearchCriteria` gains three fields (`src/domain/search.ts`):

- `mediaType`: `"all" | "photos" | "live-photos" | "videos"`. All clears the criterion.
- `place`: `{ country; state | null; city | null }` or null. A city can be chosen with no region, for a country whose photos have no region.
- `albums`: `SearchAlbum[]` (`{ id, name }`), at most ten, in the order chosen.

Each counts as one criterion for emptiness, Clear all's confirmation and the guidance. All criteria combine as AND.

### Filter mapping (`src/api/immich/search-filter.ts`)

| Criterion | Filter |
| --- | --- |
| Photos | `type: { eq: "IMAGE" }` |
| Live Photos | `type: { eq: "IMAGE" }` and `isMotion: { eq: true }` |
| Videos | `type: { eq: "VIDEO" }` |
| Place | `country`, and `state` and `city` when chosen, each `{ eq }` |
| Albums | `albumIds: { any: [...] }` |

- **Photos means every still image, Live Photos included.** Live Photos only adds the motion test.
- **Albums match any chosen album**, deliberately unlike People's all. The panel says "Photos in any of these albums".
- A refused album search names Albums in its permission error; other refused searches name Search.

### Place suggestions

- `ImmichClient.getPlaceSuggestions(level, parent)` calls `GET /search/suggestions` with:
  - `type=country`;
  - `type=state&country=…`;
  - `type=city&country=…`, plus `&state=…` once a region is chosen.

  `includeNull` stays off.
- Names are kept exactly as Immich stores them, because the filter matches them exactly. Blanks are dropped, duplicates removed, and the rest sorted with `localeCompare` and bounded at 500 (`maxPlaceSuggestions`).
- A 403 names Places. The usual JSON timeout applies.
- The place picker caches each level's names per parent for the session. Saving connection settings or Refresh clears the cache.

### Panel

- **Rows, top to bottom:** People, Taken (From, To and Asset type), Place, Albums, Actions.
- **Asset type** is a drop-down field beside the dates (`asset-type-field.ts`), using the app's shared drop-down (`src/screens/dropdown.ts`):
  - arriving on it with an arrow key opens its list on the current type;
  - Up and Down move through All, Photos, Live Photos and Videos;
  - OK chooses and closes the list, leaving focus on the field;
  - Back closes it unchanged;
  - closed, any arrow moves on and OK opens it again;
  - Left, Right, or Up/Down past either end also close it unchanged, so it never traps focus.

  The list drops down over the rows beneath it, so opening it never moves the panel. The chosen type has a check mark as well as its colour, and the list is a `listbox` with `aria-selected` options. It was first a row of four option buttons; on 26 October 2026 the user asked for a drop-down beside the dates instead, which also saves a row.

  **Settings' slideshow interval uses the same drop-down.** It was a native `<select>` that Left/Right stepped through. The user asked for both fields to behave alike, so it is now the shared drop-down too. `src/screens/dropdown.ts` holds the open/close state, the remote-key mapping and the field and list markup. `search/asset-type-field.ts` adapts it to Search, whose panel re-renders on every change. `settings/settings-dropdown.ts` adapts it to Settings, whose controls stay in the page, so it adds and removes its own list and keeps its value in `data-value`. In Settings, arriving with Up or Down opens the list (including when Up from the first field wraps round to it). An open list takes Back, so Back closes it before it can leave Settings. No native `<select>` remains in the app.
- **Place** is "+ Choose a place" or one chip, for example "Exampleton, Example County, Exampleland". OK on the chip removes the place. To change it, remove it and choose again.
- **Albums** works like People: "+ Add albums", the first four chips, then "+N more", which reopens the picker. OK on a chip removes it.
- **Returning from any picker lands on its own row:** Add people, the place chip (or Choose a place) and Add albums. This replaces ADR 0014's "returning from the picker lands on Show photos". With five rows, landing on Show photos skipped the rows below the picker that the user might want next.
- The panel has one optional hook for this field: `SearchRow.arrive(key)`, called when an arrow key moves focus onto a control, lets a row handle the arrival itself.
- **Fit.** The panel fits 1920×1080 without scrolling in its worst case. Desktop measurement with an invented mock found this case reaches 1080 px exactly:
  - four long-named people chips and "+N more", with the rule line;
  - the date stepper open;
  - a long place;
  - four long-named album chips and "+N more", with the rule line.

  To get there, rows are 26 px apart (was 32), the panel may be 1700 px wide (was 1500) and chip names are capped at 170 px, ellipsised. The full name stays in each chip's spoken label. Moving Asset type beside the dates later removed a row, leaving about 130 px spare.
- The results header joins criteria with " · ", for example "Sam Example · Videos · Exampleton". Past 48 characters, people and albums become counts ("2 people · 3 albums · Videos · Exampleton").
- Empty results now read "No photos match. Try fewer filters or a wider date range."

### Place picker (`src/screens/search/place-picker-screen.ts`)

- A child of Search with route `{ kind: "search-place"; parent: "search" }`.
- **Countries, then regions, then cities.** Below the countries, the first row is "Anywhere in <country>" or "Anywhere in <region>", which chooses the level above. OK on a city chooses it.
- **Empty levels are skipped:**
  - a country without regions lists its cities;
  - a country or region with nothing below it is chosen as it is.
- **Back** goes up one level, back to the name it came from. From the countries it returns to Search with the place unchanged.
- **States:**
  - Loading focuses the status line.
  - Empty reads "No places found. Photos need location data for this."
  - An error reads the error kind's message, with Retry.
  - A level that arrives after Back is dropped.
- **Windowed rows:** only the 14 rows either side of focus exist (at most 29), with spacers standing for the rest.
- **CH+/CH− jump between first letters.** This was optional in the milestone and added because channel keys were already registered.

### Album picker (`src/screens/search/album-picker-screen.ts`)

- A child of Search with route `{ kind: "search-albums"; parent: "search" }`. It behaves like the people picker:
  - OK toggles an album;
  - a selected tile has a green ring and a check mark;
  - Done reads "Done (N selected)", and Back keeps the selection, as Done does;
  - an eleventh pick is explained;
  - the hints read `[OK] Select [Back] Done`.
- `GET /albums` with no parameters returns every album you own or that is shared with you, in the Albums screen's order. The list is loaded once per session and paged through locally, 30 at a time, so only tiles and covers near focus exist. Covers go through the shared bounded thumbnail queue and are revoked on hide.
- **No third grid copy.** The People browser's grid became a generic card grid (`src/screens/card-grid.ts`). Each screen supplies:
  - card creation and labels;
  - a page loader and an image loader;
  - its CSS hooks.

  `people/people-grid.ts` is now its people configuration. The album tile moved out of the Albums screen to `albums/album-tile.ts`. The selection (ring, check mark, Done, cap message) is shared in `search/picker-selection.ts`. People screens behave as before, and their tests are unchanged apart from the check mark's class name (`picker-check`).

## API behaviour verified on 26 October 2026

Against Immich `main` at `c6d1e15`:

- **Suggestions.** `GET /search/suggestions` needs `Permission.AssetRead`.
  - `getSearchSuggestions` returns distinct values that are not null or empty. They come from timeline assets that aren't deleted, owned by you or by partners whose "Show in timeline" is on (`getUserIdsToSearch`).
  - `country` and `state` narrow the query. `state` is only applied when given, so cities can be listed by country alone.
  - There is no limit, hence the client's bound. `includeNull` only appends a null.
- **Live Photos.** `isMotion` matches `asset.livePhotoVideoId IS NOT NULL`.
- **Albums.** `resolveSearchScopeV3` checks `Permission.AlbumRead` on every `albumIds` id. A filter whose top level is album-confined (`isAlbumConfined` / `isFullyAlbumConfined`) skips the owner predicate. A search with albums therefore covers every asset in those albums, including other members' photos in shared albums. Without albums, Search covers your own and timeline-enabled partners' photos.
- **Album list.** `GET /albums` takes optional `isOwned` and `isShared`. With neither, it returns owned and shared albums together.
- **Combining.** Every field in one filter branch combines as AND.

## Consequences and resource bounds

- **No new permission.** Media type and place need `asset.read`; albums need `album.read`, which Albums already uses. The README's permission table lists the two endpoints.
- **Memory stays bounded.** The place picker holds at most 500 names per level and the names of the levels visited, cached per parent for the session. It renders at most 29 rows. The album picker holds the album list's metadata, at most 54 tiles and the covers near focus. Search itself adds three small fields.
- **No framework, router, event bus, text entry or dependency.** The CSS compatibility check (including the new button-layout rule) and the JavaScript check pass.
- **Physical Q950R acceptance is pending.**

## Later

- Choosing a different place without removing the chip first.
- An any/all toggle for People or Albums, if household use asks for one.
- Camera make and model, which the same suggestions endpoint offers.
