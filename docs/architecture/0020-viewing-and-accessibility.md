# 0020 - Viewing and accessibility polish

## Context

Milestone 18.5 adds four things the user chose on 28 October 2026, ahead of Milestones 17 (parked), 19 and 20: a high-contrast display option, a choice of when the playback buttons fade, slideshows that play videos in full, and skipping through a video with the remote. The light-blue text styling stays the default look; high contrast is the alternative for people who need it. The target remains the Samsung QE55Q950RBTXXU (2019, Tizen 5.0, Chromium 63), operated with the Smart Remote.

Milestone 17 is parked, so this ADR takes number 0020; Milestone 17 takes the next free number when it resumes.

## Platform and API behaviour verified

- **Remote keys.** Samsung's remote control guide lists `MediaRewind` (412) and `MediaFastForward` (417) beside `MediaPlayPause` (10252), `MediaPlay` (415) and `MediaPause` (19). Only the arrows, Enter and Back arrive without registration; the others are registered with `tizen.tvinputdevice.registerKey`. The guide lists Rewind and Fast Forward on the standard remote; the Smart Remote has only essential keys, so the 2019 Smart Remote has no rewind or fast-forward button. ([Samsung: Remote Control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html))
- **The TV's own High Contrast setting.** The brief expected no public way to read it. Samsung's TvInfo product API does list `ACCESSIBILITY_HIGH_CONTRAST` (13) among its `TvInfoMenuKey` values, read with `webapis.tvinfo.getMenuValue()` (TV, since product API 2.3, no privilege); writing is B2B-only. The key itself carries no "since" version, and no change listener is documented for it (the documented listener takes caption keys). So following the TV's setting on Tizen 5.0 is possible in principle but unconfirmed; it is recorded under Later as an option to verify on the Q950R, not built. ([Samsung: TvInfo API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/tvinfo-api.html))
- **WCAG.** 2.2.1 Timing Adjustable: turning a time limit off is the strongest option, then adjusting it over a wide range ([Understanding 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)). 1.4.6 Contrast (Enhanced): 7:1 for normal text ([Understanding 1.4.6](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html)). 1.4.11 Non-text Contrast: 3:1 for control boundaries and focus indicators ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- **Seeking.** HTML5 `<video>` seeks by setting `currentTime`, supported long before Chromium 63 ([MDN: currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)). Immich's `GET /assets/{id}/video/playback` is documented as supporting byte range requests; the controller streams through `sendFile`, which uses Express's `res.sendFile`, whose `acceptRanges` defaults to on ([Immich asset-media.controller.ts](https://github.com/immich-app/immich/blob/main/server/src/controllers/asset-media.controller.ts), [Immich utils/file.ts](https://github.com/immich-app/immich/blob/main/server/src/utils/file.ts), [Express res.sendFile](https://expressjs.com/en/api.html#res.sendFile)). A seek far into a long video therefore requests the bytes it needs rather than restarting the download; the TV checklist confirms this.

## Decision

### High contrast

- **Tokens first.** Every theme colour in `styles/main.css` is a named token on `:root`: text strengths, status, surfaces, controls, focus, selection, progress and backing over photos. Badge glyphs, the spinner, drop shadows, the face-box outline and ambient mode's black letterbox stay local as media-only colours, with a comment. The extraction was pixel-neutral: expanding the tokens gave the old stylesheet byte for byte, and every element in the app's markup computed the same styles before and after.
- **One root attribute.** High contrast is `data-contrast="high"` on `<html>`, set by `src/screens/theme.ts`. Under `:root[data-contrast="high"]` there are token overrides only, no component rules. A few tokens exist only for it and change nothing by default: a solid plate (and its padding and radius) behind text over photos, a double edge on the selected item, a dashed edge and full opacity when disabled, opaque badges and a white progress fill.
- **The palette.** White text on solid black, with the background picture covered by an opaque wash; panels, lists, dialogs and the viewer backdrop are opaque; every control has a light grey edge; focus is the white fill with a black band and a white outer band, so it shows on any background, photos included. Selection is a double white edge on a dark grey fill, and a chosen picker item keeps its ring and check mark.
- **Measured ratios** (`node scripts/check-contrast.mjs --report`; default theme measured on its solid app colour, not the picture):

| Pair | Default | High contrast | Target (high) |
| --- | --- | --- | --- |
| Primary text on the app background | 10.69 | 21.00 | 15 |
| Muted text | 7.24 | 15.91 | 7 |
| Secondary and hint text | 6.95 / 5.58 | 15.91 | 7 |
| Placeholder text in a control | 3.02 | 12.55 | 7 |
| Text on a focused (light) control | 18.47 | 21.00 | 7 |
| Text on the selected item | 8.17 | 12.63 | 7 |
| Text in a drop-down list | 9.84 | 21.00 | 7 |
| Text over photos on its plate | 10.32 | 21.00 | 7 |
| Error / warning / success status | 4.55 / 9.92 / 7.45 | 9.20 / 14.88 / 14.68 | 4.5 |
| Control edge on the app background | 2.18 | 11.42 | 3 |
| Focused control against the background | 17.68 | 21.00 | 3 |
| Focus ring's dark band against the control and its outer band | 2.14 | 21.00 | 3 |

- **The contrast check.** `scripts/contrast-rules.mjs` computes WCAG ratios for those token pairs (compositing translucent colours) and `scripts/check-contrast.mjs` runs it in `npm run lint`. High contrast fails below its targets. The default theme fails only below 4.5:1 for body text (primary and muted) and otherwise reports, because its look is the user's choice. It also fails a theme colour written outside the tokens, so a new colour can't bypass high contrast unnoticed.
- **Before the first paint.** `main.ts` reads the saved setting synchronously and sets the attribute before it waits for the splash to be drawn; saving Settings applies a change at once. `webapis.js` loads before `main.js` at the end of `<body>`, so the browser could paint the splash in the normal colours while it waits; if the TV shows that flash, the fix is a tiny inline script in `<head>` (Tizen apps have no CSP here).
- **Unchanged:** layout, sizes and fonts, and everything with high contrast off.

### When the playback buttons fade

- `AppSettings.playbackButtonsHide`: 3, 5 (default), 10 or 15 seconds, or Never, under Settings → Display → Hide playback buttons (the shared drop-down; schema version 4). Common TV players hide their controls after about 3-5 seconds; 15 seconds covers people who need longer to find and read a control; Never meets WCAG 2.2.1's "turn off", the strongest form. The previous fixed 4 seconds isn't an option, so stored settings take the 5-second default.
- `viewer-autohide.ts` reads the choice whenever playing starts or a key is pressed. With Never nothing hides, so no key is spent showing the buttons. Ambient mode has no buttons and is unaffected.

### Slideshows play videos in full

- With "Autoplay videos" on, a slideshow plays each video to its end through the viewer's own playback (`startViewerMedia`), with sound, then moves on; the interval doesn't apply to it. Photos and Live Photos (shown as stills) keep the interval. With autoplay off, a video shows its poster for the interval, as before.
- Play/Pause pauses the video and the slideshow together; resuming continues the video from where it was. Play on the video pauses both. Left/Right pause the slideshow, then move, as before.
- Only the Slideshow button shows that the video plays: its countdown bar follows the video's remaining time, as it follows the interval for a photo, and Play keeps its play symbol. A video played on its own (Play) shows Pause on Play, as before. (TV finding, 29 October 2026.)
- A video that doesn't start, or reports an error, shows its poster for the interval and is skipped, with one log line. One that makes no progress (no `timeupdate`) for `slideshowVideoStallMs` (20 s) is skipped at once. A video paused while it was still starting stays paused.
- The slideshow and its video share the passive-viewing state, so the TV screensaver hold has no gap; the buttons hide as chosen throughout; preloading stays within the bounded previous/current/next window; the end of the collection pauses as before, and a video that ends while more items load waits an interval rather than replaying. Ambient mode keeps its own 60-second cap.
- The logic lives in `viewer-slideshow.ts`; the Play toggle and suspension moved into `viewer-playback.ts` first (a pure move), so `asset-viewer.ts` only wires the video's events.

### Skipping through a video

- `src/screens/collection/viewer-seek.ts`. While a video (not a Live Photo) shows, the progress bar (`#asset-viewer-seek`) is a slider with `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and a spoken value such as "Video position, 1:23 of 4:05".
- **Navigation.** The viewer's buttons form one vertical column with Play at the top, and Up from Play did nothing, so Up from Play reaches the bar in one press; Up or Down from the bar returns to Play. Left/Right on the picture or the buttons keep moving between items: the bar is the only place they skip. OK on the bar plays or pauses; Back keeps its meaning.
- **Steps.** `seekStepSeconds`: 10 s for a press or a hold under a second, 30 s held 1-3 s, 60 s held longer, through the date rail's hold accelerator (ADR 0017).
- **Coalescing.** Each key shows the target (elapsed time, fill and slider value) at once; `currentTime` is set when the key is released or after `seekCommitDelayMs` (300 ms) without a key, so a burst is one seek. Targets are clamped to 0 and to `seekEndMarginSeconds` (0.5 s) before the end; a pending seek belongs to its video and is dropped if another asset shows. Seeking works while paused, showing the new frame. Seeking to the end lets the video end normally, which in a slideshow moves on.
- **Media keys.** `MediaRewind` and `MediaFastForward` are registered best-effort with the other optional keys; while a video shows they skip -10 s and +10 s with the same acceleration wherever focus is, and act at once even when the buttons have faded. Elsewhere they do nothing. The desktop preview maps `,` and `.` to them (ADR 0015's precedent), except while typing in a text field.

## Consequences

- High contrast costs no component CSS: it is about 90 token values, and the check keeps it honest as screens change.
- Settings schema version 4 (High contrast at 3, Hide playback buttons at 4); older files load with high contrast off and the 5-second default.
- `asset-viewer.ts` is 886 lines (895 before the milestone), with the Play toggle moved to `viewer-playback.ts` (527) and seeking in `viewer-seek.ts` (133).
- No framework, dependency or preprocessor; the CSS, contrast and JS compatibility checks pass. Physical Q950R acceptance is pending.

## Later

- A larger-text option, if sizes matter to readability from the sofa.
- Following the TV's own accessibility settings (High Contrast via `getMenuValue(ACCESSIBILITY_HIGH_CONTRAST)`, perhaps `UI_TIMEOUT`) once verified on the Q950R.
- Captions for videos.
