# 0009 - Home Rails

## Context

Milestone 10 makes Home the normal startup destination when valid Immich connection settings exist. Home needs to provide a useful overview without duplicating Photos, Albums, album detail, viewer, video playback, Live Photo playback, or slideshow behaviour.

The target remains Tizen 5.0 / Chromium M63, so Home must stay deterministic, small, and bounded in DOM and media resources.

## Decision

Use a dedicated Home screen controller that owns horizontally browsable rails and delegates domain work to existing services:

- Rails appear in this order: Recently Added, Favourites, People, Recently Viewed, Albums, Memories. Each contains at most 18 items and loads independently with its own status.
- Recently Added uses the existing timeline bucket integration with `orderBy=createdAt`, descending order, timeline visibility, and `isTrashed=false`. Metadata search does **not** support `createdAt` ordering. Only enough newest buckets to fill the rail are requested, with at most 24 bucket requests. Only the rail's remaining asset count is mapped into domain objects. The API returns a whole bucket, so a large import day can still produce a large individual response; the client does not retain that response after mapping.
- Recently Viewed uses local TV viewing history through a dedicated service and store (ADR 0010). It contains actual viewer visits, not recent library assets. It opens a bounded history collection; source-context resume remains separate.
- Favourites and People use bounded Immich queries; Memories uses the assets supplied by Immich. None adds a separate viewer.
- Albums is loaded through the existing Albums service path and uses the same album domain model and thumbnail semantics as the Albums screen.
- Selecting a Home asset opens the existing shared full-screen viewer over the ordered Home collection. Selecting People or Memories opens the same thumbnail summary/grid as album detail, using the bounded person result or embedded memory collection. From those summaries, viewer Back restores the last viewed thumbnail; summary Back restores the original Home tile.
- Selecting a person opens the shared summary immediately with a visible loading state and a usable Back control. A failed request offers Retry/Back with deterministic remote focus. The shared screen owns the request generation: hiding it, destroying it, or opening another collection invalidates late results. Results do not steal focus from the sidebar.
- Selecting an Album opens the existing album detail flow with a small navigation context so Back can return to Home or Albums depending on the entry point.
- Home rail thumbnails are loaded and revoked through the same bounded thumbnail lifecycle patterns used by existing asset collection screens.

## Reasoning

Home is an aggregation screen, not another browser/viewer implementation. Keeping rail focus and thumbnail cleanup in Home while reusing the existing service and viewer flows avoids a second media engine and preserves proven video, Live Photo, slideshow, metadata, and bounded preview behaviour.

The initial rails are intentionally small enough that simple bounded rendering is preferable to a more complex virtualised horizontal list. Future rails should plug into the same pattern when they can provide a small ordered item set and a clean activation path.

## Consequences

Favourites, People, and Memories are bounded Home previews; first-class paginated destinations remain separate roadmap milestones. A future Continue Browsing rail should store and restore source context rather than treating recently viewed assets as one generic lazy-loaded collection. Future rails should not make raw Immich requests from UI code and should not add separate viewer or album-detail flows.


## Validation status

All six Home rails, local viewing history, focus restoration, shared People/Memory summaries, and the People loading/retry flow are implemented. Local validation passed at the time (182 tests, typecheck, lint, production build, and static Tizen checks); current test counts and checks are recorded in later milestone pull requests, not here. Physical Q950R verification of all six rails, focus-follow scrolling, viewer Back/focus restoration, and repeated refresh/hide resource cleanup remains required before Milestone 10 is signed off.

