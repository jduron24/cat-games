import { describe, expect, it } from "vitest";

import { activateSquare, cancelSelection, type SelectionState } from "../src/selection.js";

describe("move selection", () => {
  it("selects e2 then emits an e2/e4 move", () => {
    const initial: SelectionState = { selectedSquare: null };
    const source = activateSquare(initial, "e2");

    expect(source).toEqual({
      state: { selectedSquare: "e2" },
      move: null,
    });

    expect(activateSquare(source.state, "e4")).toEqual({
      state: { selectedSquare: null },
      move: { from: "e2", to: "e4" },
    });
  });

  it("keeps the source selected when it is activated twice", () => {
    expect(activateSquare({ selectedSquare: "e2" }, "e2")).toEqual({
      state: { selectedSquare: "e2" },
      move: null,
    });
  });

  it("clears the source on Escape", () => {
    expect(cancelSelection({ selectedSquare: "e2" })).toEqual({ selectedSquare: null });
  });
});
