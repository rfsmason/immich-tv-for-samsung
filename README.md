# Immich TV for Samsung

Immich TV for Samsung is an unofficial, TV-first, read-only Samsung Tizen Web Application for browsing an Immich photo library.

The app installs as a native Tizen Web Application on the Samsung QE55Q950R. It connects directly to an Immich server and offers Home, Photos, Albums, People and Memories browsing, Search by people and dates, a full-screen viewer with video and Live Photo playback, a slideshow, and Settings, all operable with the Samsung Smart Remote.

## Current Status

- Target device: Samsung QE55Q950RBTXXU, 2019, Tizen 5.0 / Chromium M63. Application ID `imchTV0001.ImmichTV`.
- Milestones 1-15 are complete on `main`, and physical-TV acceptance of Milestones 12-15 passed on 26 October 2026. They include:
  - Home: bounded rails (Recently Added, Favourites, Videos, People, Recently Viewed, Albums and Memories).
  - Photos: the main timeline, with date sections and a timeline rail.
  - Albums: an album grid and album detail.
  - Memories: today's Memories.
  - Viewer: images, video and Live Photos, slideshow, and a local viewing history.
  - Settings: connection, display and Home preferences, with an unsaved-changes guard.
- Milestone 11.5, Foundation Hardening and Structural Refactor, passed physical-TV acceptance on 16 October 2026. It covers:
  - Chromium 63 fixes, with compatibility enforced by lint and static checks;
  - request timeouts and permission-specific errors;
  - Tizen lifecycle handling and an exit confirmation on Back at the application root;
  - decomposition of the shared collection screen and Home;
  - a screen registry for routing;
  - a minified bundle, an enforced formatter, and coverage thresholds.
