import { describe, expect, it, vi } from "vitest";
import { toUserMessage } from "../../errors/app-error";
import { createImmichClient } from "./client";
import { localMemoryDate } from "../../domain/home";
const settings = { serverUrl: "https://immich.example", apiKey: "test-key" };
const dto = {
  id: "memory",
  type: "birthday",
  memoryAt: "2026-10-15T00:00:00.000Z",
  data: { year: 2000, personName: "Alex" },
  assets: [
    { id: "first", type: "IMAGE" },
    { id: "second", type: "VIDEO" },
    { id: "live", type: "IMAGE", livePhotoVideoId: "motion" }
  ]
};
function fixture(body: unknown) {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
  return { fetchImpl, client: createImmichClient({ settings, fetchImpl }) };
}
describe("Memories API boundary", () => {
  it("maps kind, date, person, year, cover and count without retaining embedded asset payloads", async () => {
    const { client, fetchImpl } = fixture([dto]);
    const memories = await client.getMemories(12, 3, "2026-10-15");
    expect(memories[0]).toMatchObject({
      id: "memory",
      kind: "birthday",
      personName: "Alex",
      year: 2000,
      assetCount: 3,
      assets: [{ id: "first", type: "image" }]
    });
    expect(memories[0]?.memoryAt.slice(0, 10)).toBe("2026-10-15");
    expect(memories[0]?.assets).toHaveLength(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://immich.example/api/memories?size=12&page=3&for=2026-10-15&isTrashed=false&order=desc"
    );
  });
  it("reloads an ID with discovery privacy filtering and preserves image/video/Live Photo order", async () => {
    const { client, fetchImpl } = fixture([dto]);
    const memory = await client.getMemory("memory");
    expect(memory.assets.map((asset) => [asset.id, asset.type, asset.livePhotoVideoId])).toEqual([
      ["first", "image", null],
      ["second", "video", null],
      ["live", "image", "motion"]
    ]);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://immich.example/api/memories?id=memory&size=1&isTrashed=false&order=desc"
    );
  });
  it.each([[], [{ ...dto, id: "other" }]].map((body) => ({ body })))(
    "reports an unavailable or mismatched Memory: $body",
    async ({ body }) => {
      await expect(fixture(body).client.getMemory("memory")).rejects.toMatchObject({ kind: "api" });
    }
  );
  it("maps an empty set and an on-this-day Memory without a person or a guessed cover", async () => {
    const { client } = fixture([{ ...dto, assets: [], type: "on_this_day", data: { year: 2020 } }]);
    await expect(client.getMemory("memory")).resolves.toMatchObject({
      kind: "on-this-day",
      personName: null,
      year: 2020,
      assets: [],
      assetCount: 0
    });
  });
  it.each(
    [
      null,
      {},
      [null],
      [{ ...dto, assets: {} }],
      [{ ...dto, assets: [null] }],
      [{ ...dto, memoryAt: "invalid" }],
      [{ ...dto, data: { year: 2.5 } }],
      [{ ...dto, data: { year: 2020, personName: 12 } }]
    ].map((body) => ({ body }))
  )("rejects malformed response $body", async ({ body }) => {
    await expect(fixture(body).client.getMemories(12)).rejects.toMatchObject({
      kind: "invalid-response"
    });
  });
  it("caps list size even if the server sends extra cards", async () => {
    const { client, fetchImpl } = fixture(
      Array.from({ length: 50 }, (_, i) => ({ ...dto, id: String(i) }))
    );
    await expect(client.getMemories(50)).resolves.toHaveLength(18);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("size=18&page=1");
  });
  it.each([
    [0, 1, "2026-10-15"],
    [12, 0, "2026-10-15"],
    [12, 1, "bad"]
  ] as const)(
    "rejects invalid paging input %s / %s / %s before requesting",
    async (size, page, date) => {
      const { client, fetchImpl } = fixture([]);
      await expect(client.getMemories(size, page, date)).rejects.toMatchObject({
        kind: "invalid-config"
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );
  it("requests current Memory statistics to bound lazy loading across filtered pages", async () => {
    const { client, fetchImpl } = fixture({ total: 31 });
    await expect(client.getMemoriesTotal("2026-10-15")).resolves.toBe(31);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://immich.example/api/memories/statistics?for=2026-10-15&isTrashed=false"
    );
  });
  it.each([{}, null, { total: -1 }, { total: 1.5 }, { total: "31" }])(
    "rejects malformed Memory statistics %j",
    async (body) => {
      await expect(fixture(body).client.getMemoriesTotal("2026-10-15")).rejects.toMatchObject({
        kind: "invalid-response"
      });
    }
  );
  it("explains a missing statistics permission without discarding the connection", async () => {
    const client = createImmichClient({
      settings,
      fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 403 }))
    });
    const error = await client.getMemoriesTotal("2026-10-15").catch((reason: unknown) => reason);
    expect(error).toMatchObject({ kind: "permission", feature: "Memories", status: 403 });
    expect(toUserMessage(error)).toContain("not allowed to show Memories");
  });
  it("uses the local calendar date including zero-padded months and days", () => {
    expect(localMemoryDate(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });
});
