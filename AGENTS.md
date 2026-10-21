# Immich TV for Samsung — Project Instructions

## 1. Project Objective

Build a native-feeling Samsung Tizen TV client for Immich.

The application will provide a television-optimised, primarily read-only interface to an existing Immich server.

This is **not** a port of the existing Immich web application and must not simply wrap the Immich web UI.

Instead, build a dedicated Samsung TV client using Samsung's Tizen Web Application platform and the documented Immich REST API.

The initial development and test device is:

- **Samsung Q950R 55"**
- **Model:** QE55Q950RBTXXU
- **Model year:** 2019
- **Platform generation:** Tizen 5.0
- **Web engine:** Chromium M63

The TV runs in Developer Mode and accepts development connections from the development machine.

Development will take place on macOS, using VS Code and command-line Tizen tooling where practical.

### Deployment runbook

When deploying to the physical Samsung TV, first read:

```text
docs/tizen-deploy-runbook.md
```

Prefer:

```text
npm run tizen:deploy
```

Known deployment facts:

- The TV's SDB address, its target name and the certificate profile are machine-specific. They come from the environment or an untracked `.env.tizen` (see `.env.tizen.example`); never hard-code them.
- App ID is `imchTV0001.ImmichTV`.
- Tizen CLI `install`, `run`, and `install-permit` expect the target name that `sdb devices` shows (on the Q950R test TV, its model code), not the raw SDB host.
- If deployment hangs, restart SDB before retrying; stale SDB agents have caused repeated deployment failures.


## 2. Product Goal

Create a polished Immich browsing and viewing application designed specifically for a television and Samsung Smart Remote.

The eventual application should allow a user to comfortably browse and display their Immich photo and video library from the sofa.

Longer term, the application should be suitable for use by other Immich users and potentially for distribution through the Samsung TV app ecosystem.

The architecture must therefore **not** make assumptions specific to one developer's own Immich installation.


## 3. Guiding Principles

### 3.1 TV-first UX

Do not attempt to reproduce the desktop or mobile Immich UI.

Everything must be usable with:

- Up
- Down
- Left
- Right
- OK / Enter
- Back
- Play / Pause where appropriate

Focus state must always be obvious.

There must never be functionality that requires a mouse, touchscreen, hover state, or conventional keyboard.


### 3.2 Read-only first

The initial application is a viewer.

Do **not** initially implement:

- upload
- delete
- asset modification
- metadata editing
- album editing
- administration

This substantially reduces both complexity and risk.


### 3.3 Immich remains the backend

Do not reproduce functionality already supplied by Immich.

Immich should continue to provide:

- authentication
- asset metadata
- albums
- thumbnails
- image resizing
- video/transcoding
- people/facial recognition
- search
- memories
- database/storage management

The Samsung application is a client of the Immich API.


### 3.4 No additional backend unless genuinely necessary

The preferred architecture is:

```text
Samsung TV
    |
    | HTTP/HTTPS
    | Immich REST API
    |
Immich Server
```

Do not introduce a proxy, companion server, database, or cloud service unless a specific requirement proves it necessary.

The application should ideally communicate directly with any compatible Immich server.


## 4. Technical Architecture

Use a Samsung Tizen Web Application.

Preferred application technologies:

- TypeScript
- HTML/CSS
- React if appropriate
- Vite or equivalent build tooling if compatible
- Samsung/Tizen Web APIs where required

However, compatibility with **Tizen 5.0 / Chromium M63** takes priority over use of modern framework features.

The build must target an environment compatible with Chromium 63.

Do not assume current Chromium/browser functionality merely because development takes place in a modern browser.

Transpile or polyfill functionality where necessary.


### 4.1 UI framework selection

Do not assume React is required.

Evaluate the UI framework during initial project setup.

React + TypeScript is an acceptable and likely choice if it provides a clean architecture and can be built reliably for Chromium 63 without excessive runtime or bundle overhead.

If a substantially simpler solution is more appropriate for this constrained TV application, explain the reasoning before choosing it.

Whichever approach is selected, use it consistently and according to its established architectural best practices.


## 5. Immich Integration

Use the current documented Immich REST API.

Do not scrape or automate the Immich web interface.

Prefer official and documented Immich API endpoints.

Where useful, investigate the official Immich TypeScript SDK or OpenAPI-generated client, but do **not** introduce it merely for convenience if it creates unnecessary bundle size or compatibility problems on Chromium M63.

Direct REST calls are acceptable and may be preferable for the TV client.

Keep Immich API access behind a clean service abstraction so API/version changes can be handled without affecting the UI.


## 6. Authentication

