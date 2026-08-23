import { describe, expect, it } from "vitest";

import {
  BOARD_CELL_HEIGHT,
  BOARD_CELL_WIDTH,
  boardIndexToSquare,
  screenCoordinatesToSquare,
  squareToBoardIndex,
  type BoardLayout,
} from "../src/coordinates.js";

describe("boardIndexToSquare", () => {
  it("maps visual indices for White orientation", () => {
    expect(boardIndexToSquare(0, 0, "white")).toBe("a8");
    expect(boardIndexToSquare(1, 4, "white")).toBe("e7");
    expect(boardIndexToSquare(6, 4, "white")).toBe("e2");
    expect(boardIndexToSquare(7, 7, "white")).toBe("h1");
  });

  it("maps visual indices for Black orientation", () => {
    expect(boardIndexToSquare(0, 0, "black")).toBe("h1");
    expect(boardIndexToSquare(1, 4, "black")).toBe("d2");
    expect(boardIndexToSquare(6, 3, "black")).toBe("e7");
    expect(boardIndexToSquare(7, 7, "black")).toBe("a8");
  });

  it("rejects indices outside the board", () => {
    expect(() => boardIndexToSquare(-1, 0, "white")).toThrow(RangeError);
    expect(() => boardIndexToSquare(0, 8, "white")).toThrow(RangeError);
  });
});

describe("squareToBoardIndex", () => {
  it("reverses mappings in both orientations", () => {
    expect(squareToBoardIndex("e2", "white")).toEqual({ row: 6, column: 4 });
    expect(squareToBoardIndex("e2", "black")).toEqual({ row: 1, column: 3 });
  });
});

describe("screenCoordinatesToSquare", () => {
  const layout: BoardLayout = { boardLeft: 10, boardTop: 5 };

  it("maps every point in a terminal cell for White", () => {
    expect(screenCoordinatesToSquare(10, 5, layout, "white")).toBe("a8");
    expect(
      screenCoordinatesToSquare(
        10 + BOARD_CELL_WIDTH - 1,
        5 + BOARD_CELL_HEIGHT - 1,
        layout,
        "white",
      ),
    ).toBe("a8");
    expect(screenCoordinatesToSquare(10 + 4 * BOARD_CELL_WIDTH, 11, layout, "white")).toBe(
      "e2",
    );
  });

  it("uses the flipped mapping for Black", () => {
    expect(screenCoordinatesToSquare(10, 5, layout, "black")).toBe("h1");
    expect(screenCoordinatesToSquare(10 + 3 * BOARD_CELL_WIDTH, 6, layout, "black")).toBe(
      "e2",
    );
  });

  it("returns null outside the board", () => {
    expect(screenCoordinatesToSquare(9, 5, layout, "white")).toBeNull();
    expect(screenCoordinatesToSquare(10, 4, layout, "white")).toBeNull();
    expect(screenCoordinatesToSquare(10 + 8 * BOARD_CELL_WIDTH, 5, layout, "white")).toBeNull();
    expect(screenCoordinatesToSquare(10, 5 + 8 * BOARD_CELL_HEIGHT, layout, "white")).toBeNull();
  });
});