- Milestone 12, People: Home's People rail ends with See more, which opens a paged grid of every recognised person. Choosing a person opens their photos and videos in the shared grid, viewer and slideshow. See [ADR 0013](docs/architecture/0013-people.md) and [docs/project-brief.md](docs/project-brief.md).
- Milestone 13, Search v1: Search finds photos by one or more people, a From and To date, or both, with remote-only controls: a people picker, chips and an inline date stepper. Results open in the shared grid, viewer and slideshow. See [ADR 0014](docs/architecture/0014-search.md).
- Milestone 14, Favorites and Library Views: Favourites, a new Videos rail and Recently added open as library views from Home, using the shared grid, viewer and slideshow. See [ADR 0016](docs/architecture/0016-library-views.md).
- Milestone 15, Personalisation and Navigation: held Up/Down on the Photos date rail speed up from months to years, CH ▲/▼ jump a year, Settings can turn each Home rail on or off, collections can be reversed between newest and oldest first, the viewer can show face tags, and every screen sits on one standard background. See [ADR 0017](docs/architecture/0017-personalisation-and-navigation.md).
- Milestone 16, Search v2, is in progress: media type, place and album criteria for Search.
- Requires Immich v3.2.0 or later (see [Immich Configuration](#immich-configuration)).

## Project Layout

```text
config.xml                  Tizen web application manifest copied into dist/
index.html                  App markup copied into dist/
styles/main.css             TV-first styling copied into dist/
src/app/                    Composition (main.ts, application.ts), shell, screen registry, services
src/api/immich/             Immich REST client, HTTP transport (timeouts, status mapping),
                            response DTOs, validators, mappers and the minimum version
src/domain/                 Application domain types
src/presentation/           Household-facing date, duration, Memory, person and Search labels
src/screens/                Screens and shared grid presentation
src/screens/collection/     Shared collection grid, Photos timeline, viewer and playback
src/screens/home/           Home rails: model, loaders, rendering, navigation, thumbnails
src/screens/people/         People grid and person card shared by the People browser and Search
src/screens/search/         Search criteria panel, date stepper and people picker
src/platform/tizen/         Remote keys, lifecycle and exit, Tizen runtime typings
src/storage/                localStorage-backed settings and viewing history
src/navigation/             Grid and focus navigation helpers
src/errors/, src/logging/   Typed application errors and redacting logger
src/test/                   Test-only helpers and fakes
scripts/                    Build, static and compatibility checks, packaging, deploy, preview
docs/                       Project brief, toolchain, deploy runbook and ADRs
dist/                       Generated runtime files, not committed
website/                    Public landing website (static, separate from the TV app)
```

## Local Checks

```sh
npm ci
npm run typecheck
npm run format:check
npm run lint
npm test
npm run test:coverage
npm run build
npm run check
npm run stage:tizen
```

- `npm run lint` runs ESLint (including `eslint-plugin-compat` for the `chrome 63` browserslist target) and the project's CSS and DOM-member Chromium 63 compatibility checks.
- `npm run format` applies Prettier and ESLint fixes; `npm run format:check` verifies formatting.
- `npm run test:coverage` runs the tests with V8 coverage and enforced minimums for `src/screens` and `src/app`.
- `npm run build` bundles `src/app/main.ts` for Tizen 5.0 / Chromium M63 into a minified `dist/`. `npm run build:debug` produces an unminified bundle for on-TV diagnosis.
- `npm run check` verifies the runtime files and manifest, that no source, tooling or source maps reach `dist/`, and that the built bundle uses no Chrome 64+ DOM members.
- `npm run stage:tizen` builds and stages exactly the runtime files that are packaged into the widget.

CI runs all of these on every pull request.

## Desktop Preview

Use the local preview server for browser smoke tests:

```sh
npm run preview
```

Then open the printed `http://127.0.0.1:<port>/` URL in Chrome or Safari. This avoids local file-preview differences and serves CSS/JavaScript with explicit MIME types and no caching.

The preview script is copied into `dist/` for local testing and injected by the preview server only. It is not linked from `index.html` and is not staged into the signed Tizen widget.

For local browser testing, the preview server also provides a same-origin proxy for Immich API and thumbnail requests. This avoids browser-only CORS failures during local Chrome/Safari testing; the packaged Tizen app still calls Immich directly using the network access declared in `config.xml`.

Scripted website screenshots and video walkthroughs: [docs/capture.md](docs/capture.md) (demo library only).

## Tizen Build Path

After installing Tizen Studio with the Web CLI and Samsung TV Extension packages, copy `.env.tizen.example` to `.env.tizen` and fill in your TV's SDB address, its target name and your certificate profile. The file is ignored by git, and the same settings can be set in the environment instead. Then:

```sh
npm run tizen:package
```

This first builds `dist/`, then stages only the production runtime app files under `.tizen/package-src`, builds from that clean directory, signs the widget, and writes `.tizen/package-src/.buildResult/ImmichTV.wgt`.

Then install and run the generated package on the TV using the connected target name from:

```sh
npm run tizen:devices
```

More detailed setup notes are in [docs/toolchain.md](docs/toolchain.md).

## Immich Configuration

The app requires **Immich v3.2.0 or later**. Album detail, Favourites and People use Immich's structured metadata search (`filter`, `orderBy` and `cursor`), which v3.2.0 introduced. `Test connection` warns when the server is older, but still lets you save the settings.

The TV app stores the Immich server URL and API key in browser `localStorage` on the device. Use the on-screen setup form to enter them and test connectivity. `Test connection` validates and checks the settings without saving them; `Save` persists them explicitly. When saved settings exist, the app opens on Home; use **Settings** in the navigation rail to change the connection later.

This is an intentional lightweight credential choice for the local TV app. The API key is not stored in source, not baked into the widget, not sent anywhere except the configured Immich server, and not logged by the app. Anyone with access to the TV runtime storage could potentially recover it, so use an Immich API key with only the access you are comfortable granting to the TV.

`.env.example` remains only a development reference. Do not commit real API keys or private server details.

### Required API key permissions

The app only reads from Immich. An API key needs these permissions, taken from the `@Authenticated` decorators of the Immich endpoints the app calls (Immich `main` at `1cf5bb4`):

| Permission | Used for | Endpoints |
| --- | --- | --- |
| `asset.read` | Photos timeline, Recently Added, album, Favourites, Videos, People and Search grids, and Recently Viewed | `GET /timeline/buckets`, `GET /timeline/bucket`, `POST /search/metadata`, `GET /assets/{id}` |
| `asset.view` | Thumbnails, viewer previews and video playback | `GET /assets/{id}/thumbnail`, `GET /assets/{id}/video/playback` |
| `album.read` | Albums | `GET /albums`, `GET /albums/{id}` |
| `person.read` | People and the Search people picker | `GET /people`, `GET /people/{id}/thumbnail` |
| `memory.read` | Memories | `GET /memories` |
| `memory.statistics` | The Memories rail's View all | `GET /memories/statistics` |
| `face.read` | The viewer's Faces button (optional) | `GET /faces?id={assetId}` |
| `user.read` | `Test connection` | `GET /users/me` |

`GET /server/version` needs no permission. A key without one of these permissions still works: the screen that needs it explains which feature the key cannot show, and without `face.read` the viewer turns Faces off for the session.

## Contributing, Security and Licence

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, the checks to run, and the project's rules.
- [SECURITY.md](SECURITY.md): how to report a security problem privately.
- Licensed under the [MIT Licence](LICENSE).

Immich TV for Samsung is an independent, unofficial client. It is not affiliated with or endorsed by Immich, FUTO or Samsung.
