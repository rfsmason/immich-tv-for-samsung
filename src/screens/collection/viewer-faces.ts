import type { AlbumAsset } from "../../domain/album";
import type { AssetFace } from "../../domain/face";
import { isAppError } from "../../errors/app-error";
import type { AppSettingsStore } from "../../storage/app-settings-store";
import {
  clampLabelLeft,
  clampLabelTop,
  mapFaceToContent,
  readContainedContentRect
} from "./face-overlay-layout";

// The viewer's Faces button and face tag overlay (ADR 0017). While Faces is
// on, the current photo's faces are requested once its image has loaded, and
// drawn over it: named people with a label, unnamed faces as an outline only.
// Nothing is prefetched; the last few assets' faces are kept, and dropped
// when the viewer resets. Videos and slideshows show no face tags.

const cachedAssetLimit = 3;
const noFacesMessage = "No faces tagged";
const permissionMessage = "Face tags need the face.read permission on your Immich API key.";

export type ViewerFaceElements = {
  facesButton: HTMLButtonElement;
  facesOverlay: HTMLElement;
  facesStatus: HTMLElement;
  image: HTMLImageElement;
  video: HTMLVideoElement;
};

export type ViewerFaces = {
  // Forgets cached faces and clears the overlay, for example when the viewer
  // closes or the collection changes.
  reset(): void;
  // Brings the button and overlay up to date with the current asset, the
  // image's load state and the slideshow.
  sync(): void;
  toggle(): void;
};

type ViewerFacesOptions = {
  currentAsset(): AlbumAsset | null;
  elements: ViewerFaceElements;
  isSlideshowPlaying(): boolean;
  loadFaces(assetId: string): Promise<AssetFace[]>;
  settingsStore: AppSettingsStore;
};

export function createViewerFaces(options: ViewerFacesOptions): ViewerFaces {
  const { elements } = options;
  // Faces stays off for the rest of the session once the key is refused.
  let refusedForSession = false;
  let cache: Array<{ assetId: string; faces: AssetFace[] }> = [];
  let drawnAssetId: string | null = null;
  // A failed request is not retried until the viewer resets.
  let failedAssetId: string | null = null;
  let pendingAssetId: string | null = null;
  let requestId = 0;
  // The status line belongs to one asset and clears when the asset changes.
  let statusAssetId: string | null = null;

  function isOn(): boolean {
    return !refusedForSession && options.settingsStore.load().showFaceTags;
  }

  function readCached(assetId: string): AssetFace[] | null {
    const entry = cache.filter((candidate) => candidate.assetId === assetId)[0];

    return entry ? entry.faces : null;
  }

  function remember(assetId: string, faces: AssetFace[]): void {
    cache = cache.filter((entry) => entry.assetId !== assetId);
    cache.push({ assetId, faces });
    cache = cache.slice(-cachedAssetLimit);
  }

  function setStatus(message: string | null, assetId: string | null): void {
    elements.facesStatus.textContent = message || "";
    elements.facesStatus.hidden = !message;
    statusAssetId = message ? assetId : null;
  }

  function clearOverlay(): void {
    elements.facesOverlay.textContent = "";
    elements.facesOverlay.hidden = true;
    drawnAssetId = null;
  }

  // The asset's own still is on screen and decoded, with no motion playing.
  function isImageReady(asset: AlbumAsset): boolean {
    const image = elements.image;

    return (
      !image.hidden &&
      image.getAttribute("data-asset-id") === asset.id &&
      image.complete &&
      image.naturalWidth > 0 &&
      elements.video.hidden
    );
  }

  function draw(assetId: string, faces: AssetFace[]): void {
    const image = elements.image;
    const stage = { height: image.clientHeight, width: image.clientWidth };
    const content = readContainedContentRect(stage, {
      height: image.naturalHeight,
      width: image.naturalWidth
    });
    const documentRef = elements.facesOverlay.ownerDocument;

    clearOverlay();
    drawnAssetId = assetId;
    setStatus(faces.length === 0 ? noFacesMessage : null, assetId);

    if (!content) {
      return;
    }

    // Shown before the labels go in, so each can be measured to centre it.
    elements.facesOverlay.hidden = false;
    faces.forEach((face) => {
      const rect = mapFaceToContent(face, content);
      const box = documentRef.createElement("span");

      box.className = "asset-viewer-face-box";
      setRect(box, rect);
      elements.facesOverlay.appendChild(box);

      if (!face.personName) {
        return;
      }

      const label = documentRef.createElement("span");

      label.className = "asset-viewer-face-label";
      label.textContent = face.personName;
      elements.facesOverlay.appendChild(label);
      label.style.left = `${clampLabelLeft(rect, label.offsetWidth || 0, stage.width)}px`;
      label.style.top = `${clampLabelTop(rect, label.offsetHeight || 0, stage.height)}px`;
    });
  }

  function request(assetId: string): void {
    if (pendingAssetId === assetId || failedAssetId === assetId) {
      return;
    }

    requestId += 1;
    const id = requestId;

    pendingAssetId = assetId;
    options
      .loadFaces(assetId)
      .then((faces) => {
        if (id !== requestId) {
          return;
        }

        pendingAssetId = null;
        remember(assetId, faces);
        sync();
      })
      .catch((error: unknown) => {
        if (id !== requestId) {
          return;
        }

        pendingAssetId = null;

        if (isAppError(error) && error.kind === "permission") {
          refusedForSession = true;
          sync();
          setStatus(permissionMessage, assetId);
          return;
        }

        // Face tags are an extra: a failed request leaves the photo as it is.
        failedAssetId = assetId;
      });
  }

  function renderButton(asset: AlbumAsset | null): void {
    const on = isOn();
    const label = on ? "Hide face tags" : "Show face tags";

    elements.facesButton.hidden =
      !asset || asset.type !== "image" || options.isSlideshowPlaying() || refusedForSession;
    elements.facesButton.setAttribute("aria-pressed", on ? "true" : "false");
    elements.facesButton.setAttribute("aria-label", label);
    elements.facesButton.title = label;
  }

  function sync(): void {
    const asset = options.currentAsset();

    renderButton(asset);

    if (!asset || asset.id !== statusAssetId) {
      setStatus(null, null);
    }

    if (
      !asset ||
      asset.type !== "image" ||
      !isOn() ||
      options.isSlideshowPlaying() ||
      !isImageReady(asset)
    ) {
      clearOverlay();
      if (!refusedForSession) {
        setStatus(null, null);
      }
      return;
    }

    if (drawnAssetId === asset.id) {
      return;
    }

    const faces = readCached(asset.id);

    if (faces) {
      draw(asset.id, faces);
    } else {
      request(asset.id);
    }
  }

  return {
    reset() {
      requestId += 1;
      pendingAssetId = null;
      failedAssetId = null;
      cache = [];
      clearOverlay();
      setStatus(null, null);
    },
    sync,
    toggle() {
      const settings = options.settingsStore.load();

      options.settingsStore.save({ ...settings, showFaceTags: !settings.showFaceTags });
      sync();
    }
  };
}

function setRect(
  element: HTMLElement,
  rect: { height: number; left: number; top: number; width: number }
): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}
