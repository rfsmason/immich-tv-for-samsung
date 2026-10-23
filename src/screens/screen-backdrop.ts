import type { AlbumAsset } from "../domain/album";

// A screen's decorative backdrop: one random picture, shown faintly behind
// the screen. Each screen supplies a picture relevant to what it shows (an
// album cover, a person's face, a photo from the collection), or a random
// favourite on general screens such as Home, Search and Settings. A backdrop
// never blocks the screen: failures leave it empty.

export type ScreenBackdrop = {
  // Releases the picture, for example when the screen hides. A picture still
  // loading is released when it arrives.
  clear(): void;
  // Replaces the picture with the one `loadUrl` returns.
  show(loadUrl: () => Promise<string | null>): void;
};

export function createScreenBackdrop(options: {
  image: HTMLImageElement;
  revokeUrl(url: string): void;
}): ScreenBackdrop {
  const { image } = options;
  let url: string | null = null;
  let request = 0;

  function release(): void {
    image.removeAttribute("src");
    image.className = "screen-backdrop";

    if (url) {
      options.revokeUrl(url);
      url = null;
    }
  }

  return {
    clear() {
      request += 1;
      release();
    },
    show(loadUrl) {
      request += 1;
      const id = request;

      loadUrl()
        .then((loadedUrl) => {
          if (!loadedUrl) {
            return;
          }

          if (id !== request) {
            options.revokeUrl(loadedUrl);
            return;
          }

          release();
          url = loadedUrl;
          image.src = loadedUrl;
          image.className = "screen-backdrop is-loaded";
        })
        .catch(() => {
          // Decorative only: the screen works without it.
        });
    }
  };
}

export function chooseRandomItem<T>(items: T[]): T | null {
  return items.length > 0 ? items[Math.floor(Math.random() * items.length)] || null : null;
}

// A random asset for a backdrop, preferring photos to videos.
export function chooseBackdropAsset(assets: AlbumAsset[]): AlbumAsset | null {
  const images = assets.filter((asset) => asset.type === "image");

  return chooseRandomItem(images.length > 0 ? images : assets);
}
