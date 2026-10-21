import { describe, expect, it } from "vitest";
import { AppError } from "../errors/app-error";
import {
  buildImmichApiUrl,
  normalizeConnectionSettings,
  normalizeServerUrl,
  validateConnectionSettings
} from "./url";

describe("Immich URL utilities", () => {
  it("trims whitespace, trailing slashes, and a trailing /api suffix", () => {
    expect(normalizeServerUrl("  http://192.168.1.20:2283/api///  ")).toBe(
      "http://192.168.1.20:2283"
    );
  });

  it("normalizes both server URL and API key values", () => {
    expect(
      normalizeConnectionSettings({
        apiKey: "  key ",
        serverUrl: " http://immich.local:2283/api "
      })
    ).toEqual({
      apiKey: "key",
      serverUrl: "http://immich.local:2283"
    });
  });

  it("rejects missing API keys", () => {
    expect(() =>
      validateConnectionSettings({
        apiKey: " ",
        serverUrl: "http://immich.local:2283"
      })
    ).toThrow(AppError);
  });

  it("rejects unsupported protocols", () => {
    expect(() =>
      validateConnectionSettings({
        apiKey: "secret",
        serverUrl: "ftp://immich.local"
      })
    ).toThrow("Server URL must start with http:// or https://.");
  });

  it("builds current Immich API paths without duplicating /api", () => {
    expect(buildImmichApiUrl("http://immich.local:2283/api", "/server/version")).toBe(
      "http://immich.local:2283/api/server/version"
    );
  });
});
