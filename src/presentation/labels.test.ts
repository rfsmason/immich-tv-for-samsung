import { describe, expect, it } from "vitest";
import { emptySearchCriteria } from "../domain/search";
import { formatTimelineBucketLabel, formatTimelineBucketYear } from "./date-labels";
import { formatDurationLabel } from "./duration-labels";
import { formatMemoryContext, formatMemoryTitle } from "./memory-labels";
import { formatPersonName } from "./person-labels";
import {
  formatCalendarDate,
  formatSearchAlbumsSummary,
  formatSearchDate,
  formatSearchPlace,
  formatSearchSummary
} from "./search-labels";

describe("timeline bucket labels", () => {
  it("formats a bucket's start date with its UTC weekday", () => {
    expect(formatTimelineBucketLabel({ timeBucket: "2026-10-01" })).toBe("Thu 1 Oct 2026");
    expect(formatTimelineBucketLabel({ timeBucket: "2025-08-17" })).toBe("Sun 17 Aug 2025");
    expect(formatTimelineBucketLabel({ timeBucket: "2026-09-01T00:00:00.000Z" })).toBe(
      "Tue 1 Sep 2026"
    );
  });

  it("falls back to the raw value when it is not a recognisable date", () => {
    expect(formatTimelineBucketLabel({ timeBucket: "2026-13-01" })).toBe("2026-13-01");
    expect(formatTimelineBucketLabel({ timeBucket: "recent" })).toBe("recent");
  });

  it("reads the bucket's year for rail anchors", () => {
    expect(formatTimelineBucketYear({ timeBucket: "2026-10-01T00:00:00.000Z" })).toBe("2026");
    expect(formatTimelineBucketYear({ timeBucket: "recent" })).toBe("");
  });
});

describe("Memory labels", () => {
  it("titles a Memory by person and year, or by year alone", () => {
    expect(formatMemoryTitle({ personName: "Robin Example", year: 2024 })).toBe(
      "Robin Example, 2024"
    );
    expect(formatMemoryTitle({ personName: null, year: 2020 })).toBe("Memory from 2020");
    expect(formatMemoryTitle({ personName: null, year: Number.NaN })).toBe("Memory");
  });

  it("describes a Memory's kind and calendar date", () => {
    expect(formatMemoryContext({ kind: "birthday", memoryAt: "2026-10-15T00:00:00.000Z" })).toBe(
      "Birthday · 2026-10-15"
    );
    expect(formatMemoryContext({ kind: "on-this-day", memoryAt: "2026-10-14T00:00:00.000Z" })).toBe(
      "On this day · 2026-10-14"
    );
    expect(formatMemoryContext({ kind: "other", memoryAt: "2026-10-14T00:00:00.000Z" })).toBe(
      "Memory · 2026-10-14"
    );
  });
});

describe("duration labels", () => {
  it("formats milliseconds as minutes and zero-padded seconds", () => {
    expect(formatDurationLabel(0)).toBe("0:00");
    expect(formatDurationLabel(3232)).toBe("0:03");
    expect(formatDurationLabel(64000)).toBe("1:04");
    expect(formatDurationLabel(4503000)).toBe("75:03");
    expect(formatDurationLabel(-5)).toBe("0:00");
  });
});

describe("person labels", () => {
  it("shows an assigned name, or a neutral label for an unnamed person", () => {
    expect(formatPersonName({ name: "Robin Example" })).toBe("Robin Example");
    expect(formatPersonName({ name: null })).toBe("Unnamed person");
  });
});

describe("search labels", () => {
  const date = (year: number, month: number, day: number) => ({ day, month, year });
  const person = (name: string | null) => ({ id: name || "unnamed", name });

  it("writes dates in UK order with the shared month names", () => {
    expect(formatCalendarDate(date(2026, 10, 16))).toBe("16 Oct 2026");
    expect(formatCalendarDate(date(2026, 9, 1))).toBe("1 Sep 2026");
    expect(formatSearchDate(null)).toBe("Any date");
  });

  it("summarises people and dates briefly", () => {
    const empty = emptySearchCriteria();

    expect(formatSearchSummary(empty)).toBe("Search");
    expect(formatSearchSummary({ ...empty, people: [person("Robin Example")] })).toBe(
      "Robin Example"
    );
    expect(formatSearchSummary({ ...empty, people: [person("Robin Example"), person(null)] })).toBe(
      "Robin Example & Unnamed person"
    );
    expect(
      formatSearchSummary({
        ...emptySearchCriteria(),
        people: [person("A"), person("B"), person("C")],
        takenFrom: date(2020, 1, 1),
        takenTo: date(2020, 12, 31)
      })
    ).toBe("3 people · 1 Jan 2020 – 31 Dec 2020");
    expect(formatSearchSummary({ ...empty, takenFrom: date(2020, 1, 1) })).toBe("From 1 Jan 2020");
    expect(formatSearchSummary({ ...empty, takenTo: date(2020, 1, 1) })).toBe("Until 1 Jan 2020");
  });

  it("summarises type, place and albums, falling back to counts when long", () => {
    const empty = emptySearchCriteria();
    const exampleton = { city: "Exampleton", country: "Exampleland", state: "Example County" };
    const album = (name: string) => ({ id: name, name });

    expect(formatSearchPlace(exampleton)).toBe("Exampleton, Example County, Exampleland");
    expect(formatSearchPlace({ city: null, country: "Testonia", state: null })).toBe("Testonia");
    expect(formatSearchAlbumsSummary([])).toBeNull();
    expect(formatSearchAlbumsSummary([album("Summer Example")])).toBe("Summer Example");
    expect(formatSearchAlbumsSummary([album("A"), album("B")])).toBe("2 albums");

    expect(
      formatSearchSummary({
        ...empty,
        mediaType: "videos",
        people: [person("Sam Example")],
        place: exampleton
      })
    ).toBe("Sam Example · Videos · Exampleton");
    expect(
      formatSearchSummary({
        ...empty,
        mediaType: "live-photos",
        place: { city: null, country: "Testonia", state: null }
      })
    ).toBe("Live Photos · Testonia");
    expect(
      formatSearchSummary({
        ...empty,
        albums: [album("Summer Example"), album("Winter Example")],
        mediaType: "photos",
        people: [person("Robin Example"), person("Sam Example")],
        takenFrom: date(2020, 1, 1),
        takenTo: date(2020, 12, 31)
      })
    ).toBe("2 people · 2 albums · Photos · 1 Jan 2020 – 31 Dec 2020");
  });
});
