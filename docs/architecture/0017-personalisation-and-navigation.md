# 0017 - Personalisation and navigation

## Context

Milestone 15 makes the existing screens faster to move through and lets a household shape them, without new screens or dependencies:

- the Photos date rail moved one month per press, which is slow across a long library;
- Home always showed all seven rails;
- every collection was newest first;
- the viewer could not show who is in a photo, although Immich knows.

The app stays read-only, needs Immich v3.2.0 or later, and targets Tizen 5.0 / Chromium 63 on the QE55Q950R. Everything must work with the arrows, OK and Back alone; other keys are accelerators. The user chose **no on-screen hints** for the rail acceleration or the channel keys.

Immich facts were checked against `immich-app/immich` `main` at `1cf5bb4`:

- `server/src/controllers/face.controller.ts`: `GET /faces?id=` needs `Permission.FaceRead`; `person.service.ts` `getFacesById` also requires `AssetRead` access to the asset.
- `server/src/dtos/person.dto.ts`: `AssetFaceResponseDto` has `id`, `imageWidth`, `imageHeight`, `boundingBoxX1/Y1/X2/Y2`, optional `sourceType` and a nullable `person` with `name` and `isHidden`. `isVisible` filters faces, not hidden people.
- Immich Web (`web/src/lib/utils/people-utils.ts`, `container-utils.ts`) normalises a box by `imageWidth`/`imageHeight` and maps it into the photo's scale-to-fit, centred content rectangle. Boxes are already upright; edits are applied on the server (`transformFaceBoundingBox`).
- `server/src/dtos/time-bucket.dto.ts` and `asset.repository.ts`: timeline `order=asc|desc` sorts the bucket list and each bucket's assets in that direction.
- `server/src/dtos/search.dto.ts` and `database.ts`: structured search `orderBy { field: "fileCreatedAt", direction }` sorts by a non-null column with an `asset.id` tie-break in the same direction, so reversing it is an exact flip.
- Samsung's TV key list: `ChannelUp` (427) and `ChannelDown` (428) must be registered with `tizen.tvinputdevice.registerKey`. Key repeat and keyup while a remote button is held are not documented, so they are on the TV checklist.

## Decision

### Date-rail acceleration

- A pure **hold accelerator** (`src/navigation/hold-accelerator.ts`, injected clock and named timings) turns a held Up/Down into a growing step:
  - under 1,000 ms: one month per repeat;
  - 1,000–3,000 ms: to the next year boundary in the direction of travel;
  - over 3,000 ms: skip one boundary per repeat (two years).
- A keydown continues a hold when it is the same key and either `event.repeat` is set or it arrives within 250 ms. The repeat flag alone is enough, because a remote's first auto-repeat can come later than 250 ms.
- A hold ends on keyup, any other key, a change of direction, a gap, leaving the rail, the screen hiding or the app being hidden. The first press of every hold is one month.
- `stepTimelineRailSelection` (`src/screens/timeline-rail-window.ts`) applies a step to the buckets **as displayed** and stops at the ends, so it follows the rail in either order.
- Keys only move the selection. The rail redraws and refocuses at most once per animation frame (an injectable `scheduleFrame`, cancelled on hide and destroy). Nothing loads until OK, which jumps as before.

### Channel keys

- CH ▲/▼ register through the platform layer (`registerOptionalRemoteKeys`), only when `getSupportedKeys` lists them. Failures are logged and never fatal.
- On the rail, CH ▲ moves to the previous year boundary as displayed and CH ▼ to the next, one year per press with no acceleration. From the Photos grid, CH first enters the rail at the focused asset's month. Elsewhere the keys do nothing and are not consumed.
- The desktop preview maps Page Up/Page Down to the channel keys, as ADR 0015 maps Escape and Backspace to Back.

### Home rail visibility

