import type { CurrentUser, ServerVersion } from "../../domain/connection";

export function readServerLabel(version: ServerVersion): string {
  const suffix = version.prerelease ? `-${version.prerelease}` : "";

  return `Immich ${version.major}.${version.minor}.${version.patch}${suffix}`;
}

export function readUserLabel(user: CurrentUser): string {
  return user.name || user.email || "Immich";
}
