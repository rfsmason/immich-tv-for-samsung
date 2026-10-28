import type { ConnectionSettings } from "../domain/connection";
import { toUserMessage } from "../errors/app-error";
import { createFocusNavigator, isInputElement } from "../navigation/focus-navigation";
import { getKeyCode, remoteKeys } from "../platform/tizen/keys";
import type { ConnectionService } from "../app/connection-service";
import type { AppSettingsStore } from "../storage/app-settings-store";
import { createConnectionSection } from "./settings/connection-section";
import type { AmbientSettings } from "../domain/ambient";
import { createAmbientSection } from "./settings/ambient-section";
import { createDisplaySection } from "./settings/display-section";
import { createHomeSection } from "./settings/home-section";
import type { SettingsDropdown } from "./settings/settings-dropdown";
import {
  requireElement,
  type SettingsSection,
  type SettingsSectionId
} from "./settings/settings-section";

// The Settings screen: a rail of sections, each opening its panel, with Save
// and Back on the rail and a guard against leaving with unsaved changes. The
// sections own their controls (src/screens/settings/).

type SettingsScreenElements = {
  backButton: HTMLButtonElement;
  form: HTMLFormElement;
  root: HTMLElement;
  settingsPanelUnsaved: HTMLElement;
  settingsSaveButton: HTMLButtonElement;
  settingsSaveLabel: HTMLElement;
  summary: HTMLElement;
};

type SettingsBackOptions = {
  bypassGuard?: boolean;
};

type ConnectionScreenOptions = {
  documentRef?: Document;
  onBack?(options?: SettingsBackOptions): void;
  onReturnToShell?(): void;
  // Every successful Save, after the app settings are stored.
  onAppSettingsSaved?(): void;
  // Choose an album for ambient mode, starting from the current one.
  onChooseAmbientAlbum?(album: AmbientSettings["album"]): void;
  onSaved?(settings: ConnectionSettings): void;
  // Start now, with the Ambient section's current choices.
  onStartAmbient?(settings: AmbientSettings): void;
  settingsStore: AppSettingsStore;
  service: ConnectionService;
};

export type ConnectionScreenController = {
  destroy(): void;
  focusContent(): void;
  // Focuses one section's button on the Settings rail.
  focusSection(id: SettingsSectionId): void;
  hide(): void;
  requestExit(): boolean;
  // Focuses Settings → Ambient's album field.
  focusAmbientAlbum(): void;
  // Shows Settings again as it was left, unsaved changes included, after a
  // child screen (the ambient album picker).
  resumeAfterAlbumPicker(album: { id: string; name: string } | null): void;
  show(options?: { allowBack?: boolean }): void;
};

const settingsSummary = "Settings";

