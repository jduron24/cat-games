import { describe, expect, it } from "vitest";

import { renderTerminalView } from "../src/renderer.js";
import type { GameState } from "../src/types.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const whiteState: GameState = {
  fen: STARTING_FEN,
  playerColor: "white",
  turn: "white",
  status: "active",
  opponentStatus: "playing",
};

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "");

describe("renderTerminalView", () => {
  it("renders a labeled White board with distinct cursor and source markers", () => {
    const view = renderTerminalView({
      width: 90,
      height: 30,
      gameState: whiteState,
      cursorSquare: "e4",
      selectedSquare: "e2",
      notice: null,
      mockMode: true,
    });
    const plain = view.lines.map(stripAnsi);

    expect(view.layout).not.toBeNull();
    expect(plain[1]).toContain("CODECHESS");
    expect(plain[2]).toContain("YOU · WHITE");
    expect(plain[5]).toContain("a    b    c    d    e    f    g    h");
    expect(plain[7]).toContain("8");
    expect(plain[14]).toContain("1");
    expect(plain.join("\n")).toContain("▏ · ▕");
    expect(plain.join("\n")).toContain("[ ♙ ]");
    expect(plain[16]).toContain("YOUR TURN");
    expect(plain[21]).toContain("p pause");
  });

  it("flips files, ranks, and pieces for a Black player", () => {
    const view = renderTerminalView({
      width: 90,
      height: 30,
      gameState: { ...whiteState, playerColor: "black" },
      cursorSquare: "e7",
      selectedSquare: null,
      notice: null,
      mockMode: false,
    });
    const plain = view.lines.map(stripAnsi);

    expect(plain[5]).toContain("h    g    f    e    d    c    b    a");
    expect(plain[7]).toContain("1");
    expect(plain[14]).toContain("8");
    expect(plain[21]).not.toContain("p pause");
  });

  it("renders paused and opponent-finished status without enabling moves", () => {
    const view = renderTerminalView({
      width: 90,
      height: 30,
      gameState: {
        ...whiteState,
        status: "paused",
        opponentStatus: "agent_finished",
      },
      cursorSquare: "e2",
      selectedSquare: null,
      notice: "Opponent's agent finished. Game paused.",
      mockMode: true,
    });
    const plain = view.lines.map(stripAnsi).join("\n");

    expect(plain).toContain("GAME PAUSED");
    expect(plain).toContain("OPPONENT AGENT FINISHED");
  });

  it("shows a helpful fallback when the terminal is too small", () => {
    const view = renderTerminalView({
      width: 69,
      height: 23,
      gameState: whiteState,
      cursorSquare: "e2",
      selectedSquare: null,
      notice: null,
      mockMode: false,
    });

    expect(view.layout).toBeNull();
    expect(view.lines.join("\n")).toContain("Terminal too small for CodeChess.");
    expect(view.lines.join("\n")).toContain("Resize to at least 70x24.");
  });
});
