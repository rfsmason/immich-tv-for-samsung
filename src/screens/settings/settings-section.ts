import type { AppSettings } from "../../domain/app-settings";

export type SettingsSectionId = "connection" | "display";

// One section of Settings: its button on the Settings rail and the panel the
// button opens. The Settings screen owns the rail, saving and the
// unsaved-changes guard; each section owns its own controls.
export type SettingsSection = {
  button: HTMLButtonElement;
  id: SettingsSectionId;
  panel: HTMLElement;
  // The control focused when the section opens.
  firstControl(): HTMLElement;
  // The app settings this section's controls set.
  readAppSettings(): Partial<AppSettings>;
  // Shows stored app settings in this section's controls.
  showAppSettings(settings: AppSettings): void;
  // The controls' current values, compared to find unsaved changes.
  snapshot(): unknown;
};

export function requireElement<T extends HTMLElement>(documentRef: Document, id: string): T {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}
