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

The first slideshow version is intentionally still-image oriented. Future video-specific slideshow behavior can be designed separately after physical-TV playback behavior is better understood.

If the viewer reaches the loaded asset edge while more assets are being fetched, slideshow waits for the existing pagination path. If there are no more loaded assets to advance to, slideshow pauses rather than wrapping or inventing a second pagination mechanism.