- `AppSettings.homeRails` holds an on/off flag per `HomeRailId` (now in `src/domain/home.ts`), all on by default. Normalising drops unknown rails and turns on any rail missing from storage, so rails added later appear.
- Stored app settings carry a `schemaVersion` (1). Version 0 differs only by missing settings, which normalising fills; a future breaking change adds a migration step.
- Settings gains a **Home** section, built from the domain's rail order and UK titles. The Settings sections now live in `src/screens/settings/`, each owning its controls; the screen keeps the section rail, saving and the unsaved-changes guard. Saving merges the sections' values into the stored settings, so settings kept elsewhere survive.
- Home reads the enabled rails at each load. Rails that are off are emptied and hidden, so they are not fetched, rendered, given thumbnails or reached. `whenLoaded` and the launch splash wait only for enabled rails. A change applies on the next show, through the refresh-pending path, with focus moving to the nearest enabled rail (the one above on a tie).
- With every rail off, Home shows "Choose what Home shows in Settings." and **Open Settings**, which opens Settings on its Home section.
- Turning off Recently Viewed only hides the rail; viewing history is still recorded.
- Reordering rails is out of scope.

### Sort order

- The domain order is `SortOrder = "newest-first" | "oldest-first"`. Only the Immich client maps it to `desc`/`asc` (`toImmichAssetOrder`), including the album's own `order`.
- **Reversible:** Photos, albums, People, Favourites, Videos and Search results. **Fixed:** Memories, Recently Viewed and Recently Added, which show no control.
- A header button shows a down arrow for newest first and an up arrow for oldest first, with the order in its label (`src/screens/collection/collection-sort.ts`). It uses the viewer controls' button style and size and sits in the same right-hand column:
  - Up from the grid's first row reaches it (after any newer Photos pages have loaded);
  - OK reverses the order and reloads from the start, keeping focus on the button;
  - Down returns to the first item; Left goes to Retry when shown, otherwise the left rail.
  - The async generation drops pages from the previous order.
- Photos, Favourites, Videos, People and Search remember their order in `AppSettings.sortOrders`, newest first by default. An album starts in its Immich order; a reversal is kept in memory per album and cleared when Settings saves and returns to Home, which is how a connection change is applied.
- A Home rail item opens Favourites or Videos newest first for that visit, because its neighbours come from the rail; the saved order is unchanged. See more uses the saved order. When that is oldest first, the view loads from its start rather than from the rail.
- Photos sends the same order to `/timeline/buckets` and `/timeline/bucket`, so the rail, date headings, year boundaries, bucket offsets and jumps all follow. The viewer and slideshow follow the loaded collection through `ViewerCollection`.

### Face tags

- `getAssetFaces(assetId)` calls `GET /faces?id=` with the feature name "Face tags". The response is validated and mapped to `AssetFace`: boxes normalised by the detection image size and clamped, hidden people left out, empty names treated as unnamed.
- The overlay lives in `src/screens/collection/viewer-faces.ts`, with pure geometry in `face-overlay-layout.ts`. A **Faces** button joins the viewer's bottom-right controls, with `aria-pressed`. It shows for photos and Live Photo stills, not videos, and is hidden during a slideshow. Its state is `AppSettings.showFaceTags`, off by default.
- Boxes are mapped through the photo's `object-fit: contain` letterboxing, as Immich Web does. Named people get a label below the box (above it when there is no room), kept inside the stage. Unnamed faces get an outline only. Outlines are white with a dark edge and labels are solid, so both read on any photo.
- **Requests:**
  - only while Faces is on, and only for the current photo once its image has decoded;
  - responses for a photo no longer shown are dropped;
  - the last three photos' faces are cached, and the cache is cleared whenever the viewer resets (hidden, closed or a new collection);
  - nothing is prefetched.
- A photo without faces says "No faces tagged" in the viewer's status line. A 403 shows "Face tags need the face.read permission on your Immich API key." and turns Faces off for the session. The button stays, unpressed, so focus is never left on a hidden control; pressing it again repeats the message without asking Immich. If Faces is ever hidden while focused (a video or a slideshow), focus moves to Slideshow.
- The README lists every permission the app needs, taken from the endpoints it calls and their `@Authenticated` decorators.

