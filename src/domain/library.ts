// Library views: asset subsets reached from Home rails (ADR 0016). Each is a
// paged feed in the shared collection.
export type LibraryView = "favorites" | "videos" | "recently-added";

export function isLibraryView(kind: string): kind is LibraryView {
  return kind === "favorites" || kind === "videos" || kind === "recently-added";
}