For the initial development / proof of concept, support:

- configurable Immich server URL
- Immich API key

The API key must **not** be hard-coded into source control.

Store credentials and configuration appropriately on the TV.

Longer term, authentication needs a consumer-friendly design because entering a long API key with a television remote is unacceptable UX.

A future pairing flow should be investigated, conceptually similar to:

```text
TV displays short pairing code
        |
User authenticates using phone/browser
        |
Immich authorises TV
        |
TV receives/stores credentials
```

Do not allow the future authentication problem to block the initial POC.


## 7. Networking

The Tizen application must declare the required Internet/network permissions in `config.xml`.

It must support Immich servers accessed using:

- local IPv4 address or hostname
- HTTPS URL

For development, local-network Immich installations must work without requiring public Internet exposure.

Be conscious of:

- CORS
- TLS/certificate validation
- mixed-content restrictions
- local/private network access
- HTTP vs HTTPS

Do not disable certificate validation as a general solution.


## 8. Image Handling and Memory

This is an important design constraint.

Samsung TVs have much less usable memory than desktop browsers.

Never load large numbers of full-resolution photographs simultaneously.

A compressed JPEG of a few megabytes can consume tens of megabytes after decoding into memory.

Use Immich-generated thumbnails and previews wherever possible.

For grids:

- use appropriately sized Immich thumbnails
- lazy-load images
- virtualise large lists/grids
- keep the number of live image DOM elements small
- release images/resources that have scrolled well outside the viewport

The application must be capable of browsing libraries containing tens or hundreds of thousands of assets without attempting to load the entire library into the DOM.

For full-screen viewing, prefer approximately:

```text
previous image
current image
next image
```

Preload only a small number of neighbouring assets.

Release previous decoded images aggressively.

Do not automatically retrieve original full-resolution assets when a suitable Immich preview is available.


## 9. TV Resolution

The target Samsung TV is an 8K Q950R, but normal Tizen Web Application UI is effectively designed around a 1920×1080 application canvas.

Design the UI for:

- 1920×1080
- 16:9

Do not design the general UI around an 8K canvas.

Image and video quality can be investigated independently from UI rendering resolution.


## 10. Remote Control

Samsung Smart Remote operation is fundamental, not an afterthought.

Implement deterministic spatial navigation.

Example:

```text
[Album 1] [Album 2] [Album 3] [Album 4]
[Album 5] [Album 6] [Album 7] [Album 8]
```

Expected behaviour:

- Right → next tile
- Left → previous tile
- Down → corresponding tile on next row
- Up → corresponding tile on previous row
- OK → open
- Back → previous screen

Focus must remain predictable when lazy loading or virtualisation adds or removes items.


## 11. Initial MVP / Proof of Concept

Do **not** start by building the complete application.


### Milestone 1 — Deploy the minimum Tizen application

Create the smallest possible Tizen Web Application and deploy it successfully to the physical QE55Q950R.

Display something equivalent to:

```text
Immich for Samsung TV
```

**Success criterion:** the application installs, launches, and responds correctly on the real television.


### Milestone 2 — Prove Immich connectivity

Add configuration for:

- Immich server URL
- API key

Make one authenticated Immich API request.

Display basic server or user information to prove connectivity.

**Success criterion:** Samsung TV → Immich API communication is proven.


### Milestone 3 — Application foundation

Convert the successful Immich connectivity proof of concept into the permanent application architecture.

Add:

- TypeScript source modules
- explicit Tizen 5.0 / Chromium M63 build target
- small production bundle
- unit tests
- linting and type checking
- CI
- build-output-based Tizen packaging

Separate:

- Immich API integration
- storage
- navigation
- Samsung/Tizen platform behavior
- UI/screens
- logging

Preserve the Milestone 2 connection setup behavior.

Do not add album browsing in this milestone.

**Success criterion:** the refactored app preserves Milestone 2 behavior on the physical TV and provides a maintainable foundation for album browsing.


### Milestone 4 — Albums

Retrieve the user's Immich albums.

Display albums in a TV-friendly grid.

Implement Samsung remote:

- directional navigation
- OK
- Back

**Success criterion:** albums can be browsed comfortably from the Samsung remote.


### Milestone 5 — Album assets

Open an album.

Retrieve its assets.

Display a virtualised or lazy-loaded thumbnail grid.

**Success criterion:** large albums can be browsed without excessive memory usage.


### Milestone 6 — Full-screen photo viewer

Implement full-screen photo viewing.

Support:

- Left → previous
- Right → next
- Back → return to grid

Preload neighbouring images sensibly.

