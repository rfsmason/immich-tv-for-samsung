import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../logging/logger";
import {
  createLocalConnectionSettingsStore,
  type KeyValueStorage
} from "../storage/connection-settings-store";
import { applyInstallPreset, readInstallPreset } from "./install-preset";

function createMemoryStorage(): KeyValueStorage & { values: Record<string, string> } {
  return {
    values: {},
    getItem(key) {
      return this.values[key] || null;
    },
    setItem(key, value) {
      this.values[key] = value;
    }
  };
}

function createLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];

  return {
    error: vi.fn(),
    info: (message: string) => lines.push(message),
    lines,
    warn: (message: string) => lines.push(message)
  };
}

const preset = { apiKey: " preset-key ", serverUrl: "https://photos.example.test/api/" };

function setup() {
  const storage = createMemoryStorage();
  const connections = createLocalConnectionSettingsStore(storage);
  const logger = createLogger();
  const apply = (value: unknown) =>
    applyInstallPreset({ connections, logger, preset: value, storage });

  return { apply, connections, logger };
}

describe("readInstallPreset", () => {
  it("treats a missing or empty preset as none", () => {
    expect(readInstallPreset(undefined)).toBeNull();
    expect(readInstallPreset(null)).toBeNull();
    expect(readInstallPreset({ apiKey: "", serverUrl: " " })).toBeNull();
  });

  it("normalises a complete preset", () => {
    expect(readInstallPreset(preset)).toEqual({
      apiKey: "preset-key",
      serverUrl: "https://photos.example.test"
    });
  });

  it("rejects incomplete, malformed or non-http presets", () => {
    expect(readInstallPreset({ apiKey: "", serverUrl: "https://photos.example.test" })).toBe(
      "invalid"
    );
    expect(readInstallPreset({ apiKey: "key", serverUrl: "" })).toBe("invalid");
    expect(readInstallPreset({ apiKey: "key", serverUrl: "ftp://photos.example.test" })).toBe(
      "invalid"
    );
    expect(readInstallPreset({ apiKey: 1, serverUrl: "https://photos.example.test" })).toBe(
      "invalid"
    );
  });
});

describe("applyInstallPreset", () => {
  it("saves a new preset as the connection", () => {
    const { apply, connections } = setup();

    expect(apply(preset)).toBe("applied");
    expect(connections.load()).toEqual({
      apiKey: "preset-key",
      serverUrl: "https://photos.example.test"
    });
  });

  it("leaves a connection changed on the TV alone while the preset is unchanged", () => {
    const { apply, connections } = setup();

    apply(preset);
    connections.save({ apiKey: "changed-on-tv", serverUrl: "http://192.0.2.10:2283" });

    expect(apply(preset)).toBe("already-applied");
    expect(connections.load()?.apiKey).toBe("changed-on-tv");
  });

  it("applies the preset again once the installer's details change", () => {
    const { apply, connections } = setup();

    apply(preset);
    connections.save({ apiKey: "changed-on-tv", serverUrl: "http://192.0.2.10:2283" });

    expect(apply({ ...preset, apiKey: "new-key" })).toBe("applied");
    expect(connections.load()?.apiKey).toBe("new-key");
  });

  it("keeps the saved connection when there is no preset or it is invalid", () => {
    const { apply, connections } = setup();
    const saved = { apiKey: "saved-key", serverUrl: "https://saved.example.test" };

    connections.save(saved);

    expect(apply({ apiKey: "", serverUrl: "" })).toBe("none");
    expect(apply({ apiKey: "", serverUrl: "https://photos.example.test" })).toBe("invalid");
    expect(connections.load()).toEqual(saved);
  });

  it("never logs the server address or key", () => {
    const { apply, logger } = setup();

    apply(preset);
    apply({ apiKey: "secret-key", serverUrl: "nonsense" });

    expect(logger.lines).toHaveLength(2);
    expect(logger.lines.join(" ")).not.toMatch(/preset-key|secret-key|photos\.example|nonsense/);
  });
});
