# ADR 0003: TypeScript App Foundation

## Context

Milestone 2 proved that the Samsung Tizen TV app can render on the physical QE55Q950R and connect to Immich using the current documented API. Milestone 3 needs to turn that proof of concept into maintainable application code before album browsing adds more screens, navigation paths, and API calls.

The target remains Tizen 5.0 / Chromium M63, so the app must ship conservative browser JavaScript and avoid runtime dependencies that increase compatibility risk.

## Decision

Use TypeScript source modules under `src/` and bundle them with esbuild to `dist/scripts/main.js` using the explicit `chrome63` target. Keep the runtime app static: HTML, CSS, icon, manifest, and one bundled browser script.

Do not add React or another UI framework for this milestone. The app currently has one screen, remote-first focus handling, and a small amount of state. Plain DOM modules keep the widget small and make it easy to audit what will run on Chromium M63. A UI framework can be reconsidered when albums and media browsing prove that the interaction surface needs component-level structure.

## Boundaries

- UI modules may read and update DOM state, but they must not contain raw Immich endpoint paths, auth headers, `fetch`, `localStorage`, or scattered Tizen key constants.
- Immich API access lives behind `src/api/immich/` and uses the current endpoints `GET /api/server/version` and `GET /api/users/me`.
- Connection settings persistence lives behind `src/storage/`.
- Remote/focus behavior lives behind `src/navigation/` and `src/platform/tizen/`.
- The packaged widget is built from `dist/`, not from source files.

## Security Note

The app continues to store the user-entered server URL and API key in the TV web runtime's `localStorage`. This avoids baking credentials into the `.wgt` file and keeps setup lightweight for local use. The app never logs credentials, and the build/package flow excludes source maps, tests, tooling, and credential-like files from the production widget.

This is not equivalent to hardware-backed secure storage. A person or process with access to the TV web runtime storage could potentially recover the API key. Use an Immich API key scoped appropriately for TV browsing.

## Consequences

The development workflow now has a build step and CI checks: typecheck, lint, unit tests, build, and static runtime validation. The production widget remains small and static, while the source code is ready for the next milestone without carrying the Milestone 2 monolith forward.
