// npm run website:videos: regenerates the demo video tiles in
// website/index.html from website/demo-videos.json and YouTube.
// npm run website:videos:check: the offline check run by npm run check.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import {
  buildTiles,
  checkGallery,
  readTiles,
  replaceGallery,
  summariseChanges
} from "./gallery.mjs";
import { validateManifest } from "./manifest.mjs";
import { fetchVideos } from "./youtube.mjs";

const keyHelp = `Set YOUTUBE_API_KEY in the environment or in .env.website at the repository root
(copy .env.website.example; it is ignored by git, so never commit the key).

To create a key: in the Google Cloud console, create or choose a project, enable
"YouTube Data API v3" under APIs & Services → Library, then create an API key under
APIs & Services → Credentials. Edit the key and, under API restrictions, restrict it
to YouTube Data API v3. The generator only reads public video details.`;

// The site's root directory is deployed as it is, so a local environment file
// must never sit inside it.
function assertNoEnvFiles(websiteDir) {
  const envFiles = readdirSync(websiteDir).filter((name) => /^\.env(\.|$)/.test(name));

  if (envFiles.length > 0) {
    throw new Error(
      `Move ${envFiles.join(", ")} out of website/: everything there is deployed. ` +
        "Keep .env.website at the repository root."
    );
  }
}

function tileCount(count) {
  return `${count} ${count === 1 ? "tile" : "tiles"}`;
}

function readApiKey(root, env) {
  if (env.YOUTUBE_API_KEY) {
    return env.YOUTUBE_API_KEY;
  }

  const file = resolve(root, ".env.website");
  const key = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).YOUTUBE_API_KEY : undefined;

  if (!key) {
    throw new Error(`No YouTube Data API key.\n\n${keyHelp}`);
  }

  return key;
}

function readManifest(websiteDir) {
  let data;

  try {
    data = JSON.parse(readFileSync(resolve(websiteDir, "demo-videos.json"), "utf8"));
  } catch (error) {
    throw new Error(`Could not read website/demo-videos.json: ${error.message}`);
  }

  return validateManifest(data);
}

// Returns the lines to print. Throws, leaving index.html untouched, on any
// problem.
export async function run({ root, check = false, env = process.env, fetchImpl = fetch }) {
  const websiteDir = resolve(root, "website");
  const indexFile = resolve(websiteDir, "index.html");

  assertNoEnvFiles(websiteDir);

  const entries = readManifest(websiteDir);
  const html = readFileSync(indexFile, "utf8");

  if (check) {
    const problems = checkGallery(html, entries);

    if (problems.length > 0) {
      throw new Error(
        `The demo video tiles in website/index.html don't match website/demo-videos.json:\n  ${problems.join("\n  ")}\n` +
          "Run npm run website:videos to regenerate them."
      );
    }

    return [
      `Demo videos: website/index.html matches website/demo-videos.json (${tileCount(entries.length)}).`
    ];
  }

  const apiKey = readApiKey(root, env);
  const videos = await fetchVideos(
    entries.map((entry) => entry.id),
    apiKey,
    fetchImpl
  );
  const tiles = buildTiles(entries, videos);
  const updated = replaceGallery(html, tiles);
  const changes = summariseChanges(readTiles(html), tiles);

  if (updated === html) {
    return ["Demo videos: website/index.html is already up to date."];
  }

  writeFileSync(indexFile, updated);

  return [
    `Demo videos: wrote ${tileCount(tiles.length)} to website/index.html.`,
    ...(changes.length > 0 ? changes : ["Only the markup between the markers changed."])
  ].map((line, index) => (index === 0 ? line : `  ${line}`));
}
