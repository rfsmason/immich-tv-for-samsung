# ADR 0002: Add Immich Connectivity Without A Build Step

Status: Superseded for source architecture by ADR 0003. The Immich API and credential decisions remain current.

## Context

Milestone 2 needs to prove that the installed Samsung Tizen TV application can reach an Immich server with a user-provided server URL and API key.

The target TV runs Tizen 5.0 with Chromium M63, so the application should avoid modern syntax and build tooling until the API and rendering behavior are proven on the physical device.

## Decision

Keep the app as a static Tizen Web Application and add:

- An on-device setup form for the Immich server URL and API key.
- A show/hide toggle for the API key field to make TV entry less error-prone.
- `localStorage` persistence for connection settings.
- A server probe to the current Immich API endpoint `GET /api/server/version`.
- An authenticated probe to `GET /api/users/me` with the API key sent in the `x-api-key` header.
- Tizen network permissions in `config.xml`.
- A desktop-preview-only same-origin proxy so local Chrome/Safari testing does not fail on browser CORS before the app reaches the TV.

## Reasoning

This proves the network path, certificate, widget permissions, remote navigation, and API-key authentication before adding album browsing or media rendering.

## Consequences

Connection settings are currently stored in the TV web runtime, not in source files. The app remains dependency-free, but future milestones should revisit state management if the UI grows beyond a few screens.