API references: [timeline query schema](https://github.com/immich-app/immich/blob/main/server/src/dtos/time-bucket.dto.ts) and [metadata search ordering fields](https://github.com/immich-app/immich/blob/main/server/src/enum.ts).

## Update: Home collections open as paged summaries

Following on-TV review, selecting an item in Recently Added, Favourites or Recently Viewed now opens the shared summary grid, focused on the chosen item, instead of going straight into the viewer; OK then opens the viewer. Back from the viewer returns to the summary, and Back from the summary restores the original Home tile, as People and Memories already did.

These collections, and People, are no longer limited to the rail's 18 items. The summary starts at once with the rail's items. Further pages then load through the shared collection grid as remote focus nears the loaded end, in both the grid and the viewer:

- Favourites and People page through `/search/metadata` with the same filter, cursor and page handling as album assets, 120 per page.
- Recently Added pages one non-empty upload-date (`createdAt`) timeline bucket at a time.
- Recently Viewed is the bounded local history (at most 50 items), so it loads once.

The first page repeats the rail's items, so those are dropped when the page is appended. Totals stay unknown until the last page, because a search page reports only its own size.

Feeds are a `feed` collection source with a loader injected by application composition, so the screen makes no API calls itself (ADR 0012). The rails themselves are unchanged and still bounded. A Memory already loads all of its assets, because Immich offers no paging within one Memory.

## Update: fixed-focus rails

Home rails use fixed-focus navigation:

- **Fixed position.** From a rail's second item on, the focused tile always sits where its second tile sits, so the previous item stays visible; the first item stays at the start. The active rail always sits where the first rail sits. Moving Left or Right slides the rail; moving Up or Down slides the stack of rails.
- **Per-rail selection.** Each rail keeps its own selection, so returning to a rail lands on its last selected item instead of the previous rail's column.
- **Focus emphasis.** The focused tile is scaled up by 6%.

Home no longer scrolls. `alignHomeRails` runs after every Home render and sets CSS `transform: translateX/translateY` from layout offsets (`offsetLeft`/`offsetTop`), which transforms do not change. Rail elements persist across renders, so a 220 ms transform transition animates each move, which Chromium 63 supports.

Rail sections clip their rails, and the Home screen clips the stack, with padding for the enlarged focus. `will-change` is deliberately not used: permanently promoted, very wide rail layers would cost significant TV GPU memory. Without it, Chromium promotes a layer only while a rail animates.

## Update: See more tiles

A rail ends with a See more tile only when more items of its kind exist than it shows, and it has at least one item:

| Rail | Signal that more exist | See more opens |
|---|---|---|
| Recently Added | The bucket total exceeds the rail. | Its summary, at the rail's last item |
| Favourites | The search response has a next cursor. | Its summary, at the rail's last item |
| Recently Viewed | The stored history exceeds the rail. | Its summary, at the rail's last item |
| Albums | There are more albums than the rail shows. | The Albums screen |
| People | `GET /people` reports a next page (`hasNextPage`, or the total on older servers). | The People browser (ADR 0013) |
| Memories | Today's Memory count exceeds the rail (ADR 0011). | The Memories browser |

People's See more became active in Milestone 12. Opening a person from the rail now uses its own `person` route with Home as parent, rather than the generic Home collection route.

The tile sits at index `items.length`, and focus on it is restored across reloads. Remote and pointer activation share one path.

## Update: Videos rail and typed library route (Milestone 14)

Home has seven rails: a Videos rail sits directly after Favourites and follows the same rules (18 items, See more when Immich reports a next cursor). Favourites, Videos and Recently Added now open as library views on a typed `library` route rather than `home-collection`. See more on those rails opens the view on its first item and Back returns to the See more tile; Recently Viewed keeps its behaviour. See [ADR 0016](0016-library-views.md).

## Update: rail visibility (Milestone 15)

Settings > Home turns each rail on or off; all are on by default. Home reads the enabled rails at each load: rails that are off are emptied and hidden, so they are not fetched, rendered, given thumbnails or reached, and the launch splash waits only for rails that are on. A change applies the next time Home is shown, with focus moving to the nearest rail still on. With every rail off, Home offers **Open Settings**. Recently Viewed history is recorded whether or not its rail is shown. A rail item opens Favourites or Videos newest first, matching the rail. See [ADR 0017](0017-personalisation-and-navigation.md).
