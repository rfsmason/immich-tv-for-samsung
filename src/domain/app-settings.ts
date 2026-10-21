export type AppSettings = {
  autoplayVideos: boolean;
  showViewerDate: boolean;
  showViewerExif: boolean;
  showViewerTime: boolean;
  slideshowIntervalSeconds: number;
};

export const defaultSlideshowIntervalSeconds = 8;

export const defaultAppSettings: AppSettings = {
  autoplayVideos: false,
  showViewerDate: true,
  showViewerExif: true,
  showViewerTime: true,
  slideshowIntervalSeconds: defaultSlideshowIntervalSeconds
};

export function normalizeAppSettings(settings: Partial<AppSettings> | null): AppSettings {
  return {
    autoplayVideos: settings?.autoplayVideos === true,
    showViewerDate: settings?.showViewerDate !== false,
    showViewerExif: settings?.showViewerExif !== false,
    showViewerTime: settings?.showViewerTime !== false,
    slideshowIntervalSeconds: normalizeSlideshowIntervalSeconds(settings?.slideshowIntervalSeconds)
  };
}

export function normalizeSlideshowIntervalSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSlideshowIntervalSeconds;
  }

  const roundedValue = Math.round(value);

  if (roundedValue < 3 || roundedValue > 60) {
    return defaultSlideshowIntervalSeconds;
  }

  return roundedValue;
}
