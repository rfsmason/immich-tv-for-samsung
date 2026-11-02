# 0022 - Connection Details From the Installer

## Context

Entering a server URL and a long API key with the remote is the slowest part of setting up the app. Pairing with a phone (Milestone 19) is the long-term answer, but it isn't built yet.

Immich TV is listed in Apps2Samsung's [community catalogue](https://github.com/Apps2Samsung/tizen-community-packages), which most beta testers install from. A catalogue entry can declare `user_settings`. Apps2Samsung then:

- shows a short form before installing;
- keeps the answers on that computer and fills them in again for updates;
- writes each answer into a named file in the package, by replacing exact text, before it signs the package for the user's TV.

It escapes quotes and backslashes in text values, and the install fails if the text to replace is missing ([packages/README.md](https://github.com/Apps2Samsung/tizen-community-packages/blob/main/packages/README.md#%EF%B8%8F-user-settings)). Apps2Samsung also has its own built-in support for ImmiTV, a different Immich client, which rewrites that app's `js/config.js`. This app uses the generic mechanism instead, so its catalogue entry is all that's needed.

## Decision

- **A preset file in the package.** `scripts/install-preset.js` sets `window.IMMICH_TV_INSTALL_PRESET = { serverUrl: "", apiKey: "" }`. `index.html` loads it before `scripts/main.js`, and the build, the package and `scripts/check-static-app.mjs` all include it.
  - Apps2Samsung's form replaces the exact text `serverUrl: ""` and `apiKey: ""`. So the static check fails unless each appears exactly once, and `scripts/install-preset.test.mjs` replays the catalogue's escaping to make sure the patched file still runs.
  - A package installed any other way keeps both values empty.
- **Applied once, at startup.** Before the application is composed, `src/app/install-preset.ts`:
  1. reads the preset;
  2. validates it with the same rules as the Settings form;
  3. saves it as the connection, if it differs from the last preset applied.
  - It records a 32-bit FNV-1a fingerprint of the applied preset under `immich-tv.install-preset`. This is a check for change, not a second copy of the key.
  - The next start with the same preset leaves the saved connection alone. A change made in Settings on the TV therefore stands until the app is reinstalled with different details.
  - An empty preset is ignored. An incomplete or invalid one is also ignored, with a warning that leaves out both values.
- **The catalogue entry.** `packages/rfsmason__immich-tv-for-samsung.json` in that repository adds two fields, Immich server URL and API key, with a `help_url` pointing to the README's API key permissions.
  - Its `find` strings must match `scripts/install-preset.js`, and that pull request is opened only after a release that contains the file. The catalogue always ships the newest release, so an entry that expected the text while the latest package lacked it would fail every install.

Physical-TV acceptance passed on the 2019 Q950R on 2 November 2026 (user confirmation). The test installed a hand-filled package through Apps2Samsung's custom `.wgt` option and checked four things:

- the first start opened connected;
- a change made in Settings survived a restart and a reinstall with the same details;
- a reinstall with new details replaced the connection;
- an empty preset behaved as before.

## Consequences

- Testers who install from the catalogue can start the app already connected, without typing a key on the TV.
- The key sits in the installed package on the TV as well as in its local storage. Apps2Samsung also keeps it on the computer, so it can fill the form again for updates. Both stay with the user, and the help link recommends a read-only key that can be revoked.
- Release packages still carry no credentials. Only the user's own Apps2Samsung install writes them in.
- Reinstalling with changed details replaces the connection saved on the TV. Reinstalling with the same details doesn't.
- Pairing (Milestone 19) remains the general answer for other install routes and for a store release.
