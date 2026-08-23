import type { Move, Square } from "./types.js";

export type SelectionState = {
  selectedSquare: Square | null;
};

export type SelectionResult = {
  state: SelectionState;
  move: Move | null;
};

export function activateSquare(state: SelectionState, square: Square): SelectionResult {
  if (state.selectedSquare === null) {
    return {
      state: { selectedSquare: square },
      move: null,
    };
  }

  if (state.selectedSquare === square) {
    return {
      state,
      move: null,
    };
  }

  return {
    state: { selectedSquare: null },
    move: {
      from: state.selectedSquare,
      to: square,
    },
  };
}

export function cancelSelection(_state: SelectionState): SelectionState {
  return { selectedSquare: null };
}
