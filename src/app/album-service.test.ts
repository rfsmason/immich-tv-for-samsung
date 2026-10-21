import { describe, expect, it, vi } from "vitest";
import { createAlbumService } from "./album-service";

const settings = {
  apiKey: "secret-key",
  serverUrl: "http://immich.local:2283"
};

describe("album service", () => {
  it("loads image previews for the full-screen viewer without fetching originals", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(["preview"], { type: "image/jpeg" })));
    const createObjectURL = vi.fn().mockReturnValue("blob:image-preview");
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      service.loadAssetPreviewUrl({
        capturedAt: null,
        durationMs: null,
        id: "image-id",
        livePhotoVideoId: null,
        location: null,
        name: "image.jpg",
        type: "image"
      })
    ).resolves.toBe("blob:image-preview");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://immich.local:2283/api/assets/image-id/thumbnail?size=preview",
      expect.any(Object)
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not request viewer previews for non-image assets", async () => {
    const fetchImpl = vi.fn();
    const createObjectURL = vi.fn();
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      service.loadAssetPreviewUrl({
        capturedAt: null,
        durationMs: 10000,
        id: "video-id",
        livePhotoVideoId: null,
        location: null,
        name: "clip.mp4",
        type: "video"
      })
    ).resolves.toBeNull();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to preview thumbnails when a video thumbnail is not available", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(new Blob(["preview"], { type: "image/jpeg" })));
    const createObjectURL = vi.fn().mockReturnValue("blob:video-preview");
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      service.loadAssetThumbnailUrl({
        capturedAt: null,
        durationMs: 10000,
        id: "video-id",
        livePhotoVideoId: null,
        location: null,
        name: "clip.mp4",
        type: "video"
      })
    ).resolves.toBe("blob:video-preview");

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://immich.local:2283/api/assets/video-id/thumbnail?size=thumbnail",
      expect.any(Object)
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://immich.local:2283/api/assets/video-id/thumbnail?size=preview",
      expect.any(Object)
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("loads image preview stills for the full-screen viewer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(["preview"], { type: "image/jpeg" })));
    const createObjectURL = vi.fn().mockReturnValue("blob:viewer-image-still");
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      service.loadAssetViewerStillUrl({
        capturedAt: null,
        durationMs: null,
        id: "image-id",
        livePhotoVideoId: null,
        location: null,
        name: "image.jpg",
        type: "image"
      })
    ).resolves.toBe("blob:viewer-image-still");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://immich.local:2283/api/assets/image-id/thumbnail?size=preview",
      expect.any(Object)
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("loads video thumbnail stills for the full-screen viewer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(["thumbnail"], { type: "image/jpeg" })));
    const createObjectURL = vi.fn().mockReturnValue("blob:viewer-video-still");
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      service.loadAssetViewerStillUrl({
        capturedAt: null,
        durationMs: 10000,
        id: "video-id",
        livePhotoVideoId: null,
        location: null,
        name: "clip.mp4",
        type: "video"
      })
    ).resolves.toBe("blob:viewer-video-still");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://immich.local:2283/api/assets/video-id/thumbnail?size=thumbnail",
      expect.any(Object)
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("loads playback URLs for video assets", async () => {
    const fetchImpl = vi.fn();
    const createObjectURL = vi.fn();
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    expect(
      service.loadAssetPlaybackUrl({
        capturedAt: null,
        durationMs: 10000,
        id: "video-id",
        livePhotoVideoId: null,
        location: null,
        name: "clip.mp4",
        type: "video"
      })
    ).toBe("http://immich.local:2283/api/assets/video-id/video/playback?apiKey=secret-key");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("loads live photo playback from the paired video asset", async () => {
    const fetchImpl = vi.fn();
    const createObjectURL = vi.fn();
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    expect(
      service.loadAssetPlaybackUrl({
        capturedAt: null,
        durationMs: null,
        id: "image-id",
        livePhotoVideoId: "live-video-id",
        location: null,
        name: "image.jpg",
        type: "image"
      })
    ).toBe("http://immich.local:2283/api/assets/live-video-id/video/playback?apiKey=secret-key");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("loads Recently Added through the authenticated timeline integration", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("[]", {
        headers: { "Content-Type": "application/json" }
      })
    );
    const service = createAlbumService({
      fetchImpl,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      store: { load: () => settings, save: vi.fn() }
    });

    await expect(service.loadRecentlyAddedAssets(18)).resolves.toEqual({
      assets: [],
      nextPageToken: null,
      total: 0
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/timeline/buckets?order=desc&orderBy=createdAt"),
      expect.objectContaining({
        headers: { Accept: "application/json", "x-api-key": "secret-key" }
      })
    );
  });

  it("does not request playback for ordinary images", async () => {
    const fetchImpl = vi.fn();
    const createObjectURL = vi.fn();
    const service = createAlbumService({
      fetchImpl,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      },
      store: {
        load: () => settings,
        save: vi.fn()
      },
      urlFactory: {
        createObjectURL,
        revokeObjectURL: vi.fn()
      }
    });

    expect(
      service.loadAssetPlaybackUrl({
        capturedAt: null,
        durationMs: null,
        id: "image-id",
        livePhotoVideoId: null,
        location: null,
        name: "image.jpg",
        type: "image"
      })
    ).toBeNull();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
