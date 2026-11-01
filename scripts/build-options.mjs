import { resolve } from "node:path";

// The two distributions (ADR 0021). A sideload build, the default, carries
// Settings › Support Us and the splash's support line; a store build carries
// no tip link at all and is asked for explicitly:
//   npm run build:store
//   IMMICH_TV_DISTRIBUTION=store npm run tizen:package
export const distributions = ["sideload", "store"];

export function readDistribution(argv = process.argv, env = process.env) {
  if (argv.includes("--store")) {
    return "store";
  }

  const value = env.IMMICH_TV_DISTRIBUTION;

  if (value === undefined || value === "") {
    return "sideload";
  }

  if (!distributions.includes(value)) {
    throw new Error(
      `IMMICH_TV_DISTRIBUTION must be ${distributions.join(" or ")}, not "${value}".`
    );
  }

  return value;
}

// The esbuild options for the app bundle. The distribution reaches the code
// as __IMMICH_TV_DISTRIBUTION__, which only src/app/distribution.ts reads.
export function appBundleOptions(root, { debug = false, distribution = "sideload" } = {}) {
  return {
    bundle: true,
    define: { __IMMICH_TV_DISTRIBUTION__: JSON.stringify(distribution) },
    entryPoints: [resolve(root, "src", "app", "main.ts")],
    format: "iife",
    legalComments: "none",
    minify: !debug,
    outfile: resolve(root, "dist", "scripts", "main.js"),
    platform: "browser",
    sourcemap: false,
    target: ["chrome63"]
  };
}

// Anything that would point a store build at the tip page.
export const tipLinkPattern = /ko-?fi/i;
