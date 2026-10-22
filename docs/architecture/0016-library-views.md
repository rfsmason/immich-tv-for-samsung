# 0016 - Library views: Favourites, Videos and Recently added

## Context

Favourites and Recently Added already existed as Home rails whose See more opened a paged collection on the generic `home-collection` route (added with the Milestone 11.5 Home polish). Milestone 14 turns them into first-class library views and adds Videos. The Milestone 12 review asked for Recently Added to stop paging by a re-fetched month index. ADR 0012's pattern applies: a new ordered collection adds a source and loader, reuses the grid, viewer, slideshow and playback, and gets a typed route with an explicit parent. The app stays read-only, needs Immich v3.2.0 or later, and targets Tizen 5.0 / Chromium 63.

## Decision

### Placement

- No new left-rail destination. The top-level set (Home, Photos, Albums, Search, Settings) is unchanged.
- Library views are reached from Home rails and their See more tiles, the pattern the household already uses:
  - Recently Added (existing rail);
  - Favourites (existing rail);
  - Videos (a new rail, placed directly after Favourites).
- A separate "Library" hub was considered. It would add a level of navigation for three views that Home already shows, so it's left as an option.

### Typed route

- `{ kind: "library"; view: "favorites" | "videos" | "recently-added"; parent: "home"; entry: "item" | "see-more" }` replaces `home-collection` for these feeds. Recently Viewed keeps `home-collection` and its existing behaviour.
- **Headers** (`src/presentation/library-labels.ts`): "Favourites", "Videos" and "Recently added". `LibraryView` lives in `src/domain/library.ts`.
- **Item entry:** a rail item opens the view focused on that item. Viewer Back returns to the last viewed asset, and grid Back returns to the rail item (moved to the last viewed asset if it is on the rail, as before).
- **See more entry:** See more opens the view on its first item, and grid Back returns to the See more tile. This replaces the earlier "open at the rail's last item" behaviour for library views.

### No on-screen Back control in collections

- Collection screens (Photos, albums, library views, people, Memories and search results) have **no Back button**, at the household's request. The remote's Back key returns to the parent, and Left at a row start returns to the left rail.
- This is a deliberate exception to "every action has a focusable control": Back is a dedicated remote key, so a button for it only duplicated the key and took a focus stop in every grid.
- **Focus stays visible without it.** While a collection is loading or empty there is nothing to focus, so the screen itself holds focus (so the Back key still works) and shows a "Press Back to return" hint drawn in the focus style. The hint appears only while the screen holds focus, so CSS ties it to focus rather than to each state. Albums uses the same hint while it loads.
  - A failed load focuses Retry instead, and Left from Retry returns to the rail.
  - Photos hands focus to the left rail instead, since Photos is a top-level destination.

### Feeds (Immich integration layer)

- **Videos:** structured search with `type: { eq: "VIDEO" }`, `trashedAt: { eq: null }` and `visibility: { eq: "timeline" }`, ordered by `fileCreatedAt` descending, with cursor paging.
  - Home's rail requests the rail size (18) and shows See more when a next cursor exists.
  - The view requests 120 per page.
- **Favourites:** unchanged (`isFavorite: { eq: true }`, not trashed, timeline). Its request already shares `buildFilteredSearchBody` with the other feeds, so nothing needed consolidating.
- **Recently Added — timeline buckets, with the carry-over applied.**
  - Structured `orderBy` can't sort by upload date (see below), so Recently Added stays on `GET /timeline/buckets` and `GET /timeline/bucket` with `orderBy=createdAt`.
  - The first page fetches the month list once. Each later page token is `{ kind: "time-bucket"; timeBucket; later }`: the month's own `timeBucket` value plus the months still to come from that first list.
  - A new upload that creates a new month between pages therefore can't shift, duplicate or skip a month, and each later page costs one request instead of two.
  - The token is plain data carried by the collection, so the client holds no hidden session state.
  - Uploads into a month that hasn't loaded yet still appear when it loads.
- Errors name "Favourites", "Videos" or "Recently Added" through the `permission` kind, and the existing request timeouts apply.
- Only asset read is needed. No statistics or count endpoint is called, so headers show no counts.

### Videos semantics

