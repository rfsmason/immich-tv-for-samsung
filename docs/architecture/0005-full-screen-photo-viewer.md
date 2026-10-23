# 0005 Full-Screen Photo Viewer

## Context

Milestone 6 adds a full-screen album asset viewer for Samsung Tizen TV. The target TV has constrained memory, and decoded media resources can be expensive, so the viewer must not reuse the thumbnail grid cache or fetch original full-resolution assets by default.

Immich exposes preview-sized media through `GET /api/assets/{id}/thumbnail?size=preview`. Current Immich source also supports `thumbnail` and `fullsize`, while `size=original` is deprecated on the thumbnail endpoint in favour of the original download endpoint.

Immich also exposes video playback through `/api/assets/{id}/video/playback`. Unlike `fetch`, an HTML `<video>` element cannot attach the normal `x-api-key` request header to its media request.

## Decision

The viewer uses Immich `preview` media for full-screen still images and video poster frames, and keeps a separate object URL retention window from the album thumbnail grid.

The viewer retains only the logical previous, current, and next album assets. It requests preview blobs only for image and video assets in that window, stores object URLs in viewer state, and revokes viewer URLs when they leave the window, when the viewer closes, when the screen hides, or when a new album loads. Preview requests are queued with at most three active viewer requests, and queued work outside the previous/current/next window is pruned before it starts.

Viewer navigation follows the loaded logical album asset order and clamps at the loaded edges.

Normal video playback is part of Milestone 6. Video assets use the Immich playback endpoint directly in the `<video>` element instead of downloading the whole video into a Blob. Live Photos use the linked `livePhotoVideoId` asset through the same playback path and play as a TV-safe single-shot animation over the still image. Audio assets remain unsupported and continue to show a clear unsupported state.

The playback URL includes the Immich API key as a query parameter because the `<video>` element cannot supply `x-api-key`. Immich supports this authentication form, and the API key is URL-encoded. This is an intentional platform trade-off: query-string credentials are more likely than headers to appear in Immich, reverse-proxy, or network access logs, so future authentication work should revisit playback authorization rather than treating query authentication as invisible.

## Consequences

Full-screen viewing has bounded memory and bounded preview-request concurrency independent of album size, and does not couple viewer preview lifecycle to the thumbnail grid lifecycle.

Album asset search requests include `withExif: true` so location metadata is available when the viewer location/EXIF display is enabled. Location display is enabled by default, and this metadata payload is considered acceptable for the current 120-asset page size. If Q950R profiling later shows search payload size is a problem, the service boundary can be revisited to request EXIF conditionally.

The viewer may require another Right press after lazy-loading more assets at the loaded edge. This keeps navigation predictable and avoids inventing a second pagination path.

Slideshow preloading in Milestone 7 can build on the same preview-window state instead of adding a separate media cache.

Video playback quality and compatibility remain areas for later hardening, including whether Samsung AVPlay is preferable to HTML5 video for some TV models.

## Update: Faces control (Milestone 15)

The viewer's bottom-right controls gain **Faces** (between Slideshow and Back) for photos and Live Photo stills. It draws Immich's face tags over the photo once it has decoded, requesting faces for the current photo only and caching the last three, so the bounded previous/current/next window is unchanged. See [ADR 0017](0017-personalisation-and-navigation.md).
