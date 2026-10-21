import type { ServerVersion } from "../../domain/connection";

// The oldest Immich release this client supports. Album detail, Favourites and
// People use the structured /search/metadata request (`filter`, `orderBy`,
// `cursor`), which Immich added in v3.2.0.
export const minimumServerVersion: ServerVersion = { major: 3, minor: 2, patch: 0 };

// Compares release numbers only; a prerelease of the minimum counts as it.
export function isSupportedServerVersion(version: ServerVersion): boolean {
  const order: Array<keyof Pick<ServerVersion, "major" | "minor" | "patch">> = [
    "major",
    "minor",
    "patch"
  ];

  for (const part of order) {
    if (version[part] !== minimumServerVersion[part]) {
      return version[part] > minimumServerVersion[part];
    }
  }

  return true;
}
