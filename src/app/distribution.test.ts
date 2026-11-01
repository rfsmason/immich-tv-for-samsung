import { afterEach, describe, expect, it, vi } from "vitest";
import { tipPage } from "../screens/settings/support-qr";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("distribution", () => {
  it("is a sideload build, with Support Us, when the build sets nothing", async () => {
    const distribution = await import("./distribution");

    expect(distribution.distribution).toBe("sideload");
    expect(distribution.supportLinksEnabled).toBe(true);
    expect(distribution.supportPage).toBe(tipPage);
  });

  it("is a store build, with no tip page, when the build asks for one", async () => {
    vi.stubGlobal("__IMMICH_TV_DISTRIBUTION__", "store");
    const distribution = await import("./distribution");

    expect(distribution.distribution).toBe("store");
    expect(distribution.supportLinksEnabled).toBe(false);
    expect(distribution.supportPage).toBeNull();
  });

  it("reads anything but store as sideload", async () => {
    const { readDistribution } = await import("./distribution");

    expect(["sideload", undefined, "", "Store", null].map(readDistribution)).toEqual([
      "sideload",
      "sideload",
      "sideload",
      "sideload",
      "sideload"
    ]);
    expect(readDistribution("store")).toBe("store");
  });

  it("links to the tip page exactly, with no tracking parameters", () => {
    expect(tipPage.url).toBe("https://ko-fi.com/immichtv");
    expect(tipPage.label).toBe("ko-fi.com/immichtv");
    expect(tipPage.qr.size).toBe(33);
  });
});
