# 0010 - Local viewing history

## Context

Home's Recently Viewed label previously used a recent-library search. A true history must reflect viewing on this TV across albums, Photos, People, Memories, and Home, without introducing a backend or leaking another account's history.

## Decision

- The shared viewer emits an application callback when an image/video becomes the selected viewer asset, including manual navigation and slideshow steps. Merely browsing thumbnails or a summary does not count. A failed media download may still leave a visit, since selection counts as a visit.
- The application composes a viewing-history service, local storage adapter, and Immich client. UI does not write storage or make HTTP requests.
- Persist at most 50 unique asset IDs, visit timestamps, and source kind/ID/title, newest visited first. Revisit replaces the older entry. Never persist thumbnails, object URLs, media, or additional copies of credentials.
- Resolve the current user with the existing authenticated `/users/me` integration, cached in memory for the active connection. The storage scope combines normalized server URL and user ID. Only one account's history is retained: other scopes read empty, and recording for a new scope replaces the old history. API keys are used only in memory to invalidate the identity cache.
- Pending records are bounded to 50 while identity is loading. Recording failures log a generic diagnostic and do not interrupt viewing. Failed identity resolution is retried on the next visit.
- On entry/return to Home, load up to 18 available history assets. Revalidate saved IDs with documented `GET /assets/{id}`, at most three requests concurrently and 50 IDs per refresh. Remove inaccessible/missing (403/404/410), trashed, hidden, locked, and unsupported assets. Retain history on network/server failures, with the rail's normal error state.
- Use fresh API metadata through the existing domain mapper. Reordering the rail preserves focus by asset ID, including the viewer's last selected asset.
- Opening a history item uses the ordered history collection. Stored source context is a breadcrumb for future work; this feature does not silently reopen an album or infer a timeline position.

## Consequences

History starts empty after upgrade and reflects visits from this TV only. It survives app restarts and is bounded independently of library size. Clearing TV app data clears history. Original-context Continue Browsing can be added deliberately later.

The implementation uses existing localStorage, Promise, Set, and ES2017 facilities supported by the Chromium 63 build target. No dependency or Immich write endpoint is added. Physical-TV verification remains required for persistence, remote focus, and repeated viewer/Home transitions.

API references: [getAssetInfo](https://api.immich.app/endpoints/assets/getAssetInfo) and [official asset response schema](https://github.com/immich-app/immich/blob/main/server/src/dtos/asset-response.dto.ts).