**Success criterion:** smooth photo browsing on the physical TV without memory growth or crashes.


### Milestone 7 — Slideshow

Add slideshow mode.

Initial functionality:

- configurable/default interval
- automatic next image
- pause/resume
- exit/back

This represents the first genuinely useful release.


## 12. Later Features

Once the core architecture is proven, investigate:

- main photo timeline
- Memories
- People
- Search
- Favorites
- shared albums
- video playback
- slideshow options
- date/location information
- EXIF/photo information
- screensaver-style operation
- pairing/authentication flow

Do not build these before the basic viewing architecture is stable.


## 13. Video

Video is explicitly out of scope for the first POC.

Immich provides video playback/transcoding capabilities and Samsung Tizen provides HTML5 video and Samsung AVPlay facilities.

Once photographs are stable, investigate the most appropriate Immich video stream and whether HTML5 video or AVPlay provides the best Samsung compatibility.


## 14. Compatibility

Initial minimum supported platform:

- Tizen 5.0
- Samsung 2019 TVs

Primary physical test device:

- Samsung QE55Q950RBTXXU

Do not prematurely optimise for much older Samsung TVs.

Where practical, avoid unnecessary Tizen-5-specific dependencies so the application naturally works on newer Samsung/Tizen releases.


## 15. Suggested Project Structure

Structure the project so platform-specific and Immich-specific concerns are separated.

Suggested conceptual structure:

```text
src/
    api/
        immich/
    components/
    screens/
    navigation/
    platform/
        tizen/
    storage/
    models/
    utils/
```

Avoid placing Samsung API calls throughout UI components.

Likewise, avoid making raw Immich HTTP requests directly from UI components.

Use an Immich API/service layer.


## 16. Security

Never commit:

- API keys
- passwords
- private server URLs where inappropriate
- Samsung signing certificates/private keys
- local development credentials

Provide `.env.example` or equivalent where useful.

Ensure `.gitignore` excludes credentials, signing material, build artifacts, and machine-specific Tizen configuration.


## 17. Development Approach

The physical Q950R is the source of truth.

Desktop browser testing is useful for UI development, but something working in current Chrome does **not** mean it works in Chromium M63 / Tizen 5.

Regularly deploy milestones to the actual TV.

When a browser feature is introduced, verify Tizen 5 / Chromium M63 compatibility.

Avoid accumulating a large application before first deployment.


## 18. Current Project Status

The current status and roadmap live in `docs/project-brief.md` and `README.md`. Read them before starting work; the milestone list above describes the original plan.

Developer Mode tip for the Q950R: with the Samsung Smart Remote, open the numeric keypad on the main Apps screen and quickly enter:

```text
1 → OK
2 → OK
3 → OK
4 → OK
5 → OK
```

Developer Mode can remain enabled during normal TV use.


# Standing Engineering Instructions


## 20. Documentation and Platform Accuracy

Do not guess Samsung/Tizen or Immich APIs, capabilities, behaviours, or configuration.

When implementation depends on platform behaviour, verify it against the current official Samsung Developer or Immich documentation before implementing it.

Remember that the primary physical target is:

- Samsung QE55Q950RBTXXU
- 2019 model year
- Tizen 5.0
- Chromium M63

Current Samsung documentation may describe newer Tizen versions. Do not assume functionality documented for a newer version exists on Tizen 5.0.

Similarly, use the current documented Immich API rather than relying on old examples, undocumented endpoints, or assumptions about the Immich web application.


## 21. Application Architecture

At all times use an application architecture appropriate to the technologies, platform, and scale of this project.

Architecture is a first-class requirement.

Before introducing a new component, library, service, state-management mechanism, platform abstraction, or major dependency, consider where that responsibility belongs in the overall architecture.

Maintain clear separation of concerns between, at minimum:

- presentation/UI
- TV navigation and focus management
- application/domain logic
- Immich API integration
- authentication
- application state
- persistence/storage
- Samsung/Tizen platform integration
- configuration
- logging/error handling

UI components must not contain raw Immich HTTP calls.

Immich API code must not contain Samsung/Tizen UI logic.

Samsung/Tizen-specific APIs should be isolated behind appropriate platform abstractions rather than scattered throughout the application.

Do not introduce abstractions purely for their own sake. Prefer the simplest architecture that maintains clear responsibilities, testability, and future maintainability.


## 22. Immich API Boundary

Treat the Immich API as an external system boundary.

Do not allow raw Immich API response structures to become the application's domain model by default.

Where appropriate:

```text
Immich API response
        ↓
API DTO / generated type
        ↓
mapping / validation
        ↓
application / domain model
        ↓
UI
```

