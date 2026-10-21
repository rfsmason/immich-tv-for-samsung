import { AppError } from "../errors/app-error";
import type { ConnectionSettings } from "../domain/connection";

export function normalizeServerUrl(value: string): string {
  let normalized = value.trim().replace(/\/+$/g, "");

  if (/\/api$/i.test(normalized)) {
    normalized = normalized.slice(0, -4);
  }

  return normalized;
}

export function normalizeConnectionSettings(settings: ConnectionSettings): ConnectionSettings {
  return {
    apiKey: settings.apiKey.trim(),
    serverUrl: normalizeServerUrl(settings.serverUrl)
  };
}

export function validateConnectionSettings(settings: ConnectionSettings): ConnectionSettings {
  const normalized = normalizeConnectionSettings(settings);

  if (!normalized.serverUrl) {
    throw new AppError("invalid-config", "Server URL is required.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized.serverUrl);
  } catch {
    throw new AppError("invalid-config", "Server URL must be a valid http:// or https:// URL.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("invalid-config", "Server URL must start with http:// or https://.");
  }

  if (!normalized.apiKey) {
    throw new AppError("invalid-config", "API key is required.");
  }

  return normalized;
}

export function buildImmichApiUrl(serverUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizeServerUrl(serverUrl)}/api${normalizedPath}`;
}
