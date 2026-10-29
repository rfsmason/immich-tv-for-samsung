# 0006 Slideshow Mode

## Context

Milestone 7 adds slideshow behavior to the full-screen viewer. The viewer already has a bounded preview-image retention window that keeps only previous, current, and next asset stills in memory.

Samsung TV media keys such as `MediaPlayPause`, `MediaPlay`, and `MediaPause` are optional remote keys. Samsung's TV remote-control documentation says arrow, Enter, and Back events are detected automatically, while other remote keys must be registered through the TV Input Device API. The app therefore registers the media keys on startup as a best-effort enhancement while preserving OK/Enter operation.

The album viewer can contain images, videos, and Live Photos. Automatically starting video or Live Photo motion during a passive photo slideshow would introduce surprise audio/video behavior and would use a separate playback path from still previews.

## Decision

Slideshow mode is implemented inside the full-screen viewer state and reuses the existing viewer still-image window. It does not add another media cache and does not request original assets.

The default slideshow interval is eight seconds and is configurable from settings using a small remote-friendly option set. (Update, Milestone 16: the option set is now the app's shared drop-down rather than a native `<select>`; see ADR 0018.)

Slideshow advances through the current logical album asset order. Videos and Live Photos are included as still poster/preview assets, but their motion playback remains explicit and manual. Starting slideshow stops any active viewer video or Live Photo playback.

Manual Left or Right navigation pauses slideshow before moving. Back exits the viewer and stops slideshow. The slideshow control is focusable with the remote, and registered Samsung Play/Pause media keys toggle slideshow when available.

## Consequences

Slideshow has the same bounded memory behavior as manual full-screen viewing: preview resources stay limited to the previous/current/next viewer window.

The first slideshow version was still-image oriented. Since Milestone 18.5, with "Autoplay videos" on, a slideshow plays each video in full and then moves on (see the update below and [ADR 0020](0020-viewing-and-accessibility.md)); with it off, a video still shows its poster for the interval.

If the viewer reaches the loaded asset edge while more assets are being fetched, slideshow waits for the existing pagination path. If there are no more loaded assets to advance to, slideshow pauses rather than wrapping or inventing a second pagination mechanism.

## Update: the TV screensaver (Milestone 18, 26 October 2026)

- **While a slideshow runs,** the viewer holds the TV's own screensaver off through the reference-counted passive-viewing control (`src/platform/tizen/screensaver.ts`). It does the same while a video or Live Photo plays, as Samsung requires of store apps.
- **The hold is released** when the slideshow pauses, reaches its end, or stops, and when the viewer closes or the app is hidden.
- **The slideshow's timer, control and media keys** moved to `src/screens/collection/viewer-slideshow.ts` (behaviour unchanged).

See [ADR 0019](0019-ambient-mode.md).

## Update: buttons step aside during passive viewing (28 October 2026)

- **While a slideshow runs or a video or Live Photo plays,** the viewer's buttons (Play, Slideshow, Faces, Back) and the navigation rail fade out four seconds after the last remote key (`viewerControlsHideMs`), so only the picture shows.
- **The next key shows them again** and restarts the countdown. That key does nothing else, so a press never acts on a button the viewer couldn't see; Back and the Play/Pause media keys still act straight away.
- **They stay** whenever nothing plays: paused, at the end of a slideshow, after a video ends, and when the viewer closes or the app is hidden.
- **The same passive-viewing state drives both** the TV screensaver hold and the countdown, in `src/screens/collection/viewer-autohide.ts`. The viewer marks itself `data-controls="hidden"`, and the shell hides its rail through `setRailHidden`, so the viewer never reaches into the shell.
- **Opacity only,** with no layout change, so focus and the remote's moves are unaffected.
- **Confirmed on the Q950R** on 28 October 2026 (user confirmation), together with the Settings and viewer button restyling.

## Update: when the buttons fade, and videos in full (Milestone 18.5, 28 October 2026)

- **Hide playback buttons.** The fixed four seconds became a choice under Settings → Display: 3, 5 (default), 10 or 15 seconds, or Never. Common TV players hide their controls after about 3-5 seconds; 15 seconds covers people who need longer to find and read a control; Never meets WCAG 2.2.1's "turn off". `viewer-autohide.ts` reads the choice whenever playing starts or a key is pressed; with Never nothing hides, so no key is spent showing the buttons.
- **Videos in full.** With "Autoplay videos" on, a slideshow plays each video to its end through the viewer's own playback, with sound, then moves on; photos and Live Photos (stills) keep the interval. Play/Pause pauses the video and the slideshow together, and resuming continues the video. A video that doesn't start or reports an error is skipped after the interval, and one that makes no progress for 20 s (`slideshowVideoStallMs`) is skipped at once, each with one log line. The screensaver hold, the hiding buttons, the bounded preview window and the pause at the end are unchanged, and a video that ends while more items load waits an interval instead of replaying.
- **Skipping.** A video's progress bar is focusable (Up from Play) and seeks with Left/Right; rewind and fast forward skip wherever focus is ([ADR 0020](0020-viewing-and-accessibility.md)). Seeking to the end of a slideshow's video ends it, and the slideshow moves on.
