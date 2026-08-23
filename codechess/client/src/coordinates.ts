import type { PlayerColor, Square } from "./types.js";

export const BOARD_SIZE = 8;
export const BOARD_CELL_WIDTH = 5;
export const BOARD_CELL_HEIGHT = 1;
export const FRAME_WIDTH = 68;
export const FRAME_HEIGHT = 24;
export const MIN_TERMINAL_WIDTH = 70;
export const MIN_TERMINAL_HEIGHT = 24;

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export type BoardIndex = {
  row: number;
  column: number;
};

export type BoardLayout = {
  boardLeft: number;
  boardTop: number;
};

export type TerminalLayout = BoardLayout & {
  frameLeft: number;
  frameTop: number;
};

function assertBoardIndex(row: number, column: number): void {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    row >= BOARD_SIZE ||
    column < 0 ||
    column >= BOARD_SIZE
  ) {
    throw new RangeError(`Board index must be between 0 and ${BOARD_SIZE - 1}.`);
  }
}

export function boardIndexToSquare(
  row: number,
  column: number,
  orientation: PlayerColor,
): Square {
  assertBoardIndex(row, column);

  const fileIndex = orientation === "white" ? column : BOARD_SIZE - 1 - column;
  const rank = orientation === "white" ? BOARD_SIZE - row : row + 1;

  return `${FILES[fileIndex]}${rank}` as Square;
}

export function squareToBoardIndex(square: Square, orientation: PlayerColor): BoardIndex {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);

  if (fileIndex < 0 || (rank < 1 || rank > BOARD_SIZE)) {
    throw new RangeError(`Invalid chess square: ${square}`);
  }

  return orientation === "white"
    ? { row: BOARD_SIZE - rank, column: fileIndex }
    : { row: rank - 1, column: BOARD_SIZE - 1 - fileIndex };
}

export function screenCoordinatesToSquare(
  x: number,
  y: number,
  layout: BoardLayout,
  orientation: PlayerColor,
): Square | null {
  const relativeX = x - layout.boardLeft;
  const relativeY = y - layout.boardTop;
  const boardWidth = BOARD_SIZE * BOARD_CELL_WIDTH;
  const boardHeight = BOARD_SIZE * BOARD_CELL_HEIGHT;

  if (relativeX < 0 || relativeY < 0 || relativeX >= boardWidth || relativeY >= boardHeight) {
    return null;
  }

  const column = Math.floor(relativeX / BOARD_CELL_WIDTH);
  const row = Math.floor(relativeY / BOARD_CELL_HEIGHT);

  return boardIndexToSquare(row, column, orientation);
}

export function calculateTerminalLayout(width: number, height: number): TerminalLayout {
  const frameLeft = Math.max(1, Math.floor((width - FRAME_WIDTH) / 2) + 1);
  const frameTop = Math.max(1, Math.floor((height - FRAME_HEIGHT) / 2) + 1);
  const boardWidth = BOARD_SIZE * BOARD_CELL_WIDTH;

  return {
    frameLeft,
    frameTop,
    boardLeft: frameLeft + Math.floor((FRAME_WIDTH - boardWidth) / 2),
    boardTop: frameTop + 7,
  };
}

export function moveBoardCursor(
  index: BoardIndex,
  deltaRow: number,
  deltaColumn: number,
): BoardIndex {
  return {
    row: Math.max(0, Math.min(BOARD_SIZE - 1, index.row + deltaRow)),
    column: Math.max(0, Math.min(BOARD_SIZE - 1, index.column + deltaColumn)),
  };
}
