# 0019 - Ambient mode and the TV screensaver

## Context

Milestone 18 asks for an ambient photo-frame or screensaver experience built on the existing viewer and slideshow, with bounded resource use over long sessions (hours, and overnight). The brief asks first whether the app can act as the TV's real screensaver, or should be an in-app ambient mode. Separately, the app never told the TV when the user was watching without pressing keys, which Samsung requires of store apps. The target remains the Samsung QE55Q950RBTXXU (2019, Tizen 5.0, Chromium 63). Milestone 17 is parked, so this ADR takes number 0019.

## Investigation (26 October 2026)

### The TV screensaver

- **Samsung's "Setting Screensaver" guide** ([developer.samsung.com](https://developer.samsung.com/smarttv/develop/guides/fundamentals/setting-screensaver.html)):
  - the TV screensaver prevents burn-in, and appears after a period without input;
  - apps switch it with `webapis.appcommon.setScreenSaver(state, onsuccess?, onerror?)`, where `state` is `webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF` or `SCREEN_SAVER_ON`;
  - **apps published to Samsung's store must disable it during passive viewing**, "such as video playback or image slideshows", and enable it when playback pauses or stops;
  - the calls have no effect when "Auto Protection Time" is off in the TV's settings.
- **AppCommon API reference** ([developer.samsung.com](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/appcommon-api.html)):
  - `void setScreenSaver(AppCommonScreenSaverState state, optional SuccessCallback? onsuccess, optional ErrorCallback? onerror)`;
  - since product API 2.3, on TV and B2B, which covers Tizen 5.0;
  - `SCREEN_SAVER_OFF = 0`, `SCREEN_SAVER_ON = 1`;
  - it can throw `TypeMismatchError`;
  - **no privilege is listed**, here or in the Samsung Product API index ([developer.samsung.com](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references.html)). `config.xml` is unchanged.
  - `webapis` comes from `<script src="$WEBAPIS/webapis/webapis.js"></script>` in `index.html`.
- **Samsung's Smart TV FAQ** ([Other Features, Q6](https://developer.samsung.com/smarttv/develop/faq/other-features.html)) repeats that apps use AppCommon to enable and disable the screensaver. It says nothing about Ambient Mode, keeping the screen on, or Auto Power Off.

### A third-party Ambient Mode or screensaver app

- No public SDK, manifest setting or registration exists for a third-party Tizen web app to act as the TV's screensaver or to appear in Samsung's Ambient Mode, on Tizen 5.0 or later:
  - Samsung's 20 Product APIs include none for it; AppCommon only defines an "Ambient" key name (since Tizen 4.0) among its key names.
  - Samsung's support pages describe Ambient Mode as a user feature showing Samsung's own content, with no developer route.
  - A Samsung developer-forum thread that discussed it ("Developing Ambient mode") now returns 404, and searches found nothing else.
- **Conclusion: in-app ambient mode, plus correct control of the TV's own screensaver.** If Samsung opens a screensaver or Ambient Mode route, this decision can be revisited (see Later).

### Other power controls

- `tizen.power.request("SCREEN", "SCREEN_NORMAL")`: Tizen's Power guide says the Power API is supported in mobile and wearable applications only. It isn't used.
- Nothing documented lets an app change the TV's "Auto Power Off", and it shouldn't. "Stop after" (below) hands back to the TV's own power saving instead.

## Decision

### Passive viewing (`src/platform/tizen/screensaver.ts`)

- `createPassiveViewing({ logger })` returns a reference counter. Each user calls `createHold()` and then `hold.set(active)`. A hold counts once however often it repeats itself.
- The TV is told only when the count crosses zero: `SCREEN_SAVER_OFF` when the first hold becomes active, `SCREEN_SAVER_ON` when the last one ends. Several things can be passive at once: a slideshow, a playing video, ambient mode.
- With no `webapis` (desktop preview, tests), it does nothing. A failure, thrown or reported through the error callback, is logged once and never reaches callers. If the enum is missing, the documented values (0 and 1) are used.
- **Where holds are taken:**
  - **The viewer** holds while it is open and a slideshow runs or a video or Live Photo motion plays (`syncPassiveViewing`, re-read on slideshow start and pause, the video's `playing`, `pause`, `ended` and `emptied` events, close, suspend and destroy). Pausing, finishing, closing the viewer, or the app being hidden (which suspends playback) releases it. Nothing resumes on its own when the app returns, so nothing re-holds then.
  - **Ambient mode** holds for as long as it runs (see below).
- `main.ts` creates the one instance and the application passes it to the screens that need it.

### Loading `webapis.js`

- `index.html` carries Samsung's documented tag, `<script src="$WEBAPIS/webapis/webapis.js"></script>`, before `scripts/main.js`. The TV's web runtime resolves `$WEBAPIS`.
- A desktop browser would request `/$WEBAPIS/webapis/webapis.js` and get a 404, so the desktop preview server (`scripts/serve-preview.mjs`) removes the tag when it serves `index.html`, as it already adds the preview-only script. The preview, the capture tooling and Playwright checks see no 404 and no console error.
- `npm run check` fails if the tag is missing or comes after `scripts/main.js`.
- **The staged widget still holds 7 runtime files**: `webapis.js` is provided by the TV, not packaged.
