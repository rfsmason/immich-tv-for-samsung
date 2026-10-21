# 0015 — Desktop Back key translation

## Context

The desktop preview's key-name fallbacks included Backspace and Escape, but actual browser KeyboardEvents carry native codes 8 and 27. The native-code return happened first, so those keys did not reach the fallback. Scripted capture and manual remote-only preview both need a reliable Back key.

## Decision

Translate desktop Backspace and Escape to the existing remote Back action before returning a native key code. Keep Backspace as normal editing when the target is an input, textarea or editable region. Detect desktop by the absence of the existing optional Tizen runtime; accept an optional runtime argument for focused unit tests.

## Reasoning and consequences

Key translation belongs in the existing platform/key boundary. Screens continue to use their established Back actions and preventDefault handling; browser history is never used. Tizen's native codes remain authoritative and unchanged. Tests cover real desktop codes, editing targets and the Tizen path. Capture tooling uses existing presentation hooks and needs no UI branches or storage schema changes. The extra desktop mapping adds a small amount to the production bundle; physical TV acceptance remains necessary for app milestones.
