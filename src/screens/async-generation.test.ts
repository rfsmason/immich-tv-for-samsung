import { describe, expect, it, vi } from "vitest";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration,
  revokeIfStale,
  type AsyncGenerationState
} from "./async-generation";

describe("async generation lifecycle", () => {
  it("marks an older album request stale after a newer refresh begins", () => {
    const state: AsyncGenerationState = { loadGeneration: 0 };
    const olderGeneration = beginAsyncGeneration(state);
    const newerGeneration = beginAsyncGeneration(state);

    expect(isCurrentGeneration(state, olderGeneration)).toBe(false);
    expect(isCurrentGeneration(state, newerGeneration)).toBe(true);
  });

  it("marks thumbnail requests stale after refresh invalidates the generation", () => {
    const state: AsyncGenerationState = { loadGeneration: 0 };
    const thumbnailGeneration = beginAsyncGeneration(state);

    invalidateAsyncGeneration(state);

    expect(isCurrentGeneration(state, thumbnailGeneration)).toBe(false);
  });

  it("revokes stale thumbnail object URLs instead of allowing them to be retained", () => {
    const state: AsyncGenerationState = { loadGeneration: 0 };
    const thumbnailGeneration = beginAsyncGeneration(state);
    const revokeObjectUrl = vi.fn();

    beginAsyncGeneration(state);

    expect(revokeIfStale(state, thumbnailGeneration, "blob:old-thumbnail", revokeObjectUrl)).toBe(
      true
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:old-thumbnail");
  });

  it("does not revoke current-generation thumbnail object URLs", () => {
    const state: AsyncGenerationState = { loadGeneration: 0 };
    const thumbnailGeneration = beginAsyncGeneration(state);
    const revokeObjectUrl = vi.fn();

    expect(
      revokeIfStale(state, thumbnailGeneration, "blob:current-thumbnail", revokeObjectUrl)
    ).toBe(false);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });
});
