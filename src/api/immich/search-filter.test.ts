import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultRequestTimeouts } from "./http";
import { emptySearchCriteria, type SearchCriteria } from "../../domain/search";
import { toUserMessage } from "../../errors/app-error";
import { createImmichClient } from "./client";
import { buildSearchCriteriaFilter, localDayStartIso } from "./search-filter";

// Calendar days become this TV's local midnights. Pin a zone with summer time
// so the expected instants are exact.
const originalZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/London";
});

afterAll(() => {
  process.env.TZ = originalZone;
});

const settings = { apiKey: "secret-key", serverUrl: "http://immich.local:2283" };
const mum = { id: "00000000-0000-4000-8000-000000000001", name: "Mum" };
const dad = { id: "00000000-0000-4000-8000-000000000002", name: null };
const base = { trashedAt: { eq: null }, visibility: { eq: "timeline" } };
const criteria = (overrides: Partial<SearchCriteria>): SearchCriteria => ({
  ...emptySearchCriteria(),
  ...overrides
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

describe("search criteria filter", () => {
  it.each([
    ["people only", criteria({ people: [mum, dad] }), { personIds: { all: [mum.id, dad.id] } }],
    [
      "From only",
      criteria({ takenFrom: { day: 1, month: 1, year: 2020 } }),
      { takenAt: { gte: "2020-01-01T00:00:00.000Z" } }
    ],
    [
      "To only, ending at the next local midnight",
      criteria({ takenTo: { day: 31, month: 12, year: 2020 } }),
      { takenAt: { lt: "2021-01-01T00:00:00.000Z" } }
    ],
    [
      "a summer-time range",
      criteria({
        takenFrom: { day: 1, month: 6, year: 2024 },
        takenTo: { day: 29, month: 2, year: 2028 }
      }),
      { takenAt: { gte: "2024-05-31T23:00:00.000Z", lt: "2028-03-01T00:00:00.000Z" } }
    ],
    [
      "people and a range",
      criteria({
        people: [mum],
        takenFrom: { day: 16, month: 10, year: 2026 },
        takenTo: { day: 16, month: 10, year: 2026 }
      }),
      {
        personIds: { all: [mum.id] },
        takenAt: { gte: "2026-10-15T23:00:00.000Z", lt: "2026-10-16T23:00:00.000Z" }
      }
    ]
  ])("maps %s", (_name, input, expected) => {
    expect(buildSearchCriteriaFilter(input)).toEqual({ ...base, ...expected });
  });

  it("keeps years before 100 as written", () => {
    expect(localDayStartIso({ day: 1, month: 1, year: 99 }).startsWith("0099-")).toBe(true);
  });
});

describe("search request", () => {
  it("sends one structured search, newest first, with no deprecated fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        assets: {
          items: [{ id: "a1", originalFileName: "a1.jpg", type: "IMAGE" }],
          nextCursor: "120"
        }
      })
    );
    const client = createImmichClient({ fetchImpl, settings });

    await expect(
      client.searchAssetsPage(criteria({ people: [mum] }), "newest-first", null)
    ).resolves.toMatchObject({
      assets: [{ id: "a1", name: "a1.jpg" }],
      nextPageToken: { cursor: "120", kind: "cursor" },
      total: null
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://immich.local:2283/api/search/metadata");
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      filter: { ...base, personIds: { all: [mum.id] } },
      orderBy: { direction: "desc", field: "fileCreatedAt" },
      size: 120,
      withExif: true
    });
  });

  it("follows the cursor and stops on an empty last page", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ assets: { items: [], nextCursor: null, nextPage: "2" } }));
    const client = createImmichClient({ fetchImpl, settings });

    await expect(
      client.searchAssetsPage(criteria({ people: [mum] }), "newest-first", {
        cursor: "120",
        kind: "cursor"
      })
    ).resolves.toEqual({ assets: [], nextPageToken: null, total: null });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.cursor).toBe("120");
    for (const field of ["page", "order", "personIds", "takenAfter", "takenBefore", "visibility"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("never asks for a result count, which would need the asset.statistics permission", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ assets: { items: [] } }));
    const client = createImmichClient({ fetchImpl, settings });

    await client.searchAssetsPage(
      criteria({ takenFrom: { day: 1, month: 1, year: 2020 } }),
      "newest-first",
      null
    );

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "http://immich.local:2283/api/search/metadata"
    ]);
  });

  it("rejects a malformed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ assets: { items: [{ type: 1 }] } }));
    const client = createImmichClient({ fetchImpl, settings });

    await expect(
      client.searchAssetsPage(criteria({ people: [mum] }), "newest-first", null)
    ).rejects.toMatchObject({
      kind: "invalid-response"
    });
  });

  it("names Search in a permission error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "Missing permission" }, { status: 403 }));
    const client = createImmichClient({ fetchImpl, settings });
    const error = await client
      .searchAssetsPage(criteria({ people: [mum] }), "newest-first", null)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ feature: "Search", kind: "permission" });
    expect(toUserMessage(error)).toContain("not allowed to show Search");
  });

  it("times out a stalled search", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
      const client = createImmichClient({ fetchImpl, settings });
      const result = client
        .searchAssetsPage(criteria({ people: [mum] }), "newest-first", null)
        .catch((reason: unknown) => reason);

      await vi.advanceTimersByTimeAsync(defaultRequestTimeouts.jsonMs);

      await expect(result).resolves.toMatchObject({ kind: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});
