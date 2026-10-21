import { describe, expect, it } from "vitest";
import type { AlbumAsset, TimelineBucket } from "../domain/album";
import {
  doesAssetBelongToTimelineBucket,
  findBucketIndexForAsset,
  findFirstAssetIndexForBucket,
  getAssetDateContext,
  getNextAssetSectionIndex,
  getAssetSectionColumn,
  isAssetSectionRowEnd
} from "./asset-date-groups";

function asset(id: string, capturedAt: string | null): AlbumAsset {
  return {
    capturedAt,
    durationMs: null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: `${id}.jpg`,
    type: "image"
  };
}

function bucket(timeBucket: string): TimelineBucket {
  return {
    assetCount: 1,
    timeBucket
  };
}

describe("asset date grouping", () => {
  it("labels the first asset in each captured day", () => {
    const assets = [
      asset("a", "2026-10-14T12:00:00.000Z"),
      asset("b", "2026-10-01T09:00:00.000Z"),
      asset("c", "2026-09-30T18:00:00.000Z")
    ];

    expect(getAssetDateContext(assets, 0).label).toBe("Wed 14 Oct 2026");
    expect(getAssetDateContext(assets, 1).label).toBe("Thu 1 Oct 2026");
    expect(getAssetDateContext(assets, 2).label).toBe("Wed 30 Sep 2026");
  });

  it("keeps unknown date context sparse", () => {
    const assets = [asset("unknown", null), asset("known", "2026-08-01T00:00:00.000Z")];

    expect(getAssetDateContext(assets, 0).label).toBe("Unknown date");
    expect(getAssetDateContext(assets, 1).label).toBe("Sat 1 Aug 2026");
  });

  it("matches assets to timeline buckets by Immich month bucket", () => {
    const octoberBucket = bucket("2026-10-01");
    const novemberBucket = bucket("2026-11-01");
    const octoberAsset = asset("october", "2026-10-06T18:42:11.000Z");
    const novemberAsset = asset("november", "2026-11-02T09:15:00.000Z");

    expect(doesAssetBelongToTimelineBucket(octoberAsset, octoberBucket)).toBe(true);
    expect(doesAssetBelongToTimelineBucket(novemberAsset, octoberBucket)).toBe(false);
    expect(findBucketIndexForAsset([octoberBucket, novemberBucket], octoberAsset)).toBe(0);
    expect(findFirstAssetIndexForBucket([novemberAsset, octoberAsset], octoberBucket)).toBe(1);
  });

  it("calculates visual row edges within date sections", () => {
    const assets = [
      asset("day-one-a", "2026-10-14T12:00:00.000Z"),
      asset("day-one-b", "2026-10-14T13:00:00.000Z"),
      asset("day-one-c", "2026-10-14T14:00:00.000Z"),
      asset("day-one-d", "2026-10-14T15:00:00.000Z"),
      asset("day-one-e", "2026-10-14T16:00:00.000Z"),
      asset("day-two-a", "2026-10-01T09:00:00.000Z"),
      asset("day-two-b", "2026-10-01T10:00:00.000Z")
    ];

    expect(getAssetSectionColumn(assets, 5, 6)).toBe(0);
    expect(isAssetSectionRowEnd(assets, 5, 6)).toBe(false);
    expect(isAssetSectionRowEnd(assets, 6, 6)).toBe(true);
  });

  it("moves vertically by visual date-section rows", () => {
    const assets = [
      asset("day-one-a", "2026-10-14T12:00:00.000Z"),
      asset("day-two-a", "2026-10-01T09:00:00.000Z"),
      asset("day-two-b", "2026-10-01T10:00:00.000Z"),
      asset("day-two-c", "2026-10-01T11:00:00.000Z"),
      asset("day-two-d", "2026-10-01T12:00:00.000Z"),
      asset("day-two-e", "2026-10-01T13:00:00.000Z"),
      asset("day-two-f", "2026-10-01T14:00:00.000Z"),
      asset("day-three-a", "2026-09-30T09:00:00.000Z"),
      asset("day-three-b", "2026-09-30T10:00:00.000Z")
    ];

    expect(
      getNextAssetSectionIndex({
        assets,
        columnCount: 6,
        currentIndex: 0,
        direction: "down"
      }).index
    ).toBe(1);

    expect(
      getNextAssetSectionIndex({
        assets,
        columnCount: 6,
        currentIndex: 1,
        direction: "down",
        preferredColumn: 0
      }).index
    ).toBe(7);
  });

  it("keeps focus in place when there is no next visual date-section row", () => {
    const assets = [
      asset("day-one-a", "2026-10-14T12:00:00.000Z"),
      asset("day-two-a", "2026-10-01T09:00:00.000Z"),
      asset("day-two-b", "2026-10-01T10:00:00.000Z"),
      asset("day-two-c", "2026-10-01T11:00:00.000Z"),
      asset("day-two-d", "2026-10-01T12:00:00.000Z"),
      asset("day-two-e", "2026-10-01T13:00:00.000Z"),
      asset("day-two-f", "2026-10-01T14:00:00.000Z")
    ];

    expect(
      getNextAssetSectionIndex({
        assets,
        columnCount: 6,
        currentIndex: 1,
        direction: "down",
        preferredColumn: 0
      }).index
    ).toBe(1);
  });
});
