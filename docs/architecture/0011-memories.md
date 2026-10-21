# 0011 - First-class Memories

## Context

Home's Memories preview needs a proper browsing destination and fresh asset loading without another grid, viewer, slideshow, or media lifecycle. Immich owns Memory generation. The target remains Tizen 5.0 / Chromium 63.

## Decision

- Keep Memories as a Home child. Home's bounded preview opens a Memory directly; a View all Memories tile at the end of the rail opens today's suggestions in an Albums-style five-column summary. Following on-TV review, it appears only when today has more Memories than the rail shows (from `GET /memories/statistics`; without that permission, only when the rail is full), so it is absent when there are no Memories. The summary has no navigation toolbar; Back uses the remote, and Retry appears only on error. No permanent sidebar destination is added.
- Extend the existing Memory domain with optional display context. Discovery keeps stable ID, title, date/type context, asset count and only the first mapped cover asset. Opening an ID loads the complete ordered sequence afresh. Raw response structures remain within the Immich client.
- Use `GET /memories` with `for=YYYY-MM-DD` (the TV's local calendar date), `isTrashed=false`, `order=desc`, `page` and `size`. Home requests at most eighteen cards. The summary freezes its date while scrolling and resets on a new calendar day. It initially loads fifteen cards to fill three rows, then appends/prepends pages near remote focus. It retains at most three pages (45 summaries); earlier/later metadata is reloaded when revisited.
- Use the same search endpoint with `id`, `size=1`, and `isTrashed=false` when opening a Memory. Although `GET /memories/{id}` exists, current search additionally excludes assets involving hidden people. Keeping discovery's privacy filtering is preferable. An unavailable/empty server-filtered result yields a recoverable application error. No write/seen endpoint is called.
- Generalise the existing asynchronous People collection loader to a small typed People/Memory request union. It owns loading, Retry, generation guards, and shell-focus protection. A Memory's successful result feeds the existing static collection grid and all shared viewer/slideshow/video/Live Photo paths.
- Keep the Memory parent explicitly as `home | memories` in application composition and pass it to the shared collection for its Back label. Summary Back restores the Home end tile; Memory Back restores either the Home preview tile or the browser's retained card. Viewer Back restores the last viewed grid asset.
- Add `memory` as a backward-compatible viewing-history source kind. The existing viewer callback and version 1 store still persist only asset ID, timestamp and a small source breadcrumb.

## API findings verified on 2026-10-15

The current official schema supports ID, page, size, date, saved/upcoming/type filters. We use only the fields above. `for` filters `showAt` / `hideAt`; it is not a historical anniversary calculation. Without `for`, search can return historical or upcoming Memories. Current server ordering is `showAt` then `memoryAt`, descending with null show dates last; assets are returned by `fileCreatedAt` ascending. The client preserves response order.

Search excludes deleted Memories, trashed/non-timeline assets, and assets involving hidden people. The service then removes Memories with no remaining assets **after** database paging. Consequently, short or even empty pages do not prove exhaustion. There is no next-page token in the array response. Use `GET /memories/statistics?for=…&isTrashed=false` to bound the page range before filtering; never display that count as a visible-asset total. This needs the read-only `memory.statistics` API permission, with a clear recoverable error when it is missing. Empty pages are skipped with at most four page requests per remote movement; if that budget is exhausted, Down continues browsing. No page-navigation buttons or unbounded automatic scan are introduced.

The separate detail endpoint returns embedded assets too; neither path provides per-Memory asset pagination. Server-generated Memory sets are normally small, but manually created sets are not assumed bounded. API JSON decoding/validation and the selected Memory's asset metadata can therefore be large. Discovery immediately drops all but cover metadata after validation. Media URLs and DOM nodes use fixed bounds regardless of that response size. Historical/saved browsing and support for older servers missing the current pagination/ID schema are deferred.

References: [search endpoint](https://api.immich.app/endpoints/memories/searchMemories), [official DTO schema](https://github.com/immich-app/immich/blob/main/server/src/dtos/memory.dto.ts), [repository filtering/ordering/paging](https://github.com/immich-app/immich/blob/main/server/src/repositories/memory.repository.ts), [service empty filtering and generation](https://github.com/immich-app/immich/blob/main/server/src/services/memory.service.ts), [controller and permissions](https://github.com/immich-app/immich/blob/main/server/src/controllers/memory.controller.ts).

## Resource and compatibility consequences

The summary uses the existing Albums grid/window helpers: at most 35 card DOM nodes, 45 retained covers, and 45 summaries. Home retains eighteen Memory previews plus the View all tile. Both reuse the thumbnail queue with at most eight concurrent requests, deduplicated by cover asset ID. Empty cards never shift associations; shared covers reuse one URL. Eviction, hide, reset and destroy revoke URLs; stale completions revoke their own results. Cached browser summaries are cleared when connection settings change.

The selected Memory uses existing windowed grid thumbnails, bounded neighbouring viewer previews, and playback/timer cleanup. No originals, extra media engine, framework, dependency, storage system, or router is introduced. The existing Chromium 63 build target remains enforced. Automated tests cover the new boundary and flows; physical Q950R acceptance is still outstanding, including long-running slideshow and repeated navigation resource stability.
