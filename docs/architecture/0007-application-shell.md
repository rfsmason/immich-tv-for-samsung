# 0007 - Application Shell and Top-Level Navigation

## Context

Milestones 1-7 built an Albums-first viewing flow. The application now needs stable top-level destinations before Home, Photos, Search, and other first-class screens are added.

The target remains Tizen 5.0 / Chromium M63, so the shell must stay small, deterministic, and independent of modern routing libraries.

## Decision

Use a lightweight TypeScript application shell with explicit top-level destination identifiers:

- Home
- Photos
- Albums
- Search
- Settings

The shell owns splash dismissal, top-level destination activation, navigation rail focus, and Settings return history. Individual screen controllers continue to own their internal lifecycle, grid navigation, viewer state, forms, and unsaved-change handling.

Albums remains the startup destination when valid Immich connection settings exist. Settings remains the startup destination when connection settings are absent. Home is present in the shell but does not become the default route until the Home milestone.

The splash renders immediately and remains visible only while startup state is genuinely being restored. Once configuration state is known, the shell routes without an artificial display delay so startup speed is not traded away for branding.

**Update, 22 October 2026 (TV testing).** On the TV the splash appeared late and only for a moment, and Home then filled in rail by rail. Two changes:

- `main.ts` assembles the app only after the splash has been drawn (one animation frame, then a timeout), so the splash shows at once and the app loads behind it.
- With a saved connection, `start()` activates Home without revealing it (`activateDestination(..., { reveal: false })`). The splash reads "Loading your library..." until every Home rail has loaded or failed (`homeScreen.whenLoaded()`), then `revealApp()` shows Home, focuses Home in the rail and Home re-aligns its rails. A server that stalls rather than refusing would hold rails for their request timeouts, so Home is revealed after at most 10 seconds and any remaining rails finish on screen. Reveal happens once, so a late finish can't move focus.

This is still not an artificial delay: the splash covers real loading, and Home opens complete instead of filling in. Without a saved connection, Settings appears immediately as before.

## Reasoning

A small destination model gives the app a permanent navigation boundary without introducing a framework router, global state library, or event bus. It also prevents future screens from being bolted onto the original Albums-only flow.

The shell exposes only coarse lifecycle and focus methods to screens. This keeps top-level navigation separate from screen-specific concerns such as virtualised album grids, asset viewer controls, Samsung keyboard handling, and dirty Settings state.

## Consequences

Future top-level screens should plug into the shell by implementing the same small screen controller contract.

Screen-level navigation should return focus to the shell at deliberate boundaries, such as left from the first content column or Back from a top-level placeholder. The shell should not reach inside grids or forms to manage their internal focus. When a child screen such as album detail is active, the rail collapses to icon-only so top-level navigation remains available without competing with the content.
