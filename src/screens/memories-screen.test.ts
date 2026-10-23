import { describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { Memory } from "../domain/home";
import { AppError } from "../errors/app-error";
import { TestDocument } from "../test/document";
import { mountMemoriesScreen } from "./memories-screen";

const asset = {
  id: "cover",
  name: "Cover",
  type: "image" as const,
  capturedAt: null,
  durationMs: null,
  livePhotoVideoId: null,
  location: null
};
const memory = (id: string): Memory => ({
  id,
  kind: "on-this-day",
  memoryAt: "2020-10-15T00:00:00.000Z",
  personName: id,
  year: 2020,
  assetCount: 1,
  assets: [{ ...asset, id }]
});
function fixture() {
  const doc = new TestDocument();
  const root = doc.getElementById("memories-screen");
  const get = (name: string) => doc.getElementById(`memories-${name}`);
  for (const name of ["grid", "status", "retry"]) root.appendChild(get(name));
  const service = {
    loadMemoriesTotal: vi.fn().mockResolvedValue(8),
    loadMemories: vi.fn().mockResolvedValue(Array.from({ length: 8 }, (_, i) => memory(String(i)))),
    loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
    revokeThumbnailUrl: vi.fn()
  };
  const onBack = vi.fn();
  const onOpenMemory = vi.fn();
  const controller = mountMemoriesScreen({
    documentRef: doc as unknown as Document,
    service: service as unknown as AlbumService,
    onBack,
    onOpenMemory
  });
  function press(keyCode: number) {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "keyCode", { value: keyCode });
    doc.dispatchEvent(event);
  }
  const loaded = () =>
    vi.waitFor(() => expect(get("status").getAttribute("data-state")).toBe("idle"));
  const cards = () =>
    get("grid").children.filter((child) => child.getAttribute("data-memory-index") !== null);
  function manyPages(total = 150) {
    service.loadMemoriesTotal.mockResolvedValue(total);
    service.loadMemories.mockImplementation(async (size: number, page: number) =>
      Array.from({ length: Math.min(size, Math.max(0, total - (page - 1) * size)) }, (_, i) =>
        memory(String((page - 1) * size + i))
      )
    );
  }
  return {
    doc,
    root,
    get,
    service,
    onBack,
    onOpenMemory,
    controller,
    press,
    loaded,
    cards,
    manyPages
  };
}

