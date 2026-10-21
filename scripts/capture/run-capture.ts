import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { createImmichClient } from "../../src/api/immich/client";
import { silentLogger } from "../../src/logging/logger";
import { validateConnectionSettings } from "../../src/utils/url";
import { Remote } from "./remote";
import { TourGuide } from "./tour-guide";
import { buildApp, startPreview } from "./preview";
import { createSeed } from "./seed";
import { scenarios } from "./scenarios";

const viewport = { width: 1920, height: 1080 };
const { values } = parseArgs({
  options: {
    scenario: { type: "string" },
    list: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "scale-factor": { type: "string", default: "1" },
    date: { type: "string", default: "2026-10-19T12:00:00Z" },
    port: { type: "string", default: "5173" },
    interval: { type: "string", default: "8" },
    "tour-delay": { type: "string", default: "1200" },
    "slide-changes": { type: "string", default: "2" },
    "no-highlights": { type: "boolean", default: false }
  }
});

class CaptureError extends Error {}

async function main(): Promise<void> {
  if (values.list) {
    for (const scenario of scenarios)
      console.log(`${scenario.name} (${scenario.video ? "video" : "stills"})`);
    return;
  }
  const selected = values.scenario
    ? scenarios.filter((scenario) => scenario.name === values.scenario)
    : scenarios;
  if (selected.length === 0)
    throw new CaptureError("Unknown scenario. Use --list to see available names.");
  const scale = Number(values["scale-factor"]);
  const port = Number(values.port);
  const interval = Number(values.interval);
  const tourDelay = Number(values["tour-delay"]);
  const slideChanges = Number(values["slide-changes"]);
  if (!Number.isInteger(tourDelay) || tourDelay < 0 || tourDelay > 10_000)
    throw new CaptureError("--tour-delay must be an integer from 0 to 10000 milliseconds.");
  if (slideChanges !== 1 && slideChanges !== 2)
    throw new CaptureError("--slide-changes must be 1 or 2.");
  const pinnedDate = new Date(values.date!);
  if (scale !== 1 && scale !== 2) throw new CaptureError("--scale-factor must be 1 or 2.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new CaptureError("--port must be between 1 and 65535.");
  if (!Number.isInteger(interval) || interval < 3 || interval > 60)
    throw new CaptureError("--interval must be an integer from 3 to 60 seconds.");
  if (
    !/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(values.date!) ||
    Number.isNaN(pinnedDate.getTime()) ||
    pinnedDate.toISOString().slice(0, 10) !== values.date!.slice(0, 10)
  ) {
    throw new CaptureError("--date must be YYYY-MM-DD or an ISO UTC timestamp.");
  }

  if (existsSync(".env.capture")) loadEnvFile(".env.capture");
  const apiKey = process.env.CAPTURE_IMMICH_API_KEY?.trim();
  const serverUrl = process.env.CAPTURE_IMMICH_URL?.trim();
  if (!values["dry-run"] && (!apiKey || !serverUrl)) {
    throw new CaptureError(
      "Set CAPTURE_IMMICH_URL and CAPTURE_IMMICH_API_KEY in the environment or .env.capture. Use a demo library only."
    );
  }
  if (!values["dry-run"] && process.env.CAPTURE_DEMO_LIBRARY !== "yes") {
    throw new CaptureError(
      "Set CAPTURE_DEMO_LIBRARY=yes to confirm this is a public, licensed demo library."
    );
  }
  const settings = values["dry-run"]
    ? null
    : validateConnectionSettings({ apiKey: apiKey!, serverUrl: serverUrl! });
  if (settings) {
    const url = new URL(settings.serverUrl);
    if (url.username || url.password || url.search || url.hash) {
      throw new CaptureError(
        "The demo URL must not include credentials, query parameters or a fragment."
      );
    }
  }

  const controller = new AbortController();
  let browser: Browser | undefined;
  let stage = "build";
  const interrupted = () => {
    controller.abort();
    void browser?.close().catch(() => {});
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  let preview: Awaited<ReturnType<typeof startPreview>> | undefined;
  try {
    await buildApp(controller.signal);
    stage = "preview startup (check that --port is free)";
    preview = await startPreview(port, controller.signal);
    if (values["dry-run"]) {
      console.log(
        "Preview start/response/stop smoke check passed; no server credentials or captures used."
      );
      return;
    }
    stage = "demo connection/version check";
    console.log(`Capture date: ${pinnedDate.toISOString()} (UTC; override with --date).`);
    const origin = preview.origin;
    // Reuse the integration layer's existing version call, through precisely
    // the same-origin preview proxy used by the browser. No new Immich API.
    const client = createImmichClient({
      settings: settings!,
      logger: silentLogger,
      fetchImpl: (input, init) =>
        fetch(`${origin}/__immich-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: String(input),
            method: init?.method,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            body: init?.body
          }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
        })
    });
    const serverVersion = await client.getServerVersion();
    stage = "output directory setup";
    const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const appVersion: unknown = JSON.parse(await readFile("package.json", "utf8")).version;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const directory = join(
      "captures",
      `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6)}`
    );
    await mkdir("captures", { recursive: true });
    await mkdir(directory); // Refuse to overwrite another run in the same second.
    const results: Array<{ scenario: string; files: string[]; status: "complete" | "failed" }> = [];
    const saveManifest = async () =>
      writeFile(
        join(directory, "manifest.json"),
        JSON.stringify(
          {
            scenarios: results,
            viewport,
            scaleFactor: scale,
            videoSize: viewport,
            pinnedDate: pinnedDate.toISOString(),
            timezone: "UTC",
            locale: "en-GB",
            slideshowIntervalSeconds: interval,
            tourActionDelayMs: tourDelay,
            tourSlideChanges: slideChanges,
            tourHighlights: !values["no-highlights"],
            gitCommit,
            appVersion,
            immichServerVersion: {
              major: serverVersion.major,
              minor: serverVersion.minor,
              patch: serverVersion.patch
            }
          },
          null,
          2
        ) + "\n"
      );
    stage = "Chromium launch (run npx playwright install chromium)";
    browser = await chromium.launch();
    controller.signal.throwIfAborted();
    for (const scenario of selected) {
      controller.signal.throwIfAborted();
      stage = `scenario ${scenario.name} (check the documented demo-library shape and permissions)`;
      console.log(`Capturing ${scenario.name}...`);
      const files: string[] = [];
      const rawVideoDir = join(directory, `.video-${scenario.name}`);
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: scale,
        locale: "en-GB",
        timezoneId: "UTC",
        ...(scenario.video ? { recordVideo: { dir: rawVideoDir, size: viewport } } : {})
      });
      const page = await context.newPage();
      const guide = scenario.video && !values["no-highlights"] ? new TourGuide(page) : undefined;
      const remote = new Remote(page, {
        actionDelayMs: scenario.video ? tourDelay : 0,
        beforePress: guide ? () => guide.clear() : undefined
      });
      const video = page.video();
      let complete = false;
      try {
        // Date-only pinning leaves slideshow, fetch timeouts and decoding on
        // real timers. There is intentionally no clock.install()/pauseAt().
        await page.clock.setFixedTime(pinnedDate);
        await page.addInitScript(
          (entries) => {
            localStorage.clear();
            for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
          },
          createSeed(settings!, interval)
        );
        await page.goto(origin);
        await remote.visible("#home-screen");
        await remote.focus('[data-destination="home"]');
        await remote.ready();
        await remote.hold();
        await scenario.run({
          page,
          remote,
          interval,
          slideChanges,
          guide,
          capture: {
            async still(name) {
              await guide?.clear();
              await remote.ready();
              const filename = `${name}.png`;
              await page.screenshot({
                path: join(directory, filename),
                type: "png",
                fullPage: false,
                scale: "device"
              });
              files.push(filename);
            }
          }
        });
        complete = true;
      } catch {
        throw new CaptureError(
          `Scenario ${scenario.name} failed at ${remote.step}. Capture date: ${pinnedDate.toISOString().slice(0, 10)} (UTC). Check demo-library shape, permissions and image loading; date-dependent rails must have content for this date (override with --date).`
        );
      } finally {
        remote.dispose();
        try {
          await guide?.clear();
        } finally {
          await context.close(); // Video is finalized only once the context closes.
        }
        if (complete && video) {
          const filename = `${scenario.name}.webm`;
          await video.saveAs(join(directory, filename));
          files.push(filename);
        }
        await rm(rawVideoDir, { recursive: true, force: true });
        results.push({ scenario: scenario.name, files, status: complete ? "complete" : "failed" });
        await saveManifest();
      }
    }
    console.log(`Capture files and manifest written to ${directory}`);
  } catch (error) {
    if (error instanceof CaptureError && !controller.signal.aborted) throw error;
    throw new CaptureError(
      controller.signal.aborted
        ? "Capture interrupted; preview and browser shut down."
        : `Capture failed during ${stage}. No credentials have been logged.`
    );
  } finally {
    await Promise.allSettled([browser?.close(), preview?.stop()]);
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof CaptureError
      ? error.message
      : "Capture configuration failed. Check .env.capture and the documented options."
  );
  process.exitCode = 1;
}
