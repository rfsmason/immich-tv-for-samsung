import { describe, expect, it, vi } from "vitest";
import { isSupportedServerVersion } from "../api/immich/version";
import type { ConnectionSettings } from "../domain/connection";
import { AppError } from "../errors/app-error";
import { silentLogger } from "../logging/logger";
import { createConnectionService } from "./connection-service";

const settings: ConnectionSettings = {
  apiKey: "secret-key",
  serverUrl: "http://immich.local:2283/"
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function setup(version: { major: number; minor: number; patch: number }) {
  let stored: ConnectionSettings | null = null;
  const store = {
    load: vi.fn(() => stored),
    save: vi.fn((next: ConnectionSettings) => {
      stored = next;
    })
  };
  const fetchImpl = vi.fn(async (url: string) =>
    url.endsWith("/server/version")
      ? jsonResponse(version)
      : jsonResponse({ email: "rob@example.com", id: "user-1", name: "Rob" })
  );
  const service = createConnectionService({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    logger: silentLogger,
    store
  });

  return { fetchImpl, service, store };
}

describe("connection service", () => {
  it("tests a supported server without a warning and without saving", async () => {
    const { fetchImpl, service, store } = setup({ major: 3, minor: 3, patch: 3 });

    await expect(service.test(settings)).resolves.toEqual({
      serverLabel: "Immich 3.3.3",
      userLabel: "Rob",
      versionWarning: null
    });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "http://immich.local:2283/api/server/version",
      "http://immich.local:2283/api/users/me"
    ]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("warns, in household terms, about a server older than Immich 3.2.0", async () => {
    const { service } = setup({ major: 3, minor: 1, patch: 9 });

    const result = await service.test(settings);

    expect(result.serverLabel).toBe("Immich 3.1.9");
    expect(result.versionWarning).toBe(
      "This server needs updating to Immich 3.2.0 or later, so some screens may not load. You can still save these settings."
    );
  });

  it("still saves settings for an older server", async () => {
    const { service, store } = setup({ major: 2, minor: 9, patch: 0 });

    await service.test(settings);

    expect(service.save(settings)).toEqual({
      apiKey: "secret-key",
      serverUrl: "http://immich.local:2283"
    });
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(service.load()).toEqual({ apiKey: "secret-key", serverUrl: "http://immich.local:2283" });
  });

  it("rejects invalid settings before any request", async () => {
    const { fetchImpl, service, store } = setup({ major: 3, minor: 3, patch: 0 });

    await expect(service.test({ apiKey: "", serverUrl: "http://immich.local" })).rejects.toThrow(
      AppError
    );
    expect(() => service.save({ apiKey: "key", serverUrl: "ftp://immich.local" })).toThrow(
      "Server URL must start with http:// or https://."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("reports an authentication failure from the user request", async () => {
    const { fetchImpl, service } = setup({ major: 3, minor: 3, patch: 0 });
    fetchImpl.mockImplementation(async (url: string) =>
      url.endsWith("/server/version")
        ? jsonResponse({ major: 3, minor: 3, patch: 0 })
        : jsonResponse({ message: "Invalid API key" }, { status: 401 })
    );

    await expect(service.test(settings)).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("minimum Immich version", () => {
  it.each([
    [{ major: 3, minor: 2, patch: 0 }, true],
    [{ major: 3, minor: 2, patch: 0, prerelease: "rc.1" }, true],
    [{ major: 3, minor: 10, patch: 0 }, true],
    [{ major: 4, minor: 0, patch: 0 }, true],
    [{ major: 3, minor: 1, patch: 99 }, false],
    [{ major: 2, minor: 9, patch: 9 }, false]
  ])("treats %j as supported: %s", (version, supported) => {
    expect(isSupportedServerVersion(version)).toBe(supported);
  });
});
