export type AsyncGenerationState = {
  loadGeneration: number;
};

export function beginAsyncGeneration(state: AsyncGenerationState): number {
  state.loadGeneration += 1;

  return state.loadGeneration;
}

export function invalidateAsyncGeneration(state: AsyncGenerationState): void {
  state.loadGeneration += 1;
}

export function isCurrentGeneration(state: AsyncGenerationState, generation: number): boolean {
  return state.loadGeneration === generation;
}

export function revokeIfStale(
  state: AsyncGenerationState,
  generation: number,
  objectUrl: string | null,
  revokeObjectUrl: (objectUrl: string) => void
): boolean {
  if (isCurrentGeneration(state, generation)) {
    return false;
  }

  if (objectUrl) {
    revokeObjectUrl(objectUrl);
  }

  return true;
}
