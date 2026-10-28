import {
  normalizePlaybackButtonsHide,
  playbackButtonsHideOptions
} from "../../domain/app-settings";
import { mountSettingsDropdown } from "./settings-dropdown";
import { requireElement, type SettingsSection } from "./settings-section";

const slideshowIntervalOptions = [5, 8, 12, 20].map((seconds) => ({
  label: `${seconds} seconds`,
  value: String(seconds)
}));

// When the viewer's buttons fade during a slideshow or video.
const playbackButtonsHideChoices = playbackButtonsHideOptions.map((option) => ({
  label: option === "never" ? "Never" : `After ${option} seconds`,
  value: String(option)
}));

// Settings > Display: high contrast, video autoplay, viewer overlays, the
// slideshow interval and when the playback buttons fade.
export function createDisplaySection(documentRef: Document): SettingsSection {
  const highContrastInput = requireElement<HTMLInputElement>(documentRef, "high-contrast");
  const autoplayVideosInput = requireElement<HTMLInputElement>(documentRef, "autoplay-videos");
  const showViewerDateInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-date");
  const showViewerExifInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-exif");
  const showViewerTimeInput = requireElement<HTMLInputElement>(documentRef, "show-viewer-time");
  const slideshowInterval = mountSettingsDropdown({
    control: requireElement<HTMLButtonElement>(documentRef, "slideshow-interval"),
    name: "Slideshow interval",
    options: slideshowIntervalOptions
  });

  const playbackButtonsHide = mountSettingsDropdown({
    control: requireElement<HTMLButtonElement>(documentRef, "playback-buttons-hide"),
    name: "Hide playback buttons",
    options: playbackButtonsHideChoices
  });
  const readPlaybackButtonsHide = () => {
    const value = playbackButtonsHide.value();

    return normalizePlaybackButtonsHide(value === "never" ? value : Number(value));
  };

  return {
    button: requireElement<HTMLButtonElement>(documentRef, "settings-section-display"),
    dropdowns: [slideshowInterval, playbackButtonsHide],
    id: "display",
    panel: requireElement(documentRef, "settings-panel-display"),
    firstControl: () => highContrastInput,
    readAppSettings() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        highContrast: highContrastInput.checked,
        playbackButtonsHide: readPlaybackButtonsHide(),
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        slideshowIntervalSeconds: Number(slideshowInterval.value())
      };
    },
    showAppSettings(settings) {
      autoplayVideosInput.checked = settings.autoplayVideos;
      highContrastInput.checked = settings.highContrast;
      showViewerDateInput.checked = settings.showViewerDate;
      showViewerExifInput.checked = settings.showViewerExif;
      showViewerTimeInput.checked = settings.showViewerTime;
      slideshowInterval.setValue(String(settings.slideshowIntervalSeconds));
      playbackButtonsHide.setValue(String(settings.playbackButtonsHide));
    },
    snapshot() {
      return {
        autoplayVideos: autoplayVideosInput.checked,
        highContrast: highContrastInput.checked,
        showViewerDate: showViewerDateInput.checked,
        showViewerExif: showViewerExifInput.checked,
        showViewerTime: showViewerTimeInput.checked,
        playbackButtonsHide: playbackButtonsHide.value(),
        slideshowIntervalSeconds: slideshowInterval.value()
      };
    }
  };
}