export function mountConnectionScreen(
  options: ConnectionScreenOptions
): ConnectionScreenController {
  const documentRef = options.documentRef || document;
  const elements = readElements(documentRef);
  const connection = createConnectionSection(documentRef, options.service);
  const ambient = createAmbientSection(documentRef);
  const sections: SettingsSection[] = [
    connection,
    createDisplaySection(documentRef),
    createHomeSection(documentRef),
    ambient
  ];
  const navigator = createFocusNavigator(
    () =>
      Array.prototype.slice
        .call(elements.root.querySelectorAll(".focusable:not([hidden])"))
        .filter(isVisibleElement),
    () => documentRef.activeElement
  );
  const dropdowns = sections.reduce<SettingsDropdown[]>(
    (all, section) => all.concat(section.dropdowns || []),
    []
  );
  let activeSection: SettingsSection = connection;
  let savedSnapshot = "";
  let dirtyStatusTimerId: number | null = null;
  let suppressNextActionClick = false;

  hydrateForm();
  connection.disableTextEntry();
  savedSnapshot = readSettingsSnapshot();
  hideSettingsPanels();

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void connection.testConnection();
  });
  elements.form.addEventListener("input", () => {
    updateDirtyStatus();
  });
  elements.form.addEventListener("change", () => {
    updateDirtyStatus();
  });
  elements.form.addEventListener("click", (event) => {
    const actionElement = findActionElement(event.target);

    if (!actionElement) {
      return;
    }

    event.preventDefault();

    if (suppressNextActionClick) {
      suppressNextActionClick = false;
      return;
    }

    handleAction(actionElement.getAttribute("data-action"));
  });

  // Keys on the left rail belong to the shell: handling them here moved
  // focus into Settings' sections when Down on the Settings rail item should
  // reach Refresh.
  const handleDocumentKeydown = (event: KeyboardEvent) => {
    if (elements.root.hidden || !elements.root.contains(event.target as Node | null)) {
      return;
    }

    handleKeydown(event);
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);

  return {
    destroy() {
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      stopDirtyStatusTimer();
    },
    focusContent() {
      connection.button.focus();
    },
    focusSection(id) {
      const section = sections.filter((candidate) => candidate.id === id)[0];

      if (section) {
        activeSection = section;
        section.button.focus();
      }
    },
    hide() {
      stopDirtyStatusTimer();
      connection.disableTextEntry();
      elements.root.hidden = true;
    },
    requestExit() {
      return requestSettingsExit();
    },
    resumeAfterAlbumPicker(album) {
      if (album) {
        ambient.setAlbum(album);
      }

      elements.root.hidden = false;
      activeSection = ambient;
      showSettingsSection(ambient);
      updateDirtyStatus();
      startDirtyStatusTimer();
    },
    focusAmbientAlbum() {
      documentRef.getElementById("ambient-album")?.focus();
    },
    show(showOptions = {}) {
      elements.root.hidden = false;
      elements.backButton.hidden = !showOptions.allowBack;
      activeSection = connection;
      hydrateForm();
      savedSnapshot = readSettingsSnapshot();
      hideSettingsPanels();
      connection.disableTextEntry();
      updateDirtyStatus();
      startDirtyStatusTimer();
      connection.button.focus();
    }
  };

  function startDirtyStatusTimer(): void {
    stopDirtyStatusTimer();
    dirtyStatusTimerId = window.setInterval(() => {
      if (!elements.root.hidden) {
        updateDirtyStatus();
      }
    }, 250);
  }

  function stopDirtyStatusTimer(): void {
    if (dirtyStatusTimerId !== null) {
      window.clearInterval(dirtyStatusTimerId);
      dirtyStatusTimerId = null;
    }
  }

  // Messages about Settings as a whole (saving, unsaved changes, exiting)
  // show in the summary line above every section, so they are seen from any
  // section.
  function setSettingsStatus(message: string, state = "idle"): void {
    elements.summary.textContent = message;
    elements.summary.setAttribute("data-state", state);
  }

  function hydrateForm(): void {
    const appSettings = options.settingsStore.load();

    sections.forEach((section) => section.showAppSettings(appSettings));
    setSettingsStatus(settingsSummary);
    connection.loadConnection();
  }

  function saveSettings(exitAfterSave: boolean): boolean {
    try {
      const settings = options.service.save(connection.readConnection());
      const changes = sections.reduce(
        (merged, section) => ({ ...merged, ...section.readAppSettings() }),
        {}
      );
      // Settings kept elsewhere (for example sort orders) are saved as they are.
      const appSettings = options.settingsStore.save({
        ...options.settingsStore.load(),
        ...changes
      });

      connection.showSavedConnection(settings);
      sections.forEach((section) => section.showAppSettings(appSettings));
      setSettingsStatus("Settings saved.", "success");
      options.onAppSettingsSaved?.();
      if (exitAfterSave || elements.backButton.hidden) {
        options.onSaved?.(settings);
      }

      return true;
    } catch (error) {
      setSettingsStatus(toUserMessage(error), "error");

      return false;
    }
  }

  function handleAction(action: string | null): void {
    if (action === "start-ambient") {
      options.onStartAmbient?.(ambient.current());
      return;
    }

    if (action === "choose-ambient-album") {
      options.onChooseAmbientAlbum?.(ambient.current().album);
      return;
    }

    if (action === "test-connection") {
      void connection.testConnection();
      return;
    }

    if (action === "save-settings") {
      if (saveSettings(false)) {
        savedSnapshot = readSettingsSnapshot();
        updateDirtyStatus();
      }

      return;
    }

    if (action === "back-to-albums") {
      handleSettingsExit();
      return;
    }

    if (action === "save-and-exit") {
      if (saveSettings(true)) {
        savedSnapshot = readSettingsSnapshot();
      }

      return;
    }

    if (action === "discard-and-exit") {
      connection.disableTextEntry();
      options.onBack?.({ bypassGuard: true });
      return;
    }

    if (action === "cancel-exit") {
      hideSettingsPanels();
      activeSection.button.focus();
      setSettingsStatus("Exit cancelled.");
      return;
    }

    if (action === "toggle-api-key") {
      connection.toggleApiKeyVisibility();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    const keyCode = getKeyCode(event);
    const activeElement = documentRef.activeElement;
    const openDropdown = dropdowns.filter((dropdown) => dropdown.isOpen())[0];

    // An open list takes every key, Back included, until it closes.
    if (openDropdown) {
      event.preventDefault();
      openDropdown.handleKey(keyCode);
      updateDirtyStatus();
      return;
    }

    const focusedDropdown = dropdowns.filter((dropdown) => dropdown.control === activeElement)[0];

    if (focusedDropdown && keyCode === remoteKeys.enter) {
      event.preventDefault();
      focusedDropdown.open();
      return;
    }

    if (keyCode === remoteKeys.back) {
      event.preventDefault();
      if (!elements.settingsPanelUnsaved.hidden) {
        hideSettingsPanels();
        activeSection.button.focus();
        setSettingsStatus("Exit cancelled.");
        return;
      }

      if (options.onBack && !elements.backButton.hidden) {
        handleSettingsExit();
        return;
      }

      setSettingsStatus("Connection setup is the first screen.");
      return;
    }

    if (isSettingsRailButton(activeElement)) {
      handleSettingsRailKeydown(event, keyCode, activeElement);
      return;
    }

    if (isInputElement(activeElement)) {
      if (isTextSettingsInput(activeElement) && keyCode === remoteKeys.enter) {
        event.preventDefault();
        connection.enableTextEntry(activeElement);
      } else if (isCheckboxInput(activeElement) && keyCode === remoteKeys.enter) {
        event.preventDefault();
        activeElement.checked = !activeElement.checked;
      } else if (keyCode === remoteKeys.left) {
        event.preventDefault();
        connection.disableTextEntry();
        hideSettingsPanels();
        activeSection.button.focus();
      } else if (keyCode === remoteKeys.up) {
        event.preventDefault();
        connection.disableTextEntry();
        focusSettingsPanelByOffset(activeElement, -1);
      } else if (keyCode === remoteKeys.down) {
        event.preventDefault();
        connection.disableTextEntry();
        focusSettingsPanelByOffset(activeElement, 1);
      }

      updateDirtyStatus();
      return;
    }

    switch (keyCode) {
      case remoteKeys.left:
        event.preventDefault();
        hideSettingsPanels();
        activeSection.button.focus();
        break;
      case remoteKeys.up:
        event.preventDefault();
        if (!focusSettingsPanelByOffset(activeElement, -1)) {
          navigator.focusByOffset(-1);
        }
        break;
      case remoteKeys.right:
      case remoteKeys.down:
        event.preventDefault();
        if (!focusSettingsPanelByOffset(activeElement, 1)) {
          navigator.focusByOffset(1);
        }
        break;
      case remoteKeys.enter:
        event.preventDefault();
        suppressNextActionClick = true;
        handleAction(activeElement ? activeElement.getAttribute("data-action") : null);
        break;
      default:
        break;
    }
  }

  function handleSettingsRailKeydown(
    event: KeyboardEvent,
    keyCode: number,
    activeElement: HTMLButtonElement
  ): void {
    if (keyCode === remoteKeys.up || keyCode === remoteKeys.down) {
      event.preventDefault();
      const nextButton = focusSettingsRailByOffset(
        activeElement,
        keyCode === remoteKeys.up ? -1 : 1
      );
      const nextSection = nextButton ? readSettingsSection(nextButton) : null;

      if (nextSection) {
        activeSection = nextSection;
      }

      hideSettingsPanels();
      return;
    }

    if (keyCode === remoteKeys.left && options.onReturnToShell) {
      event.preventDefault();
      hideSettingsPanels();
      options.onReturnToShell();
      return;
    }

    if (keyCode === remoteKeys.right || keyCode === remoteKeys.enter) {
      event.preventDefault();
      const section = readSettingsSection(activeElement);

      if (section) {
        activeSection = section;
        showSettingsSection(section);
        section.firstControl().focus();
        return;
      }

      if (keyCode === remoteKeys.enter) {
        suppressNextActionClick = true;
        handleAction(activeElement.getAttribute("data-action"));
      }
    }
  }

  function readSettingsSection(element: HTMLElement): SettingsSection | null {
    const id = element.getAttribute("data-settings-section") as SettingsSectionId | null;

    return sections.filter((section) => section.id === id)[0] || null;
  }

  function focusSettingsRailByOffset(
    activeElement: HTMLButtonElement,
    offset: number
  ): HTMLButtonElement | null {
    const buttons = Array.prototype.slice
      .call(elements.root.querySelectorAll(".settings-nav .focusable:not([hidden])"))
      .filter(isVisibleElement) as HTMLButtonElement[];
    const currentIndex = buttons.indexOf(activeElement);
    const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + offset));
    const nextButton = buttons[nextIndex];

    if (nextButton) {
      nextButton.focus();
      return nextButton;
    }

    return null;
  }

  function showSettingsSection(shown: SettingsSection): void {
    sections.forEach((section) => {
      section.panel.hidden = section !== shown;
      section.button.setAttribute("aria-selected", section === shown ? "true" : "false");
    });
    elements.settingsPanelUnsaved.hidden = true;
  }

  function hideSettingsPanels(): void {
    dropdowns.forEach((dropdown) => dropdown.close());
    sections.forEach((section) => {
      section.panel.hidden = true;
      section.button.setAttribute("aria-selected", "false");
    });
    elements.settingsPanelUnsaved.hidden = true;
  }

  function focusSettingsPanelByOffset(activeElement: Element | null, offset: number): boolean {
    const panel = readOpenSettingsPanel();

    if (!panel || !(activeElement instanceof HTMLElement) || !panel.contains(activeElement)) {
      return false;
    }

    const controls = Array.prototype.slice
      .call(panel.querySelectorAll(".focusable:not([hidden])"))
      .filter(isVisibleElement) as HTMLElement[];

    if (controls.length === 0) {
      return false;
    }

    const currentIndex = controls.indexOf(activeElement);
    const baseIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (baseIndex + offset + controls.length) % controls.length;
    const nextControl = controls[nextIndex];

    if (nextControl) {
      nextControl.focus();
    }

    return true;
  }

  function readOpenSettingsPanel(): HTMLElement | null {
    if (!elements.settingsPanelUnsaved.hidden) {
      return elements.settingsPanelUnsaved;
    }

    return activeSection.panel.hidden ? null : activeSection.panel;
  }

  function handleSettingsExit(): void {
    if (requestSettingsExit()) {
      options.onBack?.();
    }
  }

  function requestSettingsExit(): boolean {
    if (!hasUnsavedSettings()) {
      return true;
    }

    hideSettingsPanels();
    elements.settingsPanelUnsaved.hidden = false;
    elements.settingsPanelUnsaved.setAttribute("data-return-section", activeSection.id);
    setSettingsStatus("Unsaved changes.");
    elements.settingsPanelUnsaved.querySelector<HTMLButtonElement>(".focusable")?.focus();

    return false;
  }

  function readSettingsSnapshot(): string {
    const snapshot: Record<string, unknown> = {};

    sections.forEach((section) => {
      snapshot[section.id] = section.snapshot();
    });

    return JSON.stringify(snapshot);
  }

  function hasUnsavedSettings(): boolean {
    return readSettingsSnapshot() !== savedSnapshot;
  }

  function updateDirtyStatus(): void {
    const hasChanges = hasUnsavedSettings();

    // Element.toggleAttribute needs Chrome 69; Tizen 5.0 runs Chromium 63.
    if (hasChanges) {
      elements.settingsSaveButton.setAttribute("data-dirty", "");
    } else {
      elements.settingsSaveButton.removeAttribute("data-dirty");
    }
    elements.settingsSaveLabel.textContent = hasChanges ? "Save *" : "Save";
  }
}

function readElements(documentRef: Document): SettingsScreenElements {
  return {
    backButton: requireElement<HTMLButtonElement>(documentRef, "connection-back"),
    form: requireElement<HTMLFormElement>(documentRef, "connection-form"),
    root: requireElement(documentRef, "connection-screen"),
    settingsPanelUnsaved: requireElement(documentRef, "settings-panel-unsaved"),
    settingsSaveButton: requireElement<HTMLButtonElement>(documentRef, "settings-save"),
    settingsSaveLabel: requireElement(documentRef, "settings-save-label"),
    summary: requireElement(documentRef, "settings-summary")
  };
}

function isCheckboxInput(element: Element | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === "checkbox";
}

function isTextSettingsInput(element: Element | null): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    (element.type === "text" || element.type === "url" || element.type === "password")
  );
}

function isVisibleElement(element: HTMLElement): boolean {
  return !element.closest("[hidden]");
}

function isSettingsRailButton(element: Element | null): element is HTMLButtonElement {
  return (
    element instanceof HTMLButtonElement && element.classList.contains("settings-section-button")
  );
}

function findActionElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const actionElement = target.closest("[data-action]");

  return actionElement instanceof HTMLElement ? actionElement : null;
}