This allows Immich API changes to be isolated within the integration layer.

If the official Immich SDK or generated types are used, they remain integration-layer types rather than automatically becoming application-wide models.

Centralise endpoint and version compatibility handling inside the Immich integration layer.


## 23. Browser Compatibility Enforcement

Tizen 5.0 / Chromium 63 compatibility must be enforced by the build configuration, not merely assumed during development.

The project must explicitly define its browser/runtime target.

When choosing or configuring the build toolchain:

- ensure generated JavaScript is executable by Chromium 63
- transpile unsupported syntax
- provide polyfills only where genuinely required
- do not rely on modern module-loading/runtime behaviour unavailable on the TV
- verify third-party dependencies against the same target
- do not assume that successful compilation means runtime compatibility

Where practical, compatibility problems should fail during development/build rather than being discovered only after deployment to the TV.

The physical Samsung TV remains the final authority.


## 24. Best Practices

Application code must follow current best practices for the technologies being used while remaining compatible with Tizen 5.0 / Chromium M63.

In particular:

- use TypeScript strongly and avoid `any` unless genuinely necessary
- define clear interfaces/types for API and domain models
- keep components focused and reasonably small
- avoid duplicated logic
- avoid hidden global state
- avoid unnecessary side effects
- clean up timers, event listeners, and allocated resources
- handle asynchronous operations and cancellation correctly
- handle loading, empty, and error states explicitly
- validate external/API data where appropriate
- provide meaningful error handling rather than silently swallowing failures
- use consistent naming and project conventions
- prefer composition over tightly coupled implementations
- keep dependencies to a justified minimum
- do not add a library for functionality that can be implemented simply and reliably without one


## 25. TV-Specific Engineering

This is a television application, not a desktop web application displayed on a large screen.

Treat the following as architectural concerns:

- deterministic remote-control navigation
- focus management
- focus restoration when returning to a previous screen
- performance on constrained hardware
- bounded memory consumption
- image lifecycle management
- lazy loading and virtualisation
- avoiding unnecessary DOM elements
- avoiding unnecessary re-renders
- predictable Back-button behaviour
- overscan/safe-area considerations where applicable
- readability at normal television viewing distance

Do not retrofit TV navigation after building mouse-oriented screens.


## 26. Interaction Acceptance Rule

Every completed screen must be fully operable using only the Samsung Smart Remote.

Mouse interaction in a desktop browser is a development convenience and must never be required for application operation.

Before considering a screen complete, verify:

- initial focus is deterministic
- every actionable element is reachable
- focus never becomes lost or invisible
- Back behaves predictably
- focus is restored appropriately after returning from child screens
- navigation remains correct after lazy loading or virtualisation
- loading and error states remain navigable


## 27. Performance and Memory

Performance must be considered during implementation rather than as a later optimisation exercise.

Never assume desktop-class CPU, GPU, or memory availability.

For collections of Immich assets:

- paginate data
- virtualise large visual collections
- request appropriately sized thumbnails/previews
- bound caches
- release unused image resources
- avoid retaining unnecessary object graphs
- avoid rendering an entire Immich library into the DOM
- measure behaviour on the physical TV regularly

Prefer predictable bounded resource usage over aggressive preloading.


## 28. Security

Follow security best practices from the beginning.

Never commit:

- Immich API keys
- passwords
- access tokens
- signing certificates
- certificate private keys
- machine-specific secrets

Do not disable TLS/certificate verification as a workaround.

Do not log credentials or authentication headers.

Persist authentication material only where necessary and using the safest storage mechanism reasonably available on the target platform.

The initial application should request or use only the Immich permissions required for its read-only functionality.


## 29. Error Handling and Observability

Design errors so they can be diagnosed on both the development machine and the physical TV.

Use a consistent logging mechanism rather than ad-hoc console statements throughout the codebase.

Distinguish where practical between:

- network failure
- authentication failure
- Immich API failure
- invalid/unexpected response
- unsupported Tizen functionality
- rendering/application failure

User-facing errors should be understandable from across the room and should not expose sensitive technical information.

Development diagnostics should contain sufficient information to troubleshoot the underlying problem.


## 30. Testing

Write code in a way that allows important application logic to be tested without requiring a physical Samsung TV.

Where appropriate, provide:

- unit tests for application/domain logic
- tests for Immich API mapping/handling
- tests for navigation/focus logic
- mocks/adapters for Samsung-specific functionality

Do not attempt to mock away all real-device testing.

The QE55Q950R is the authoritative integration environment and significant milestones must be tested on the physical TV.


## 31. Dependencies