### Partner photos in Photos and Recently Added

- The Photos timeline and Recently Added queries send `withPartners=true`. Immich (`timeline.service.ts`, `utils/asset.util.ts` `getMyPartnerIds` at `1cf5bb4`) then adds the assets of partners who share with this user and whose "Show in timeline" preference is on. Partner inclusion stays an Immich setting, not an app one.
- Immich accepts `withPartners` only with `visibility=timeline`, with no truthy `isTrashed` and without `isFavorite`. Both queries meet that; Recently Added's `isTrashed=false` is allowed.
- Both timeline endpoints send the same query, so bucket indexes still agree. The Search date stepper reads its range from the same buckets, so it can reach back to a partner's oldest month; Search results come from structured search and do not include partners.
- **Correction (26 October 2026, Milestone 16 review).** The sentence above is wrong. Structured search (`resolveSearchScopeV3` → `getUserIdsToSearch` in `search.service.ts`, Immich `main` `c6d1e15`) also covers partners whose "Show in timeline" is on, so Search, Favourites, Videos and person results can all include partners' photos. Milestone 16 records this in ADR 0018 and makes Favourites show only your own favourites (ADR 0016 update).

### Standard background

- Every screen sits on one standard background picture (`assets/app-background.jpg`, a runtime file), under a dark wash so white text stays readable. It replaces the random per-screen backdrops (a random album cover on Albums, a random photo on collections): thumbnail-sized library pictures stretched to full screen often looked poor.
- The background is plain CSS on `body`, with the previous dark gradient colour as a fallback. It costs one 1920 × 1080 decode for the whole app and no requests to Immich.
- Letting the household choose their own background from the library may become a setting later.

### Rail logo

- The logo above the left rail fills a 72 × 64 box, the size of a collapsed rail button.

## Reasoning

- Acceleration by hold time, rather than by repeat count, behaves the same whatever repeat rate the TV uses. Rendering per frame keeps fast repeats from rebuilding the rail on every key on Chromium 63, and loading only on OK keeps a long hold from flooding the server.
- Year boundaries are the landmarks the rail already labels, so a year step lands somewhere the household can read.
- Hiding rails at load time, not just in CSS, keeps the resource bounds of ADR 0016: a hidden rail costs no requests or thumbnails.
- Both Immich orders are exact reversals, so a reversed collection needs no client-side sorting or extra data.
- Face boxes come from Immich's own detection and follow Immich Web's mapping, so the TV shows what Immich shows. Requesting only for the photo on screen keeps the feature at one small request per photo viewed.

## Consequences

- `AppSettings` grows `homeRails`, `sortOrders` and `showFaceTags`, with a schema version.
- Client and service page methods for reversible sources take a `SortOrder`. `CollectionFeed` and `CollectionSource` carry it, and a `library` remote collection loads Favourites or Videos from their start.
- `album-detail-screen.ts` stays under about 1,000 lines.
- To check on the TV:
  - key repeat and keyup for held Up/Down and CH;
  - CH registration;
  - the timing of the acceleration;
  - face-box alignment on real previews, including portrait and panorama photos;
  - label legibility.

Supersedes nothing. Updates ADR 0005 (viewer controls), ADR 0008 (collection order and header) and ADR 0009 (rail visibility).

## TV result (26 October 2026)

Physical Q950R acceptance passed on 26 October 2026 (user confirmation), covering every item on PR #3's combined checklist, including the date rail's hold acceleration and the CH keys.

**Open note for the user:** whether Tizen sets `KeyboardEvent.repeat` on held keys and sends `keyup` on release isn't recorded. The accelerator works either way (`event.repeat`, or the same key within 250 ms), so this is a record of which path the TV takes, not a defect. Please note it here once checked.