describe("Memories scrolling summary", () => {
  it("only focuses its status line once it has text", () => {
    // An empty status line is hidden by the stylesheet and cannot take focus.
    const f = fixture();
    const textWhenFocused: string[] = [];
    const status = f.get("status");
    const focus = status.focus.bind(status);
    status.focus = () => {
      textWhenFocused.push(status.textContent);
      focus();
    };

    f.controller.show();

    expect(textWhenFocused).toEqual(["Loading Memories..."]);
    f.controller.destroy();
  });

  it("uses Albums-style cards, consumes activation and restores the originating card", async () => {
    const f = fixture();
    f.controller.show();
    expect(f.get("status").textContent).toBe("Loading Memories...");
    expect(f.doc.activeElement).toBe(f.get("status"));
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenCalledWith(18, 1, expect.any(String));
    expect(f.cards()[0]?.className).toBe("focusable album-tile");
    f.press(39);
    f.press(40);
    expect(f.doc.activeElement?.getAttribute("data-memory-index")).toBe("7");
    f.press(38);
    expect(f.doc.activeElement?.getAttribute("data-memory-index")).toBe("1");
    const later = vi.fn();
    f.doc.addEventListener("keydown", later);
    f.press(13);
    expect(f.onOpenMemory).toHaveBeenCalledWith(memory("1"));
    expect(later).not.toHaveBeenCalled();
    f.controller.hide();
    f.controller.show();
    expect(f.doc.activeElement?.getAttribute("data-memory-index")).toBe("1");
    f.press(10009);
    expect(f.onBack).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it("fills the initial screen, then appends lazily as remote focus approaches the bottom", async () => {
    const f = fixture();
    f.manyPages();
    f.controller.show();
    await f.loaded();
    expect(f.cards()).toHaveLength(18);
    expect(f.service.loadMemories).toHaveBeenCalledTimes(1);
    f.press(40);
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenLastCalledWith(18, 2, expect.any(String));
    expect(f.cards()).toHaveLength(36);
    expect(f.doc.activeElement?.getAttribute("data-memory-index")).toBe("6");
    expect(f.get("retry").hidden).toBe(true);
    f.controller.destroy();
  });

  it("fills short pages without treating server-filtered empty pages as exhaustion", async () => {
    const f = fixture();
    f.service.loadMemoriesTotal.mockResolvedValue(45);
    f.service.loadMemories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([memory("one")])
      .mockResolvedValueOnce([memory("two")]);
    f.controller.show();
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenCalledTimes(3);
    expect(f.cards()).toHaveLength(2);
    f.press(40);
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenCalledTimes(3);
    f.controller.destroy();
  });

  it("bounds scans across empty pages and continues on another Down press", async () => {
    const f = fixture();
    f.service.loadMemoriesTotal.mockResolvedValue(150);
    f.service.loadMemories.mockResolvedValue([]);
    f.controller.show();
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenCalledTimes(4);
    expect(f.get("status").textContent).toContain("Press Down");
    f.press(40);
    await f.loaded();
    expect(f.service.loadMemories).toHaveBeenCalledTimes(8);
    f.press(10009);
    expect(f.onBack).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it("keeps an empty summary navigable with remote Back and no navigation buttons", async () => {
    const f = fixture();
    f.service.loadMemoriesTotal.mockResolvedValue(0);
    f.controller.show();
    await f.loaded();
    expect(f.get("status").textContent).toBe("No Memories today.");
    expect(f.get("retry").hidden).toBe(true);
    expect(f.service.loadMemories).not.toHaveBeenCalled();
    f.press(10009);
    expect(f.onBack).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it("retains at most five metadata pages, bounded DOM/covers and reloads earlier pages on Up", async () => {
    const f = fixture();
    f.manyPages(1500);
    f.service.loadAssetThumbnailUrl.mockImplementation(async (asset) => `blob:${asset.id}`);
    f.controller.show();
    await f.loaded();
    for (let row = 0; row < 20; row += 1) {
      f.press(40);
      await f.loaded();
    }
    expect(f.service.loadMemories.mock.calls.some(([, page]) => page > 3)).toBe(true);
    expect(f.cards().length).toBeLessThanOrEqual(6 * 9);
    expect(f.service.revokeThumbnailUrl).toHaveBeenCalled();
    const calls = f.service.loadMemories.mock.calls.length;
    for (let row = 0; row < 8; row += 1) {
      f.press(38);
      await f.loaded();
    }
    expect(f.service.loadMemories.mock.calls.length).toBeGreaterThan(calls);
    const requestedPages = f.service.loadMemories.mock.calls.map(([, page]) => page);
    expect(requestedPages[requestedPages.length - 1]).toBeLessThan(Math.max(...requestedPages));
    f.controller.destroy();
  });

  it("pins the exact page window while scrolling down past eviction and back up", async () => {
    const f = fixture();
    f.manyPages(300);
    f.controller.show();
    await f.loaded();
    const focusedName = () => f.doc.activeElement?.querySelector(".album-name")?.textContent;
    const trace: string[] = [];
    const step = async (keyCode: number) => {
      f.press(keyCode);
      await f.loaded();
      trace.push(`${focusedName()}@${f.cards().length}`);
    };

    for (let row = 0; row < 12; row += 1) await step(40);
    for (let row = 0; row < 12; row += 1) await step(38);

    expect(f.service.loadMemories.mock.calls.map(([, page]) => page)).toMatchInlineSnapshot(`
      [
        1,
        2,
        3,
        4,
        5,
        6,
        1,
      ]
    `);
    expect(trace).toMatchInlineSnapshot(`
      [
        "6, 2020@36",
        "12, 2020@42",
        "18, 2020@48",
        "24, 2020@54",
        "30, 2020@54",
        "36, 2020@54",
        "42, 2020@54",
        "48, 2020@54",
        "54, 2020@54",
        "60, 2020@54",
        "66, 2020@54",
        "72, 2020@54",
        "66, 2020@54",
        "60, 2020@54",
        "54, 2020@54",
        "48, 2020@54",
        "42, 2020@54",
        "36, 2020@54",
        "30, 2020@54",
        "24, 2020@54",
        "18, 2020@48",
        "12, 2020@42",
        "6, 2020@36",
        "0, 2020@30",
      ]
    `);
    f.controller.destroy();
  });

  it("offers remote Retry only on failure and recovers without dropping existing cards", async () => {
    const f = fixture();
    f.manyPages();
    f.controller.show();
    await f.loaded();
    f.service.loadMemories.mockRejectedValueOnce(new AppError("network", "Offline"));
    f.press(40);
    await vi.waitFor(() => expect(f.get("status").getAttribute("data-state")).toBe("error"));
    expect(f.doc.activeElement).toBe(f.get("retry"));
    expect(f.cards()).toHaveLength(18);
    f.press(13);
    await f.loaded();
    expect(f.cards()).toHaveLength(36);
    expect(f.get("retry").hidden).toBe(true);
    f.controller.destroy();
  });

  it.each(["resolve", "reject"])(
    "ignores a stale %s after hiding and reopening",
    async (outcome) => {
      const f = fixture();
      let resolve!: (items: Memory[]) => void;
      let reject!: (error: Error) => void;
      f.service.loadMemories.mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      f.controller.show();
      await vi.waitFor(() => expect(f.service.loadMemories).toHaveBeenCalledTimes(1));
      f.controller.hide();
      f.controller.show();
      await f.loaded();
      if (outcome === "resolve") resolve([memory("old")]);
      else reject(new Error("old"));
      await Promise.resolve();
      expect(f.cards()).toHaveLength(8);
      f.controller.destroy();
    }
  );

  it.each(["resolve", "reject"])(
    "preserves shell focus when a request completes with %s",
    async (outcome) => {
      const f = fixture();
      let resolve!: (items: Memory[]) => void;
      let reject!: (error: Error) => void;
      f.service.loadMemories.mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      f.controller.show();
      await vi.waitFor(() => expect(f.service.loadMemories).toHaveBeenCalledTimes(1));
      const shell = f.doc.getElementById("shell-home");
      shell.focus();
      if (outcome === "resolve") resolve([memory("one")]);
      else reject(new AppError("network", "Offline"));
      await Promise.resolve();
      await Promise.resolve();
      expect(f.doc.activeElement).toBe(shell);
      f.controller.destroy();
    }
  );

  it.each(["hide", "destroy", "reset"] as const)("revokes covers on %s", async (action) => {
    const f = fixture();
    f.service.loadAssetThumbnailUrl.mockImplementation(async (asset) => `blob:${asset.id}`);
    f.controller.show();
    await f.loaded();
    // Eight covers, plus one for the backdrop.
    await vi.waitFor(() => expect(f.service.loadAssetThumbnailUrl).toHaveBeenCalledTimes(9));
    await vi.waitFor(() => expect(f.get("backdrop").className).toBe("screen-backdrop is-loaded"));
    f.controller[action]();
    expect(f.service.revokeThumbnailUrl).toHaveBeenCalledTimes(9);
    f.controller.destroy();
  });

  it("revokes stale cover responses and clears summaries on account reset", async () => {
    const f = fixture();
    let resolve!: (url: string) => void;
    f.service.loadAssetThumbnailUrl.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    f.controller.show();
    await f.loaded();
    f.controller.reset();
    f.service.loadMemoriesTotal.mockResolvedValue(1);
    f.service.loadMemories.mockResolvedValue([memory("new")]);
    f.controller.show();
    await f.loaded();
    resolve("blob:old");
    await vi.waitFor(() => expect(f.service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:old"));
    expect(f.cards()).toHaveLength(1);
    f.press(13);
    expect(f.onOpenMemory).toHaveBeenCalledWith(memory("new"));
    f.controller.destroy();
  });

  it("associates shared covers with both cards and leaves empty cards alone", async () => {
    const f = fixture();
    f.service.loadMemoriesTotal.mockResolvedValue(3);
    f.service.loadMemories.mockResolvedValue([
      { ...memory("empty"), assets: [] },
      { ...memory("a"), assets: [asset] },
      { ...memory("b"), assets: [asset] }
    ]);
    f.service.loadAssetThumbnailUrl.mockResolvedValue("blob:shared");
    f.controller.show();
    await f.loaded();
    await vi.waitFor(() => expect(f.cards()[2]?.querySelector("img")?.src).toBe("blob:shared"));
    expect(f.cards()[0]?.querySelector("img")).toBeNull();
    expect(f.cards()[2]?.children[f.cards()[2]!.children.length - 1]?.className).toBe("album-meta");
    // The shared cover loads once for both cards; the backdrop loads its own.
    expect(f.service.loadAssetThumbnailUrl).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(f.get("backdrop").className).toBe("screen-backdrop is-loaded"));
    f.controller.destroy();
    expect(f.service.revokeThumbnailUrl).toHaveBeenCalledTimes(2);
  });
});
