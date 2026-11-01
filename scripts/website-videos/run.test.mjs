import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "./run.mjs";

const html = `<ul class="video-grid">
  <!-- demo-videos:start (generated) -->
  <!-- demo-videos:end -->
</ul>
`;

let root;

function writeManifest(entries) {
  writeFileSync(join(root, "website", "demo-videos.json"), JSON.stringify(entries));
}

function readIndex() {
  return readFileSync(join(root, "website", "index.html"), "utf8");
}

function youtube(items) {
  return vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 }));
}

const people = {
  id: "0fvvx6qAzoo",
  snippet: {
    title: "People – Immich TV for Samsung",
    description: "Pick a person and see their photos.\n\nMore information."
  },
  status: { privacyStatus: "unlisted", embeddable: true }
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "website-videos-"));
  mkdirSync(join(root, "website"));
  writeFileSync(join(root, "website", "index.html"), html);
  writeManifest(["https://youtu.be/0fvvx6qAzoo"]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("run", () => {
  it("writes the tiles, summarises the change, and then passes --check offline", async () => {
    const fetchImpl = youtube([people]);
    const lines = await run({ root, env: { YOUTUBE_API_KEY: "key" }, fetchImpl });

    expect(lines).toEqual([
      "Demo videos: wrote 1 tile to website/index.html.",
      '  Tile 1 added: 0fvvx6qAzoo, "People".'
    ]);
    expect(readIndex()).toContain('<span class="video-title">People</span>');
    expect(readIndex()).toContain(
      '<span class="video-desc">Pick a person and see their photos.</span>'
    );

    const offline = vi.fn();
    await expect(run({ root, check: true, env: {}, fetchImpl: offline })).resolves.toEqual([
      "Demo videos: website/index.html matches website/demo-videos.json (1 tile)."
    ]);
    expect(offline).not.toHaveBeenCalled();

    await expect(run({ root, env: { YOUTUBE_API_KEY: "key" }, fetchImpl })).resolves.toEqual([
      "Demo videos: website/index.html is already up to date."
    ]);
  });

  it("reads the key from .env.website when the environment has none", async () => {
    writeFileSync(join(root, ".env.website"), "YOUTUBE_API_KEY=from-file\n");
    const fetchImpl = youtube([people]);

    await run({ root, env: {}, fetchImpl });

    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("key")).toBe("from-file");
  });

  it("explains how to get a key when there is none", async () => {
    await expect(run({ root, env: {}, fetchImpl: vi.fn() })).rejects.toThrow(
      /No YouTube Data API key[\s\S]*restrict it\s+to YouTube Data API v3/
    );
  });

  it("leaves index.html unchanged when a video can't be used", async () => {
    const fetchImpl = youtube([
      { ...people, status: { privacyStatus: "private", embeddable: true } }
    ]);

    await expect(run({ root, env: { YOUTUBE_API_KEY: "key" }, fetchImpl })).rejects.toThrow(
      "the video is private"
    );
    expect(readIndex()).toBe(html);
  });

  it("fails the check when the tiles and the data file disagree", async () => {
    await expect(run({ root, check: true, env: {} })).rejects.toThrow(
      "Entry 1 (0fvvx6qAzoo) has no tile in index.html."
    );
  });

  it("refuses an invalid data file and an environment file inside website/", async () => {
    writeManifest(["https://www.youtube.com/playlist?list=PL1234567890"]);
    await expect(run({ root, check: true, env: {} })).rejects.toThrow("Entry 1:");

    writeFileSync(join(root, "website", "demo-videos.json"), "[");
    await expect(run({ root, check: true, env: {} })).rejects.toThrow(
      "Could not read website/demo-videos.json"
    );

    writeFileSync(join(root, "website", ".env.website"), "YOUTUBE_API_KEY=oops\n");
    await expect(run({ root, check: true, env: {} })).rejects.toThrow(
      "Move .env.website out of website/"
    );
  });
});
