import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/app-error";
import { consoleLogger, sanitize } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("serialises Error name, message, bounded stack and nested causes", () => {
    const root = new TypeError("Failed to fetch");
    const error = new AppError("network", "Unable to reach Immich.", { cause: root, status: 0 });
    const output = sanitize({ error }) as { error: Record<string, unknown> };

    expect(output.error).toMatchObject({
      kind: "network",
      message: "Unable to reach Immich.",
      name: "AppError",
      status: 0,
      cause: { message: "Failed to fetch", name: "TypeError" }
    });
    expect(String(output.error.stack).split("\n").length).toBeLessThanOrEqual(12);
  });

  it("keeps a permission error's feature and truncates long cause chains", () => {
    let error: Error = new Error("root");
    for (let index = 0; index < 10; index += 1) {
      error = new AppError("api", `layer ${index}`, { cause: error });
    }
    const permission = new AppError("permission", "Refused.", {
      cause: error,
      feature: "People",
      status: 403
    });

    expect(JSON.stringify(sanitize(permission))).toContain("[cause chain truncated]");
    expect(sanitize(permission)).toMatchObject({
      feature: "People",
      kind: "permission",
      status: 403
    });
  });

  it("redacts credential keys and credential query values, including inside errors", () => {
    const output = JSON.stringify(
      sanitize({
        apiKey: "secret-key",
        headers: { "x-api-key": "secret-key", Authorization: "Bearer secret-token" },
        url: "https://immich.example/api/assets/1/video/playback?apiKey=secret-key&c=1",
        error: new Error("GET https://immich.example/api?apiKey=secret-key failed")
      })
    );

    expect(output).not.toContain("secret-key");
    expect(output).not.toContain("secret-token");
    expect(output).toContain("apiKey=[redacted]");
  });

  it("bounds deeply nested or circular details", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    expect(() => JSON.stringify(sanitize(circular))).not.toThrow();
  });

  it("logs a startup failure with useful detail and no credentials", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("Missing required element: album-detail-screen");

    consoleLogger.error("Immich TV startup failed.", {
      error: failure,
      settings: { apiKey: "secret-key", serverUrl: "https://immich.example" }
    });

    const [message, details] = consoleError.mock.calls[0]!;
    expect(message).toBe("Immich TV startup failed.");
    expect(details).toMatchObject({
      error: { message: "Missing required element: album-detail-screen", name: "Error" },
      settings: { apiKey: "[redacted]", serverUrl: "https://immich.example" }
    });
    expect((details as { error: { stack?: string } }).error.stack).toContain(
      "Missing required element"
    );
    expect(JSON.stringify(details)).not.toContain("secret-key");
  });
});
