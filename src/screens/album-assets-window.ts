// Rows every grid keeps either side of the focused row. Remote focus can sit
// on the top or bottom visible row, and about 3.7 rows of Home-sized tiles
// (236px plus a 22px gap) fit in the 950px grid area at 1920x1080, so four
// rows each side keep every row on screen rendered. Thumbnails stay loaded
// one row further out, so a row arriving on screen already has its images.
export const gridRenderRows = { after: 4, before: 4 };
export const gridThumbnailRows = { after: 5, before: 5 };

export type AssetIndexWindow = {
  endIndex: number;
  startIndex: number;
};

export type RenderedAssetWindow = AssetIndexWindow & {
  bottomSpacerRows: number;
  bottomSpacerHeadingRows?: number;
  endRow: number;
  startRow: number;
  topSpacerRows: number;
  topSpacerHeadingRows?: number;
  totalRows: number;
};

export type AssetWindowInput = {
  columnCount: number;
  focusedIndex: number;
  itemCount: number;
  rowsAfter: number;
  rowsBefore: number;
};

export type DateSectionAssetWindowInput = AssetWindowInput & {
  getSectionKey(index: number): string;
};

export function calculateRenderedAssetWindow(input: AssetWindowInput): RenderedAssetWindow {
  if (input.itemCount <= 0 || input.columnCount <= 0) {
    return {
      bottomSpacerRows: 0,
      endIndex: 0,
      endRow: 0,
      startIndex: 0,
      startRow: 0,
      topSpacerRows: 0,
      totalRows: 0
    };
  }

  const totalRows = Math.ceil(input.itemCount / input.columnCount);
  const focusedIndex = clamp(input.focusedIndex, 0, input.itemCount - 1);
  const focusedRow = Math.floor(focusedIndex / input.columnCount);
  const startRow = clamp(focusedRow - input.rowsBefore, 0, totalRows - 1);
  const endRow = clamp(focusedRow + input.rowsAfter + 1, startRow + 1, totalRows);
  const startIndex = startRow * input.columnCount;
  const endIndex = Math.min(endRow * input.columnCount, input.itemCount);

  return {
    bottomSpacerRows: Math.max(0, totalRows - endRow),
    endIndex,
    endRow,
    startIndex,
    startRow,
    topSpacerRows: startRow,
    totalRows
  };
}

export function calculateRenderedDateSectionAssetWindow(
  input: DateSectionAssetWindowInput
): RenderedAssetWindow {
  if (input.itemCount <= 0 || input.columnCount <= 0) {
    return {
      bottomSpacerHeadingRows: 0,
      bottomSpacerRows: 0,
      endIndex: 0,
      endRow: 0,
      startIndex: 0,
      startRow: 0,
      topSpacerHeadingRows: 0,
      topSpacerRows: 0,
      totalRows: 0
    };
  }

  const rows = buildDateSectionRows(input);
  const focusedIndex = clamp(input.focusedIndex, 0, input.itemCount - 1);
  const focusedRow = findRowIndexForAsset(rows, focusedIndex);
  const rawStartRow = clamp(focusedRow - input.rowsBefore, 0, rows.length - 1);
  const startRow = includeSectionHeadingAtWindowStart(rows, rawStartRow);
  const rawEndRow = clamp(focusedRow + input.rowsAfter + 1, startRow + 1, rows.length);
  const endRow = includeFirstAssetAfterWindowEndHeading(rows, rawEndRow);
  const visibleRows = rows.slice(startRow, endRow);
  const startIndex = readFirstAssetIndex(visibleRows);
  const endIndex = readEndAssetIndex(visibleRows, startIndex);
  const topSpacerRows = countAssetRows(rows, 0, startRow);
  const bottomSpacerRows = countAssetRows(rows, endRow, rows.length);
  const topSpacerHeadingRows = countHeadingRows(rows, 0, startRow);
  const bottomSpacerHeadingRows = countHeadingRows(rows, endRow, rows.length);

  return {
    bottomSpacerHeadingRows,
    bottomSpacerRows,
    endIndex,
    endRow,
    startIndex,
    startRow,
    topSpacerHeadingRows,
    topSpacerRows,
    totalRows: rows.length
  };
}

