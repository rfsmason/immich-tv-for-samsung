import { describe, expect, it, vi } from "vitest";
import { descriptionFromYouTube, fetchVideos, titleFromYouTube } from "./youtube.mjs";

const apiKey = "test-key-123";

function item(id, overrides = {}) {
  return {
    id,
    snippet: { title: `${id} – Immich TV for Samsung`, description: "One line." },
    status: { privacyStatus: "public", embeddable: true },
    ...overrides
  };
}

function fakeFetch(status, body) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("fetchVideos", () => {
  it("asks for every ID in one videos.list request and maps the results by ID", async () => {
    const fetchImpl = fakeFetch(200, { items: [item("1v8Ug3xoChE"), item("uFJbepHNbZ8")] });
    const videos = await fetchVideos(["uFJbepHNbZ8", "1v8Ug3xoChE"], apiKey, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("snippet,status");
    expect(url.searchParams.get("id")).toBe("uFJbepHNbZ8,1v8Ug3xoChE");
    expect(url.searchParams.get("key")).toBe(apiKey);
    expect(videos.get("uFJbepHNbZ8")).toEqual({
      title: "uFJbepHNbZ8 – Immich TV for Samsung",
      description: "One line.",
      privacyStatus: "public",
      embeddable: true
    });
    expect([...videos.keys()]).toEqual(["1v8Ug3xoChE", "uFJbepHNbZ8"]);
  });

  it("reports an API error without the key", async () => {
    const fetchImpl = fakeFetch(400, {
      error: { code: 400, message: `API key not valid: ${apiKey}` }
    });

    await expect(fetchVideos(["uFJbepHNbZ8"], apiKey, fetchImpl)).rejects.toThrow(
      "refused the request (HTTP 400): API key not valid: [redacted]"
    );
  });

  it("reports a network failure without the request URL or key", async () => {
    const fetchImpl = vi.fn(async (url) => {
      throw new Error(`fetch failed for ${url}`, { cause: { code: "ENOTFOUND" } });
    });
    const error = await fetchVideos(["uFJbepHNbZ8"], apiKey, fetchImpl).catch((reason) => reason);

    expect(error.message).toBe(
      "Could not reach the YouTube Data API (ENOTFOUND). Check the network connection."
    );
  });

  it("rejects a response that isn't a list of videos", async () => {
    const broken = item("uFJbepHNbZ8", { status: { privacyStatus: "public" } });

    await expect(
      fetchVideos(["uFJbepHNbZ8"], apiKey, fakeFetch(200, { items: [broken] }))
    ).rejects.toThrow("unexpected response");
    await expect(fetchVideos(["uFJbepHNbZ8"], apiKey, fakeFetch(200, {}))).rejects.toThrow(
      "unexpected response"
    );
  });
});

describe("titleFromYouTube", () => {
  it.each([
    ["People – Immich TV for Samsung", "People"],
    ["Video & Live Photos - Immich TV for Samsung", "Video & Live Photos"],
    ["Albums – Immich TV - for Samsung", "Albums"],
    ["Picture-in-picture – Immich TV for Samsung", "Picture-in-picture"],
    ["  Settings  ", "Settings"],
    [" – Immich TV for Samsung", "– Immich TV for Samsung"],
    ["Memories–Immich", "Memories–Immich"]
  ])("%j → %j", (title, expected) => {
    expect(titleFromYouTube(title)).toBe(expected);
  });
});

describe("descriptionFromYouTube", () => {
  it("keeps the first paragraph with its whitespace collapsed", () => {
    expect(
      descriptionFromYouTube("Scroll your library\n  by date.\n\nMore: https://example.com")
    ).toBe("Scroll your library by date.");
    expect(descriptionFromYouTube("One.\r\n \r\nTwo.")).toBe("One.");
    expect(descriptionFromYouTube("Only paragraph. ")).toBe("Only paragraph.");
    expect(descriptionFromYouTube("")).toBe("");
  });
});
