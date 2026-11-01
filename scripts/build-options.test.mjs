import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { appBundleOptions, readDistribution, tipLinkPattern } from "./build-options.mjs";

const root = process.cwd();

async function bundle(distribution) {
  const result = await esbuild.build({
    ...appBundleOptions(root, { distribution }),
    write: false
  });

  return result.outputFiles[0].text;
}

describe("build distribution", () => {
  it("is sideload unless a store build is asked for", () => {
    expect(readDistribution([], {})).toBe("sideload");
    expect(readDistribution([], { IMMICH_TV_DISTRIBUTION: "" })).toBe("sideload");
    expect(readDistribution([], { IMMICH_TV_DISTRIBUTION: "sideload" })).toBe("sideload");
    expect(readDistribution(["--store"], {})).toBe("store");
    expect(readDistribution([], { IMMICH_TV_DISTRIBUTION: "store" })).toBe("store");
  });

  it("rejects an unknown distribution rather than guessing", () => {
    expect(() => readDistribution([], { IMMICH_TV_DISTRIBUTION: "Store" })).toThrow(
      /sideload or store/
    );
  });

  it("passes the distribution to the bundle as a define", () => {
    expect(appBundleOptions(root, { distribution: "store" }).define).toEqual({
      __IMMICH_TV_DISTRIBUTION__: '"store"'
    });
    expect(appBundleOptions(root).define).toEqual({
      __IMMICH_TV_DISTRIBUTION__: '"sideload"'
    });
  });

  it("drops the tip page's link and QR code from a store bundle", async () => {
    const [sideload, store] = await Promise.all([bundle("sideload"), bundle("store")]);

    expect(sideload).toContain('"https://ko-fi.com/immichtv"');
    expect(sideload).toContain("Support Us");
    expect(store).not.toMatch(tipLinkPattern);
    expect(store).not.toContain("M4 4h7v1h-7z");
  });

  it("keeps the tip page out of the static runtime files", async () => {
    const files = ["config.xml", "index.html", "styles/main.css"];
    const contents = await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")));

    contents.forEach((content) => expect(content).not.toMatch(tipLinkPattern));
  });
});
