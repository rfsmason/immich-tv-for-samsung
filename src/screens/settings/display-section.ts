import { requireElement, type SettingsSection } from "./settings-section";

// Settings > Display: viewer overlays, video autoplay and the slideshow
// interval.
export function createDisplaySection(documentRef: Document): SettingsSection {
  const autoplayVideosInput = requireElement<HTMLInputElement>(documentRef, "autoplay-videos");
  const showViewerDateInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-date");
  const showViewerExifInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-exif");
  const showViewerTimeInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-time");
  const slideshowIntervalInput = requireElement<HTMLSelectElement>(
    documentRef,
    "slideshow-interval"
  );

  return {
    button: requireElement<HTMLButtonElement>(documentRef, "settings-section-display"),
    id: "display",
    panel: requireElement(documentRef, "settings-panel-display"),
    firstControl: () => autoplayVideosInput,
    readAppSettings() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        slideshowIntervalSeconds: Number(slideshowIntervalInput.value)
      };
    },
    showAppSettings(settings) {
      autoplayVideosInput.checked = settings.autoplayVideos;
      showViewerDateInput.checked = settings.showViewerDate;
      showViewerExifInput.checked = settings.showViewerExif;
      showViewerTimeInput.checked = settings.showViewerTime;
      slideshowIntervalInput.value = String(settings.slideshowIntervalSeconds);
    },
    snapshot() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        slideshowIntervalSeconds: slideshowIntervalInput.value
      };
    }
  };
}