- Live Photo and motion-photo clips are stored as separate `VIDEO` assets with `hidden` visibility, so `visibility: timeline` keeps them out of Videos.
- Grid tiles show the existing video badge and duration.
- **Slideshow over Videos uses the current rules unchanged.** Videos don't autoplay while a slideshow is playing (`shouldAutoplayViewerVideo`). Each video shows its poster for the slideshow interval and then advances. Playing videos to their end during a slideshow would be a new rule, so it's deferred. Manual playback, the autoplay setting and lifecycle pause behave as in every other collection.

### History

Viewing history records a `library` source kind whose id is the view (`favorites`, `videos` or `recently-added`) and whose title is the header. It's a backward-compatible extension of the version 1 store, as Milestones 11-13 did; older entries still load.

## API behaviour verified on 19 October 2026

Against Immich `main` at `f293f09` and release v3.3.3:

- **`SearchOrderField`** is `fileCreatedAt`, `localDateTime`, `fileSizeInBytes` and `rating`; there is no `createdAt` ([enum.ts](https://github.com/immich-app/immich/blob/main/server/src/enum.ts)). `withSearchOrder` maps only those four columns ([database.ts](https://github.com/immich-app/immich/blob/main/server/src/utils/database.ts)). Structured search therefore can't order by upload date, which is what decided the Recently Added path.
- **Asset types:** `AssetType` is `IMAGE`, `VIDEO`, `AUDIO` or `OTHER`, sent as those strings (enum.ts). The structured `type` filter takes `eq`, `ne`, `in` and `notIn` (`EnumFilterAssetTypeSchema`, [search.dto.ts](https://github.com/immich-app/immich/blob/main/server/src/dtos/search.dto.ts)) and filters `asset.type`.
- **Other filters:** `isFavorite` and `isMotion` are `eq`-only booleans; `createdAt` is a date filter on `asset.createdAt` (`branchPredicates`, database.ts).
- **Motion clips:** `AssetVisibility.Hidden` is documented as the "video part of the LivePhotos and MotionPhotos" (enum.ts). Linking a Live Photo sets the motion asset's visibility to `Hidden`, and extracted motion clips are created hidden ([metadata.service.ts](https://github.com/immich-app/immich/blob/main/server/src/services/metadata.service.ts)).
- **Unchanged since ADR 0013/0014:** structured search uses cursor paging with an `id` tie-break, doesn't exclude trashed assets unless `trashedAt` is filtered, and needs `asset.read`.

## Resource bounds and Home concurrency

- Each library view is the shared collection grid: windowed DOM, bounded thumbnails, 120-asset pages, bounded viewer previews, and no new timers or media.
- Home now has seven rails, each bounded to 18 items.
- **Home loads in screen order (update, 22 October 2026, from TV testing).** With seven rails, every rail requested its data at once and each started its own thumbnail queue of up to eight, so Home could ask for 50+ thumbnails against the TV's roughly six connections per server; the order things arrived in was effectively random, and Albums and People had no limit at all. Now:
  - **Rail data** loads in `homeRailOrder` (Recently Added, Favourites, Videos, People, Recently Viewed, Albums, Memories), two rails at a time (`homeRailDataConcurrency`). `loadHome` resolves once every rail has loaded or failed; the app uses that to reveal Home at launch (ADR 0007 update).
  - **Thumbnails** for every rail, Albums and People included, share one Home-wide queue (`src/screens/priority-scheduler.ts`) of at most six requests in flight (`homeThumbnailRequestLimit`). When a slot frees, the next request is the one closest to the focused rail (the rail above before the one below), then nearest that rail's focused tile (`homeThumbnailPriority`). Priorities are read at that moment, so moving down Home re-prioritises at once. A queued request re-checks that it's still wanted before it starts. Each rail's own queue and retention rules are unchanged.
  - This resolves the Milestone 18 carry-over: lower rails no longer wait out their timeouts behind other rails' requests.
  - Tests pin the order, the two-at-a-time data loading, the six-request cap and the priority rule.

## Later

- A Library hub, should Home become crowded.
- More views (screenshots, panoramas, Live Photos only, "On this day" beyond Memories), each a feed plus a header.
- Playing videos fully during a slideshow.
