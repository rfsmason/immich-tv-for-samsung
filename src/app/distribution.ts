import { tipPage, type SupportPage } from "../screens/settings/support-qr";

// Which build this is (ADR 0021): a sideload build, the default, or a store
// build. scripts/build-app.mjs sets __IMMICH_TV_DISTRIBUTION__ with esbuild's
// define, and this module is the only place that reads it. Tests run
// unbundled, where it is undefined, so they get the sideload build.
export type Distribution = "sideload" | "store";

declare const __IMMICH_TV_DISTRIBUTION__: string | undefined;

const buildDistribution =
  typeof __IMMICH_TV_DISTRIBUTION__ === "undefined" ? undefined : __IMMICH_TV_DISTRIBUTION__;

export function readDistribution(value: unknown): Distribution {
  return value === "store" ? "store" : "sideload";
}

export const distribution: Distribution = readDistribution(buildDistribution);

// The tip page for Settings › Support Us, or null in a store build. The
// define is compared here, not through `distribution`, because esbuild folds
// a define only where it is written: a store build's condition becomes
// false, the tip page is never referenced and minification drops its link
// and QR code from the bundle.
export const supportPage: SupportPage | null =
  typeof __IMMICH_TV_DISTRIBUTION__ !== "undefined" && __IMMICH_TV_DISTRIBUTION__ === "store"
    ? null
    : tipPage;

// Support Us and the splash's support line exist only in sideload builds.
export const supportLinksEnabled = supportPage !== null;
