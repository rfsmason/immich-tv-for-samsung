import { mountSettingsDropdown } from "./settings-dropdown";
import { requireElement, type SettingsSection } from "./settings-section";

const slideshowIntervalOptions = [5, 8, 12, 20].map((seconds) => ({
  label: `${seconds} seconds`,
  value: String(seconds)
}));

// Settings > Display: viewer overlays, video autoplay and the slideshow
// interval.
export function createDisplaySection(documentRef: Document): SettingsSection {
  const autoplayVideosInput = requireElement<HTMLInputElement>(documentRef, "autoplay-videos");
  const showViewerDateInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-date");
  const showViewerExifInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-exif");
  const showViewerTimeInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-time");
  const slideshowInterval = mountSettingsDropdown({
    control: requireElement<HTMLButtonElement>(documentRef, "slideshow-interval"),
    name: "Slideshow interval",
    options: slideshowIntervalOptions
  });

  return {
    button: requireElement<HTMLButtonElement>(documentRef, "settings-section-display"),
    dropdowns: [slideshowInterval],
    id: "display",
    panel: requireElement(documentRef, "settings-panel-display"),
    firstControl: () => autoplayVideosInput,
    readAppSettings() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        slideshowIntervalSeconds: Number(slideshowInterval.value())
      };
    },
    showAppSettings(settings) {
      autoplayVideosInput.checked = settings.autoplayVideos;
      showViewerDateInput.checked = settings.showViewerDate;
      showViewerExifInput.checked = settings.showViewerExif;
      showViewerTimeInput.checked = settings.showViewerTime;
      slideshowInterval.setValue(String(settings.slideshowIntervalSeconds));
    },
    snapshot() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        slideshowIntervalSeconds: slideshowInterval.value()
      };
    }
  };
}
