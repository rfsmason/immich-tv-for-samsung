# 0008 - Reusable Asset Collections

## Context

Milestones 5-7 built album asset browsing, the full-screen viewer, video and Live Photo playback, and slideshow around an album detail screen. Milestone 9 adds Photos as a chronological main library timeline, and later milestones will need similar ordered asset collections for Home rails, People, Search, Favorites, Videos, Memories, and shared content.

Copying the album asset grid or creating a separate Photos viewer would duplicate pagination, thumbnail retention, preview loading, playback, slideshow, focus restoration, and stale-request handling.

## Decision

Represent visible asset browsing as a small source-aware ordered collection:

- Album sources provide an album id, album ordering, and album total.
- Photos provides the timeline source identity and uses Immich timeline buckets for date navigation plus bucket-based asset pages.
- The Immich integration layer maps both API paths into the same domain asset page model.
- The shared screen controller owns bounded grid rendering, thumbnail lifecycle, viewer lifecycle, slideshow lifecycle, focus restoration, and page append behaviour.

Photos date context is rendered as non-focusable full-width date section headings inside the grid. A compressed right-side timeline rail is rendered from Immich bucket metadata and is focusable with the remote, allowing fast jumps to a selected time bucket without loading the entire library.

## Reasoning

The important shared responsibility is not a broad framework; it is the ordered, paged asset collection that feeds a TV grid and viewer. Keeping this as a small source model preserves the existing album behaviour while letting Photos reuse the proven resource and navigation paths.

The API boundary remains responsible for Immich request construction, bucket/page token interpretation, and DTO-to-domain mapping. Screens continue to work with domain assets, timeline buckets, and page tokens rather than raw Immich responses.

## Consequences

Future collection sources should plug in by adding a source loader that returns the same asset page shape. They should not create new thumbnail, viewer, slideshow, or playback engines.

Heavy media resources remain bounded by the thumbnail and viewer retention windows. Loaded asset metadata may be retained during the current application session to restore useful Photos position after navigating away, but thumbnails, preview URLs, playback URLs, and stale async generations are released or invalidated when the screen is hidden.
