import { describe, expect, it } from "vitest";
import { AppError, toUserMessage } from "./app-error";

describe("household error messages", () => {
  it("never shows Immich's own wording for a server-side failure", () => {
    const error = new AppError("api", "Not found or no asset.read access", { status: 400 });

    expect(toUserMessage(error)).toBe("Immich couldn't complete this request.");
    expect(error.message).toBe("Not found or no asset.read access");
  });

  it("keeps app-written API messages, which are already household-facing", () => {
    const error = new AppError(
      "api",
      "This Memory is no longer available. Go Back to refresh Memories."
    );

    expect(toUserMessage(error)).toBe(
      "This Memory is no longer available. Go Back to refresh Memories."
    );
  });
});
