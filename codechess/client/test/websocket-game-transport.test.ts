import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  WebSocketGameTransport,
  type ClientSocket,
} from "../src/transport/websocket-game-transport.js";
import type { GameState } from "../src/types.js";

class FakeSocket extends EventEmitter implements ClientSocket {
  readyState = 1;
  sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.emit("close");
  }
}

describe("WebSocketGameTransport", () => {
  it("identifies the UI and emits standardized moves without claiming agent waiting state", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });

    const connecting = transport.connect();
    socket.emit("open");
    await connecting;
    transport.sendMove("e2", "e4");

    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: "hello", userId: "ui-test" },
      { type: "move", from: "e2", to: "e4" },
    ]);
  });

  it("translates game state, pause, and rejection protocol messages", async () => {
    const socket = new FakeSocket();
    const states: GameState[] = [];
    const notices: string[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });
    transport.onGameState((state) => states.push(state));
    transport.onNotice((notice) => notices.push(notice.message));

    const connecting = transport.connect();
    socket.emit("open");
    await connecting;

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "match_found",
          gameId: "game-1",
          color: "black",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        }),
      ),
    );
    expect(states.at(-1)).toMatchObject({
      playerColor: "black",
      turn: "white",
      status: "active",
    });

    socket.emit("message", Buffer.from(JSON.stringify({ type: "game_paused" })));
    expect(states.at(-1)?.status).toBe("paused");

    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "move_rejected", reason: "Not your turn" })),
    );
    expect(notices.at(-1)).toBe("Move rejected: Not your turn");

    transport.disconnect();
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual({ type: "disconnect" });
    expect(socket.closed).toBe(true);
  });

  it("rejects invalid protocol shapes without crashing or publishing corrupt state", async () => {
    const socket = new FakeSocket();
    const states: GameState[] = [];
    const notices: string[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });
    transport.onGameState((state) => states.push(state));
    transport.onNotice((notice) => notices.push(notice.message));

    const connecting = transport.connect();
    socket.emit("open");
    await connecting;

    const invalidMessages = [
      null,
      [],
      { type: "match_found", gameId: "game-1", color: "purple" },
      { type: "game_state", fen: 42, turn: "white" },
      { type: "move_accepted", fen: "8/8/8/8/8/8/8/8 w - - 0 1", turn: "sideways" },
      { type: "move_rejected" },
      { type: "game_resumed", fen: null, pgn: "" },
    ];

    for (const message of invalidMessages) {
      expect(() => socket.emit("message", Buffer.from(JSON.stringify(message)))).not.toThrow();
    }

    expect(states).toHaveLength(0);
    expect(notices).toHaveLength(invalidMessages.length);
    expect(notices.every((notice) => notice === "Server sent an invalid protocol message.")).toBe(
      true,
    );
  });
});
