import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runDemoMemories } from "../create-demo-memories.mjs";

const env = {
  CAPTURE_DEMO_LIBRARY: "yes",
  CAPTURE_IMMICH_URL: "https://demo.example.com",
  CAPTURE_IMMICH_API_KEY: "secret-test-key"
};
function fixture() {
  const requests = [];
  const output = [];
  const fetch = vi.fn(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () =>
        url.endsWith("/search/metadata")
          ? {
              assets: {
                items: Array.from({ length: 12 }, (_, i) => ({ id: `asset-${i}`, type: "IMAGE" }))
              }
            }
          : { id: `memory-${requests.length}` }
    };
  });
  return { requests, output, fetch, log: (line) => output.push(line) };
}

describe("demo Memories safeguards", () => {
  it.each([undefined, "no", "true"])(
    "requires explicit demo confirmation (%s) before any request",
    async (flag) => {
      const f = fixture();
      await expect(
        runDemoMemories(["--yes"], { ...env, CAPTURE_DEMO_LIBRARY: flag }, f.fetch, f.log)
      ).rejects.toThrow("CAPTURE_DEMO_LIBRARY=yes");
      expect(f.fetch).not.toHaveBeenCalled();
    }
  );
  it("prints the target but refuses unconfirmed writes before requests", async () => {
    const f = fixture();
    await expect(runDemoMemories([], env, f.fetch, f.log)).rejects.toThrow("--yes");
    expect(f.output.join("\n")).toContain(env.CAPTURE_IMMICH_URL);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["--api-key", "--api-key=do-not-echo-this", "--server"])(
    "rejects removed CLI options without echoing supplied values (%s)",
    async (option) => {
      const f = fixture();
      await expect(
        runDemoMemories([option, "do-not-echo-this"], env, f.fetch, f.log)
      ).rejects.toThrow("Invalid arguments");
      expect(f.fetch).not.toHaveBeenCalled();
      expect(f.output.join("\n")).not.toContain("do-not-echo-this");
    }
  );
  it("dry-run reads candidates and lists all planned payloads without creating anything, even with --yes", async () => {
    const f = fixture();
    await runDemoMemories(["--dry-run", "--yes", "--count", "2"], env, f.fetch, f.log);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].url).toMatch(/\/search\/metadata$/);
    expect(f.requests[0].body).toEqual({
      filter: {
        trashedAt: { eq: null },
        type: { in: ["IMAGE", "VIDEO"] },
        visibility: { eq: "timeline" }
      },
      orderBy: { direction: "desc", field: "fileCreatedAt" },
      size: expect.any(Number),
      withExif: true
    });
    for (const field of ["order", "page", "visibility", "type", "isTrashed"]) {
      expect(f.requests[0].body).not.toHaveProperty(field);
    }
    const plan = JSON.parse(
      f.output
        .find((line) => line.startsWith("Artificial Memory plan"))
        .split("\n")
        .slice(1)
        .join("\n")
    );
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      showAt: "2026-10-19T00:00:00.000Z",
      hideAt: "2026-10-20T00:00:00.000Z",
      memoryAt: "2025-10-19T12:00:00.000Z",
      data: { year: 2025 }
    });
    expect(f.output.join("\n")).not.toContain(env.CAPTURE_IMMICH_API_KEY);
    const captureSource = readFileSync(new URL("./run-capture.ts", import.meta.url), "utf8");
    expect(captureSource).toContain('default: "2026-10-19T12:00:00Z"');
  });
  it("writes the dry-run payloads only with --yes, using the selected date rather than today's date", async () => {
    const args = ["--count", "2", "--date", "2027-11-03", "--seed", "website"];
    const preview = fixture();
    await runDemoMemories([...args, "--dry-run"], env, preview.fetch, preview.log);
    const f = fixture();
    await runDemoMemories([...args, "--yes"], env, f.fetch, f.log);
    expect(f.requests).toHaveLength(3);
    expect(f.requests[1].body).toMatchObject({
      showAt: "2027-11-03T00:00:00.000Z",
      hideAt: "2027-11-04T00:00:00.000Z",
      memoryAt: "2026-11-03T12:00:00.000Z"
    });
    expect(f.output.find((line) => line.startsWith("Artificial Memory plan"))).toBe(
      preview.output.find((line) => line.startsWith("Artificial Memory plan"))
    );
  });
  it.each(["2026-02-30", "2026-11-01T12:00:00Z"])(
    "rejects invalid day %s before requests",
    async (date) => {
      const f = fixture();
      await expect(runDemoMemories(["--yes", "--date", date], env, f.fetch, f.log)).rejects.toThrow(
        "YYYY-MM-DD"
      );
      expect(f.fetch).not.toHaveBeenCalled();
    }
  );
  it("clamps a leap-day anniversary into February", async () => {
    const f = fixture();
    await runDemoMemories(["--yes", "--count", "1", "--date", "2028-02-29"], env, f.fetch, f.log);
    expect(f.requests[1].body.memoryAt).toBe("2027-02-28T12:00:00.000Z");
  });
  it.each(["https://user:password@example.com", "https://example.com?key=private"])(
    "rejects credentials in server URLs before logging or requesting (%s)",
    async (server) => {
      const f = fixture();
      await expect(
        runDemoMemories(["--yes"], { ...env, CAPTURE_IMMICH_URL: server }, f.fetch, f.log)
      ).rejects.toThrow("without credentials");
      expect(f.output).toEqual([]);
      expect(f.fetch).not.toHaveBeenCalled();
    }
  );
});
