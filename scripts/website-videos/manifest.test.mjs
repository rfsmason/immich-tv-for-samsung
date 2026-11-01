import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, validateManifest } from "./manifest.mjs";

describe("parseYouTubeUrl", () => {
  it("reads the ID from youtu.be and watch links, ignoring extra parameters", () => {
    expect(parseYouTubeUrl("https://youtu.be/uFJbepHNbZ8")).toBe("uFJbepHNbZ8");
    expect(parseYouTubeUrl("https://youtu.be/uFJbepHNbZ8?si=abc&t=12")).toBe("uFJbepHNbZ8");
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=1v8Ug3xoChE")).toBe("1v8Ug3xoChE");
    expect(parseYouTubeUrl("https://www.youtube.com/watch?t=5&v=a-b_c-d_e-f&list=PL1")).toBe(
      "a-b_c-d_e-f"
    );
  });

  it.each([
    "http://youtu.be/uFJbepHNbZ8",
    "https://youtu.be/",
    "https://youtu.be/uFJbepHNbZ8/extra",
    "https://youtu.be/short",
    "https://youtu.be/uFJbepHNbZ8x",
    "https://www.youtube.com/watch?list=PL1234567890",
    "https://www.youtube.com/playlist?list=PL1234567890",
    "https://www.youtube.com/embed/uFJbepHNbZ8",
    "https://www.youtube.com/shorts/uFJbepHNbZ8",
    "https://youtube.com/watch?v=uFJbepHNbZ8",
    "https://m.youtube.com/watch?v=uFJbepHNbZ8",
    "https://www.youtube-nocookie.com/embed/uFJbepHNbZ8",
    "https://www.youtube.com:8443/watch?v=uFJbepHNbZ8",
    "https://www.youtube.com/watch?v=bad%20id%20xyz",
    "uFJbepHNbZ8",
    "not a url"
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe("validateManifest", () => {
  it("accepts links and objects with overrides, in order", () => {
    expect(
      validateManifest([
        "https://youtu.be/uFJbepHNbZ8",
        { url: "https://www.youtube.com/watch?v=1v8Ug3xoChE", title: " Photos " },
        { url: "https://youtu.be/eE3Ncej2mTc", description: "Open an album." }
      ])
    ).toEqual([
      { id: "uFJbepHNbZ8", title: undefined, description: undefined },
      { id: "1v8Ug3xoChE", title: "Photos", description: undefined },
      { id: "eE3Ncej2mTc", title: undefined, description: "Open an album." }
    ]);
  });

  it.each([[{}], [null], ["https://youtu.be/uFJbepHNbZ8"], [[]]])(
    "rejects a manifest that isn't a non-empty array: %j",
    (data) => {
      expect(() => validateManifest(data)).toThrow("must be a non-empty array");
    }
  );

  it("rejects unknown keys, bad overrides, bad links and duplicates, all at once", () => {
    let message = "";

    try {
      validateManifest([
        { url: "https://youtu.be/uFJbepHNbZ8", thumbnail: "x.jpg" },
        { url: "https://youtu.be/1v8Ug3xoChE", title: "" },
        { url: "https://youtu.be/eE3Ncej2mTc", description: 3 },
        "https://www.youtube.com/playlist?list=PL1234567890",
        "https://www.youtube.com/watch?v=uFJbepHNbZ8",
        { title: "No link" },
        42
      ]);
    } catch (error) {
      message = error.message;
    }

    expect(message).toContain('Entry 1: unknown key "thumbnail"');
    expect(message).toContain('Entry 2: "title" must be a non-empty string.');
    expect(message).toContain('Entry 3: "description" must be a non-empty string.');
    expect(message).toContain("Entry 4: ");
    expect(message).toContain("Entry 5: video uFJbepHNbZ8 is already entry 1.");
    expect(message).toContain('Entry 6: "url" must be a YouTube link.');
    expect(message).toContain("Entry 7: must be a YouTube link or");
  });

  it("keeps the repository's own data file valid", async () => {
    const { readFile } = await import("node:fs/promises");
    const data = JSON.parse(
      await readFile(new URL("../../website/demo-videos.json", import.meta.url), "utf8")
    );

    expect(validateManifest(data).length).toBeGreaterThan(0);
  });
});
