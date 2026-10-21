# 0004. Album Asset Browsing

## Context

Milestone 5 needs a TV-first grid for assets inside a selected Immich album. The grid must work with large albums on Tizen 5.0 / Chromium 63 without rendering or decoding every thumbnail.

The current Immich OpenAPI specification keeps `GET /api/albums/{id}` as the album detail endpoint, but `AlbumResponseDto` no longer includes an `assets` array. Album membership is retrieved through the asset metadata search endpoint filtered by album ID.

## Decision

The app loads album metadata from `GET /api/albums/{id}` and album assets from `POST /api/search/metadata` with an album-ID filter inside the Immich client boundary. The application screen receives a mapped `AlbumDetail` domain model and does not construct API paths, headers, search bodies, or thumbnail URLs.

The album asset grid uses logical asset indexes for navigation, while rendering only a small row window around the focused item. Thumbnail object URLs are retained only for a bounded window around focus and revoked when they leave that window, when the screen hides, or when a stale request completes.

## Consequences

The DOM and retained Blob URLs stay bounded regardless of total album size. Asset metadata may still be loaded for the album because current Immich search is the documented source for album assets.

If Immich later restores album assets on the album-detail response or introduces an album-assets endpoint with explicit album ordering, the change should be isolated to the Immich client and service layer.
