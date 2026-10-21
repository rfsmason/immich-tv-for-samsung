export type GridDirection = "down" | "left" | "right" | "up";

export type GridNavigationInput = {
  columnCount: number;
  currentIndex: number;
  direction: GridDirection;
  itemCount: number;
  preferredColumn?: number;
};

export type GridNavigationResult = {
  index: number;
  preferredColumn: number;
};

export function getNextGridIndex(input: GridNavigationInput): GridNavigationResult {
  if (input.itemCount <= 0 || input.columnCount <= 0) {
    return {
      index: -1,
      preferredColumn: 0
    };
  }

  const currentIndex = clamp(input.currentIndex, 0, input.itemCount - 1);
  const currentColumn = currentIndex % input.columnCount;
  const preferredColumn =
    input.preferredColumn === undefined ? currentColumn : input.preferredColumn;

  if (input.direction === "left") {
    const index = Math.max(currentIndex - 1, currentIndex - currentColumn);

    return {
      index,
      preferredColumn: index % input.columnCount
    };
  }

  if (input.direction === "right") {
    const rowEnd = Math.min(
      currentIndex - currentColumn + input.columnCount - 1,
      input.itemCount - 1
    );
    const index = Math.min(currentIndex + 1, rowEnd);

    return {
      index,
      preferredColumn: index % input.columnCount
    };
  }

  const currentRow = Math.floor(currentIndex / input.columnCount);
  const nextRow = input.direction === "up" ? currentRow - 1 : currentRow + 1;
  const rowStart = nextRow * input.columnCount;

  if (nextRow < 0 || rowStart >= input.itemCount) {
    return {
      index: currentIndex,
      preferredColumn
    };
  }

  return {
    index: Math.min(rowStart + preferredColumn, input.itemCount - 1),
    preferredColumn
  };
}

export function isGridRowEnd(input: {
  columnCount: number;
  currentIndex: number;
  itemCount: number;
}): boolean {
  if (input.itemCount <= 0 || input.columnCount <= 0) {
    return false;
  }

  const currentIndex = clamp(input.currentIndex, 0, input.itemCount - 1);
  const currentColumn = currentIndex % input.columnCount;
  const rowEnd = Math.min(
    currentIndex - currentColumn + input.columnCount - 1,
    input.itemCount - 1
  );

  return currentIndex === rowEnd;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
