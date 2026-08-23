import { describe, expect, it } from "vitest";

import { parseFenBoard } from "../src/fen.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("parseFenBoard", () => {
  it("parses the normal opening position", () => {
    const board = parseFenBoard(STARTING_FEN);

    expect(board.a8).toEqual({ color: "black", type: "rook" });
    expect(board.e8).toEqual({ color: "black", type: "king" });
    expect(board.e2).toEqual({ color: "white", type: "pawn" });
    expect(board.h1).toEqual({ color: "white", type: "rook" });
    expect(board.e4).toBeUndefined();
  });

  it("rejects malformed piece placement", () => {
    expect(() => parseFenBoard("8/8/8/8/8/8/8 w - - 0 1")).toThrow(/eight ranks/i);
    expect(() => parseFenBoard("9/8/8/8/8/8/8/8 w - - 0 1")).toThrow(/rank/i);
    expect(() => parseFenBoard("x7/8/8/8/8/8/8/8 w - - 0 1")).toThrow(/piece/i);
  });
});
