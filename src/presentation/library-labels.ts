import type { LibraryView } from "../domain/library";

// Library view headers, in the app's UK spelling.
const libraryViewTitles: Record<LibraryView, string> = {
  favorites: "Favourites",
  "recently-added": "Recently added",
  videos: "Videos"
};

export function formatLibraryViewTitle(view: LibraryView): string {
  return libraryViewTitles[view];
}
