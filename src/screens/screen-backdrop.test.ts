import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../domain/album";
import { TestDocument } from "../test/document";
import { chooseBackdropAsset, chooseRandomItem, createScreenBackdrop } from "./screen-backdrop";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const image = new TestDocument().createElement("img") as unknown as HTMLImageElement;
  const revokeUrl = vi.fn();

  return { backdrop: createScreenBackdrop({ image, revokeUrl }), image, revokeUrl };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("screen backdrop", () => {
  it("shows a loaded picture and releases the previous one", async () => {
    const { backdrop, image, revokeUrl } = setup();

    backdrop.show(async () => "blob:first");
    await flush();
    expect(image.src).toBe("blob:first");
    expect(image.className).toBe("screen-backdrop is-loaded");

    backdrop.show(async () => "blob:second");
    await flush();
    expect(image.src).toBe("blob:second");
    expect(revokeUrl).toHaveBeenCalledWith("blob:first");

    backdrop.clear();
    expect(image.className).toBe("screen-backdrop");
    expect(revokeUrl).toHaveBeenCalledWith("blob:second");
  });

  it("releases a picture that arrives after the screen moved on", async () => {
    const { backdrop, image, revokeUrl } = setup();
    let resolve!: (url: string) => void;

    backdrop.show(() => new Promise<string>((done) => (resolve = done)));
    backdrop.clear();
    resolve("blob:late");
    await flush();

    expect(image.className).toBe("screen-backdrop");
    expect(revokeUrl).toHaveBeenCalledWith("blob:late");
  });

  it("stays empty when nothing loads", async () => {
    const { backdrop, image } = setup();

    backdrop.show(async () => null);
    backdrop.show(async () => {
      throw new Error("offline");
    });
    await flush();

    expect(image.className).not.toContain("is-loaded");
  });

  it("chooses photos before videos, and nothing from nothing", () => {
    const asset = (id: string, type: AlbumAsset["type"]): AlbumAsset => ({
      capturedAt: null,
      durationMs: null,
      id,
      livePhotoVideoId: null,
      location: null,
      name: id,
      type
    });

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(chooseBackdropAsset([asset("clip", "video"), asset("photo", "image")])?.id).toBe(
      "photo"
    );
    expect(chooseBackdropAsset([asset("clip", "video")])?.id).toBe("clip");
    expect(chooseBackdropAsset([])).toBeNull();
    expect(chooseRandomItem([1, 2, 3])).toBe(3);
  });
});