Before adding a dependency:

1. Determine whether it is genuinely needed.
2. Verify compatibility with the project's build target.
3. Consider bundle size and runtime cost.
4. Prefer mature, actively maintained dependencies.
5. Avoid dependencies requiring browser functionality unavailable in Chromium 63.

Do not blindly install packages suggested by examples or generated code.


## 32. Reproducible Development Environment

Keep the development environment reproducible.

Pin or explicitly document important tool versions including, where applicable:

- Node.js
- package manager
- Tizen CLI/SDK
- Samsung TV extensions
- TypeScript
- build tooling

Commit the package-manager lock file.

Do not depend on globally installed JavaScript packages where a project-local dependency is more appropriate.

Document the required SDK/toolchain setup in `README.md`.

A fresh development machine should be capable of building and deploying the application by following the documented setup procedure.


## 33. Codebase Hygiene

Keep the repository deployable and understandable throughout development.

For each meaningful change:

- keep formatting and linting clean
- keep TypeScript compilation clean
- run relevant tests
- ensure the application still builds
- avoid leaving dead code or commented-out implementations
- update documentation when architecture or setup changes

Do not knowingly leave architectural debt for a later cleanup unless it is explicitly documented and justified.


## 34. Source Control

Make changes in small, coherent units.

Commit messages should clearly describe the purpose of the change rather than merely listing modified files.

Never commit generated credentials, local SDK state, build output, or machine-specific configuration.

Maintain an appropriate `.gitignore` from the beginning.


## 35. Architectural Decisions

Record significant architectural decisions in a lightweight form under:

```text
docs/architecture/
```

Use short Architecture Decision Records (ADRs) for decisions that would otherwise be difficult to understand later, for example:

- UI framework choice
- build/transpilation strategy
- navigation architecture
- state-management approach
- Immich API abstraction
- authentication architecture
- image caching strategy
- video playback architecture

An ADR should briefly record:

- context
- decision
- reasoning
- important consequences

Do not create ADRs for trivial implementation details.


## 36. Avoid Over-Engineering

Good architecture does not mean maximum abstraction.

Do not introduce:

- dependency-injection frameworks
- global state libraries
- event buses
- complex repository patterns
- elaborate abstraction hierarchies
- microservices
- additional backend services

unless the application's requirements justify them.

Prefer straightforward TypeScript abstractions and composition.

A useful abstraction should isolate a real responsibility, platform dependency, external system boundary, or area of complexity.

Do not create abstractions simply because they are common in larger applications.

The target is a clean, professional, maintainable TV application — not an enterprise architecture demonstration.


## 37. Decision Making

When there are multiple technically valid approaches, prefer in this order:

1. Correctness on the physical Samsung TV.
2. Compatibility with Tizen 5.0 / Chromium M63.
3. Correct application architecture and separation of concerns.
4. Reliability and maintainability.
5. Performance and bounded resource usage.
6. Simplicity.
7. Developer convenience.

Do not sacrifice runtime architecture or maintainability merely because a shortcut is faster to implement.


## 38. Continuous Architectural Review

As the application grows, continually assess whether the existing architecture still fits the application.

Do not allow proof-of-concept shortcuts to silently become production architecture.

When moving from a POC implementation into a permanent feature, explicitly consider whether the POC implementation should be refactored first.

If a requested change would materially compromise the architecture, security, Tizen compatibility, or maintainability, explain the concern and propose the better implementation rather than simply implementing the shortcut.


## 39. Definition of Done

A change is not complete merely because it appears to work in a desktop browser.

For any meaningful feature, consider it complete only when the relevant criteria are satisfied:

- code follows the project architecture
- TypeScript/build checks pass
- relevant tests pass
- browser/runtime compatibility requirements are respected
- remote-control navigation is correct where applicable
- error/loading/empty states are handled
- memory/resource behaviour is appropriate
- documentation is updated where needed
- no secrets or local-only configuration have been introduced
- the feature has been tested on the physical Samsung TV when the change depends on Tizen/runtime behaviour

The physical QE55Q950R remains the final integration authority.


## 40. Core Standing Instruction

Do not guess Samsung/Tizen or Immich APIs.

Use the correct application architecture for the technologies in use at all times.

Ensure application code follows established best practices while respecting the constraints of Tizen 5.0 / Chromium M63.

Prefer simple, maintainable, well-separated solutions over shortcuts or unnecessary complexity.

When implementation depends on platform behaviour, verify it against official Samsung Developer or Immich documentation before proceeding.

When there is tension between a modern web-development convenience and reliable behaviour on the target television, the target television wins.
