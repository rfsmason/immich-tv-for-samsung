#!/usr/bin/env node

/** Create artificial Memories in a dedicated demo library only.
 * node scripts/create-demo-memories.mjs --dry-run --seed website
 * node scripts/create-demo-memories.mjs --yes --seed website --date 2026-10-19
 * Credentials and CAPTURE_DEMO_LIBRARY=yes come from .env.capture or environment.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import process, { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const envPath = fileURLToPath(new URL("../.env.capture", import.meta.url));

export async function runDemoMemories(args, env, fetchRequest = fetch, log = console.log) {
  // Strict parsing rejects removed credential flags without echoing their values.
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
        date: { type: "string", default: "2026-10-19" },
        count: { type: "string", default: "12" },
        "assets-per-memory": { type: "string", default: "6" },
        "candidate-assets": { type: "string", default: "200" },
        seed: { type: "string" }
      }
    }));
  } catch {
    throw new Error(
      "Invalid arguments. Use --yes, --dry-run, --date, --count, --assets-per-memory, --candidate-assets or --seed. Credentials come only from .env.capture or environment."
    );
  }
  if (env.CAPTURE_DEMO_LIBRARY !== "yes") {
    throw new Error("Set CAPTURE_DEMO_LIBRARY=yes to confirm this is a dedicated demo library.");
  }
  let url;
  try {
    url = new URL(env.CAPTURE_IMMICH_URL?.trim());
  } catch {
    throw new Error("Set a valid CAPTURE_IMMICH_URL in .env.capture or environment.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The demo URL must be HTTP(S), without credentials, query parameters or a fragment."
    );
  }
  const server = url.href.replace(/\/+$/, "");
  const apiKey = env.CAPTURE_IMMICH_API_KEY?.trim();
  if (!apiKey) throw new Error("Set CAPTURE_IMMICH_API_KEY in .env.capture or environment.");
  const captureDate = new Date(`${values.date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
    Number.isNaN(captureDate.getTime()) ||
    captureDate.toISOString().slice(0, 10) !== values.date
  ) {
    throw new Error("--date must be a valid YYYY-MM-DD date.");
  }
  const positiveInt = (name) => {
    const value = Number(values[name]);
    if (!/^\d+$/.test(values[name]) || !Number.isSafeInteger(value) || value < 1)
      throw new Error(`--${name} must be a positive integer.`);
    return value;
  };
  const count = positiveInt("count");
  const assetsPerMemory = positiveInt("assets-per-memory");
  const candidateAssetCount = positiveInt("candidate-assets");
  log(`Target Immich server: ${server}`);
  log(`Capture date: ${values.date} (UTC)`);
  if (!values["dry-run"] && !values.yes) {
    throw new Error(
      "This creates artificial Memories visible to this account in other Immich apps. Review --dry-run, then supply --yes to write to this demo server."
    );
  }
  async function requestJson(pathname, body) {
    let response;
    try {
      response = await fetchRequest(`${server}/api${pathname}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error(`Network failure during ${pathname}.`);
    }
    // Do not print raw response bodies, which may contain private metadata.
    if (!response.ok) throw new Error(`HTTP ${response.status} POST ${pathname}`);
    try {
      return await response.json();
    } catch {
      throw new Error(`Invalid JSON response during ${pathname}.`);
    }
  }
  // Immich's structured search (v3.2.0+), matching the app's filters; the
  // deprecated flat order/page/visibility fields cannot be mixed with it.
  const result = await requestJson("/search/metadata", {
    filter: {
      trashedAt: { eq: null },
      type: { in: ["IMAGE", "VIDEO"] },
      visibility: { eq: "timeline" }
    },
    orderBy: { direction: "desc", field: "fileCreatedAt" },
    size: candidateAssetCount,
    withExif: true
  });
  if (!Array.isArray(result?.assets?.items))
    throw new Error("Immich returned an unexpected search response.");
  // Kept as a safety net should the server ignore the type filter.
  const candidates = result.assets.items.filter(
    (asset) => typeof asset?.id === "string" && (asset.type === "IMAGE" || asset.type === "VIDEO")
  );
  if (candidates.length < assetsPerMemory)
    throw new Error(`Not enough usable assets. Need at least ${assetsPerMemory}.`);
  if (candidates.length < count * assetsPerMemory)
    log("Some assets will appear in more than one Memory.");
  // A fixed default seed makes a dry-run plan repeatable for unchanged candidates.
  const assets = shuffle(candidates, createRandom(values.seed ?? "demo-memories"));
  const showAt = new Date(captureDate);
  showAt.setUTCHours(0, 0, 0, 0);
  const hideAt = new Date(showAt.getTime() + 24 * 60 * 60 * 1000);
  const yearsAgo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
  const plan = Array.from({ length: count }, (_, index) => {
    const year = captureDate.getUTCFullYear() - yearsAgo[index % yearsAgo.length];
    const memoryAt = new Date(captureDate);
    memoryAt.setUTCFullYear(year);
    // Clamp leap-day anniversaries to February's last day in non-leap years.
    if (memoryAt.getUTCMonth() !== captureDate.getUTCMonth()) memoryAt.setUTCDate(0);
    return {
      type: "on_this_day",
      data: { year },
      memoryAt: memoryAt.toISOString(),
      showAt: showAt.toISOString(),
      hideAt: hideAt.toISOString(),
      assetIds: Array.from(
        { length: assetsPerMemory },
        (_, offset) => assets[(index * assetsPerMemory + offset) % assets.length].id
      ),
      isSaved: false
    };
  });
  log(
    `Artificial Memory plan (years are demo labels, not actual photo dates):\n${JSON.stringify(plan, null, 2)}`
  );
  if (values["dry-run"]) {
    log("Dry run: no Memories created.");
    return;
  }
  for (const memory of plan) {
    const created = await requestJson("/memories", memory);
    log(`Created Memory ${created.id}`);
  }
  log(
    `Created ${plan.length} Memories; visible from ${showAt.toISOString()} until ${hideAt.toISOString()}. Re-running creates duplicates.`
  );
}

function createRandom(seedValue) {
  if (seedValue === null || seedValue === undefined) {
    return Math.random;
  }

  let state = 0;

  for (const char of String(seedValue)) {
    state = (state * 31 + char.charCodeAt(0)) >>> 0;
  }

  return function random() {
    state += 0x6d2b79f5;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);

    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));

    [result[index], result[other]] = [result[other], result[index]];
  }

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (existsSync(envPath)) loadEnvFile(envPath);
    await runDemoMemories(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Demo Memories generation failed.");
    process.exitCode = 1;
  }
}
