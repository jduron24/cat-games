import type { PlayerColor, Square } from "./types.js";

export type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export type BoardPiece = {
  color: PlayerColor;
  type: PieceType;
};

export type FenBoard = Partial<Record<Square, BoardPiece>>;

const PIECE_TYPES: Record<string, PieceType> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function parseFenBoard(fen: string): FenBoard {
  const piecePlacement = fen.trim().split(/\s+/)[0];
  const ranks = piecePlacement?.split("/") ?? [];

  if (ranks.length !== 8) {
    throw new Error("FEN piece placement must contain eight ranks.");
  }

  const board: FenBoard = {};

  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;

    for (const symbol of rankText) {
      if (/^\d$/.test(symbol) && !/^[1-8]$/.test(symbol)) {
        throw new Error(`Invalid FEN rank ${8 - rankIndex}: ${symbol} is not a valid gap.`);
      }

      if (/^[1-8]$/.test(symbol)) {
        fileIndex += Number(symbol);
        continue;
      }

      const type = PIECE_TYPES[symbol.toLowerCase()];
      if (!type) {
        throw new Error(`Invalid FEN piece symbol: ${symbol}`);
      }

      if (fileIndex >= 8) {
        throw new Error(`FEN rank ${8 - rankIndex} is wider than eight files.`);
      }

      const square = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}` as Square;
      board[square] = {
        color: symbol === symbol.toUpperCase() ? "white" : "black",
        type,
      };
      fileIndex += 1;
    }

    if (fileIndex !== 8) {
      throw new Error(`FEN rank ${8 - rankIndex} must contain eight files.`);
    }
  });

  return board;
}
