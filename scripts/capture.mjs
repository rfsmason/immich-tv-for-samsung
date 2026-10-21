// Use the project's existing compiler; no additional TypeScript runtime.
import { build } from "esbuild";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const directory = resolve(".capture-tools");
await mkdir(directory, { recursive: true });
const entry = resolve(directory, `capture-${process.pid}.mjs`);
try {
  await build({
    entryPoints: ["scripts/capture/run-capture.ts"],
    outfile: entry,
    bundle: true,
    packages: "external",
    platform: "node",
    target: "node22",
    format: "esm",
    write: false
  }).then(async (result) => writeFile(entry, result.outputFiles[0].contents));
  await import(pathToFileURL(entry).href);
} finally {
  await rm(entry, { force: true });
}
