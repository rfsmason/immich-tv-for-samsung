# ADR 0001: Start With A Minimum Static Tizen Web App

## Context

The target TV is a Samsung QE55Q950RBTXXU running Tizen 5.0 with Chromium M63. The first product milestone is to install and launch the smallest possible Tizen Web Application on the physical device.

Modern web tooling can be useful later, but it can also hide compatibility or packaging issues until there is more application code to untangle.

## Decision

Start with a static Tizen Web Application:

- `config.xml`
- `index.html`
- plain CSS
- plain ES5-compatible JavaScript
- a PNG launcher icon

Do not introduce React, TypeScript, Vite, Immich API code, or additional runtime dependencies before the physical TV deployment path is proven.

## Reasoning

This keeps Milestone 1 focused on Samsung tooling, signing, packaging, install, launch, and basic remote input. It also avoids conflating Tizen SDK issues with frontend build-system issues.

## Consequences

The first screen is intentionally simple and disposable. After successful TV deployment, the next architectural decision should choose the long-term UI/build approach and explicitly enforce Chromium M63 compatibility.