function includeFirstAssetAfterWindowEndHeading(
  rows: DateSectionVisualRow[],
  endRow: number
): number {
  const finalVisibleRow = rows[endRow - 1];
  const nextRow = endRow < rows.length ? rows[endRow] : undefined;

  if (finalVisibleRow?.kind === "heading" && nextRow?.kind === "assets") {
    return endRow + 1;
  }

  return endRow;
}

function includeSectionHeadingAtWindowStart(
  rows: DateSectionVisualRow[],
  rowIndex: number
): number {
  const row = rows[rowIndex];
  const previous = rowIndex > 0 ? rows[rowIndex - 1] : undefined;

  if (
    row?.kind === "assets" &&
    previous?.kind === "heading" &&
    previous.sectionStartIndex === row.startIndex
  ) {
    return rowIndex - 1;
  }

  return rowIndex;
}

export function calculateThumbnailRetentionWindow(input: AssetWindowInput): AssetIndexWindow {
  const window = calculateRenderedAssetWindow(input);

  return {
    endIndex: window.endIndex,
    startIndex: window.startIndex
  };
}

export function canApplyAlbumDetail(
  loadGeneration: number,
  resultGeneration: number,
  hidden: boolean
): boolean {
  return loadGeneration === resultGeneration && !hidden;
}

type DateSectionVisualRow =
  | {
      kind: "heading";
      sectionStartIndex: number;
    }
  | {
      endIndex: number;
      kind: "assets";
      startIndex: number;
    };

function buildDateSectionRows(input: DateSectionAssetWindowInput): DateSectionVisualRow[] {
  const rows: DateSectionVisualRow[] = [];
  let sectionStart = 0;

  while (sectionStart < input.itemCount) {
    const sectionKey = input.getSectionKey(sectionStart);
    let sectionEnd = sectionStart + 1;

    while (sectionEnd < input.itemCount && input.getSectionKey(sectionEnd) === sectionKey) {
      sectionEnd += 1;
    }

    rows.push({
      kind: "heading",
      sectionStartIndex: sectionStart
    });

    for (let rowStart = sectionStart; rowStart < sectionEnd; rowStart += input.columnCount) {
      rows.push({
        endIndex: Math.min(rowStart + input.columnCount, sectionEnd),
        kind: "assets",
        startIndex: rowStart
      });
    }

    sectionStart = sectionEnd;
  }

  return rows;
}

function findRowIndexForAsset(rows: DateSectionVisualRow[], assetIndex: number): number {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (row?.kind === "assets" && assetIndex >= row.startIndex && assetIndex < row.endIndex) {
      return rowIndex;
    }
  }

  return 0;
}

function readFirstAssetIndex(rows: DateSectionVisualRow[]): number {
  for (const row of rows) {
    if (row.kind === "assets") {
      return row.startIndex;
    }
  }

  return 0;
}

function readEndAssetIndex(rows: DateSectionVisualRow[], fallbackStartIndex: number): number {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];

    if (row?.kind === "assets") {
      return row.endIndex;
    }
  }

  return fallbackStartIndex;
}

function countAssetRows(
  rows: DateSectionVisualRow[],
  startIndex: number,
  endIndex: number
): number {
  let count = 0;

  for (let rowIndex = startIndex; rowIndex < endIndex; rowIndex += 1) {
    if (rows[rowIndex]?.kind === "assets") {
      count += 1;
    }
  }

  return count;
}

function countHeadingRows(
  rows: DateSectionVisualRow[],
  startIndex: number,
  endIndex: number
): number {
  let count = 0;

  for (let rowIndex = startIndex; rowIndex < endIndex; rowIndex += 1) {
    if (rows[rowIndex]?.kind === "heading") {
      count += 1;
    }
  }

  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
