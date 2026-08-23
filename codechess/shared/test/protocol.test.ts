import assert from "node:assert/strict";
import test from "node:test";

import { parseClientMessage, parseServerMessage } from "../src/protocol.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("exports protocol parsers", async () => {
  let protocol: typeof import("../src/protocol.js") | undefined;

  try {
    protocol = await import("../src/protocol.js");
  } catch {
    // The first TDD run intentionally reaches this branch before the module exists.
  }

  assert.equal(typeof protocol?.parseClientMessage, "function");
  assert.equal(typeof protocol?.parseServerMessage, "function");
});

test("parses valid client messages into canonical protocol values", () => {
  const messages = [
    { type: "hello", userId: "alice", role: "ui" },
    { type: "hello", userId: "alice", role: "agent" },
    { type: "waiting" },
    { type: "done" },
    { type: "move", from: "e2", to: "e4" },
    { type: "disconnect" },
  ];

  for (const message of messages) {
    assert.deepEqual(parseClientMessage(message), message);
  }
});

test("rejects malformed client messages", () => {
  const malformed = [
    null,
    [],
    { type: "hello", userId: 42, role: "ui" },
    { type: "hello", userId: "   ", role: "ui" },
    { type: "hello", userId: "alice", role: "browser" },
    { type: "move", from: "e9", to: "e4" },
    { type: "move", from: 12, to: "e4" },
    { type: "unknown" },
  ];

  for (const message of malformed) {
    assert.equal(parseClientMessage(message), null);
  }
});

test("parses valid server messages including handshake and errors", () => {
  const messages = [
    { type: "hello_ack", userId: "alice", role: "ui" },
    { type: "error", reason: "bad request" },
    { type: "waiting_for_player" },
    { type: "match_found", gameId: "game-1", color: "white", fen: START_FEN },
    { type: "game_state", fen: START_FEN, turn: "white" },
    { type: "move_accepted", fen: START_FEN, turn: "black" },
    { type: "game_completed", fen: START_FEN, pgn: "1. f3 e5 2. g4 Qh4#" },
    { type: "move_rejected", reason: "illegal" },
    { type: "game_paused" },
    { type: "opponent_agent_finished" },
    { type: "game_resumed", fen: START_FEN, pgn: "1. e4" },
  ];

  for (const message of messages) {
    assert.deepEqual(parseServerMessage(message), message);
  }
});

test("rejects malformed server messages", () => {
  const malformed = [
    null,
    [],
    { type: "hello_ack", userId: "alice", role: "browser" },
    { type: "error" },
    { type: "match_found", gameId: "game-1", color: "purple", fen: START_FEN },
    { type: "game_state", fen: 42, turn: "white" },
    { type: "move_accepted", fen: START_FEN, turn: "sideways" },
    { type: "game_completed", fen: START_FEN, pgn: null },
    { type: "game_resumed", fen: START_FEN, pgn: null },
    { type: "unknown" },
  ];

  for (const message of malformed) {
    assert.equal(parseServerMessage(message), null);
  }
});
