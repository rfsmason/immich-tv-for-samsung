import type { ConnectionService } from "../../app/connection-service";
import type { ConnectionSettings } from "../../domain/connection";
import { toUserMessage } from "../../errors/app-error";
import { validateConnectionSettings } from "../../utils/url";
import { requireElement, type SettingsSection } from "./settings-section";

// Settings > Connection: the server URL and API key, testing them, and text
// entry, which stays off until OK so the TV keyboard only opens on request.
export type ConnectionSection = SettingsSection & {
  disableTextEntry(): void;
  enableTextEntry(input: HTMLInputElement): void;
  // Loads the stored connection into the form.
  loadConnection(): void;
  readConnection(): ConnectionSettings;
  // Shows a saved connection, whose server URL may have been normalised.
  showSavedConnection(settings: ConnectionSettings): void;
  testConnection(): Promise<void>;
  toggleApiKeyVisibility(): void;
};

export function createConnectionSection(
  documentRef: Document,
  service: ConnectionService
): ConnectionSection {
  const apiKeyInput = requireElement<HTMLInputElement>(documentRef, "api-key");
  const apiKeyVisibilityButton = requireElement<HTMLButtonElement>(
    documentRef,
    "api-key-visibility"
  );
  const serverUrlInput = requireElement<HTMLInputElement>(documentRef, "server-url");
  const status = requireElement(documentRef, "connection-status");

  // Connection results (testing, the API key, text entry) show in the
  // Connection section, the only place they apply.
  function setStatus(message: string, state = "idle"): void {
    status.textContent = message;
    status.setAttribute("data-state", state);
  }

  function readConnection(): ConnectionSettings {
    return {
      apiKey: apiKeyInput.value,
      serverUrl: serverUrlInput.value
    };
  }

  function readValidConnection(): ConnectionSettings | null {
    try {
      const settings = validateConnectionSettings(readConnection());

      serverUrlInput.value = settings.serverUrl;

      return settings;
    } catch (error) {
      setStatus(toUserMessage(error), "error");

      return null;
    }
  }

  return {
    button: requireElement<HTMLButtonElement>(documentRef, "settings-section-connection"),
    id: "connection",
    panel: requireElement(documentRef, "settings-panel-connection"),
    disableTextEntry() {
      [serverUrlInput, apiKeyInput].forEach((input) => {
        input.readOnly = true;
        input.setAttribute("inputmode", "none");
        input.removeAttribute("data-editing");
      });
      documentRef.documentElement.classList.remove("settings-text-entry-active");
      documentRef.body.classList.remove("settings-text-entry-active");
    },
    enableTextEntry(input) {
      input.readOnly = false;
      input.setAttribute("inputmode", input === serverUrlInput ? "url" : "text");
      input.setAttribute("data-editing", "true");
      documentRef.documentElement.classList.add("settings-text-entry-active");
      documentRef.body.classList.add("settings-text-entry-active");
      setStatus("Text entry enabled.");
    },
    firstControl: () => serverUrlInput,
    loadConnection() {
      const settings = service.load();

      serverUrlInput.value = "";
      apiKeyInput.value = "";
      setStatus("Enter an Immich server URL and API key.");

      if (!settings) {
        return;
      }

      serverUrlInput.value = settings.serverUrl;
      apiKeyInput.value = settings.apiKey;
      setStatus("Connection settings loaded.", "success");
    },
    readAppSettings: () => ({}),
    readConnection,
    showAppSettings() {
      // Connection settings are not app settings.
    },
    showSavedConnection(settings) {
      serverUrlInput.value = settings.serverUrl;
    },
    snapshot() {
      return { apiKey: apiKeyInput.value, serverUrl: serverUrlInput.value };
    },
    async testConnection() {
      const settings = readValidConnection();

      if (!settings) {
        return;
      }

      setStatus("Checking Immich server...", "pending");

      try {
        const result = await service.test(settings);
        const found = `${result.serverLabel} found. Connected as ${result.userLabel}.`;

        if (result.versionWarning) {
          setStatus(`${found} ${result.versionWarning}`, "warning");
        } else {
          setStatus(found, "success");
        }
      } catch (error) {
        setStatus(toUserMessage(error), "error");
      }
    },
    toggleApiKeyVisibility() {
      const isVisible = apiKeyInput.type === "text";

      apiKeyInput.type = isVisible ? "password" : "text";
      apiKeyVisibilityButton.textContent = isVisible ? "Show" : "Hide";
      apiKeyVisibilityButton.setAttribute("aria-pressed", isVisible ? "false" : "true");
      setStatus(isVisible ? "API key hidden." : "API key visible on screen.");
    }
  };
}
