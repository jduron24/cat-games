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
  it("identifies the UI and resolves only after the server acknowledges the handshake", async () => {
    const socket = new FakeSocket();
    const notices: string[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });
    transport.onNotice((notice) => notices.push(notice.message));

    const connecting = transport.connect();
    let connected = false;
    void connecting.then(() => {
      connected = true;
    });
    socket.emit("open");
    await Promise.resolve();

    expect(connected).toBe(false);
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: "hello", userId: "ui-test", role: "ui" },
    ]);

    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "ui-test", role: "ui" })),
    );
    await connecting;
    transport.sendMove("e2", "e4");

    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: "hello", userId: "ui-test", role: "ui" },
      { type: "move", from: "e2", to: "e4" },
    ]);
    expect(notices).toEqual([]);
  });

  it("normalizes the user ID before sending and matching the acknowledgement", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "  alice  ",
      socketFactory: () => socket,
      handshakeTimeoutMs: 50,
    });

    const connecting = transport.connect();
    socket.emit("open");
    expect(JSON.parse(socket.sent[0] ?? "{}")).toEqual({
      type: "hello",
      userId: "alice",
      role: "ui",
    });

    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "alice", role: "ui" })),
    );
    await connecting;
  });

  it("rejects an acknowledgement for a different UI identity", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "alice",
      socketFactory: () => socket,
      handshakeTimeoutMs: 50,
    });

    const connecting = transport.connect();
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "bob", role: "ui" })),
    );

    await expect(
      Promise.race([
        connecting,
        new Promise<void>((_resolve, reject) =>
          setTimeout(() => reject(new Error("UI handshake remained pending")), 50),
        ),
      ]),
    ).rejects.toThrow(/acknowledgement.*identity/i);
  });

  it("rejects when the UI handshake is not acknowledged in time", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "alice",
      socketFactory: () => socket,
      handshakeTimeoutMs: 10,
    });

    const connecting = transport.connect();
    socket.emit("open");

    await expect(
      Promise.race([
        connecting,
        new Promise<void>((_resolve, reject) =>
          setTimeout(() => reject(new Error("UI transport did not enforce its timeout")), 50),
        ),
      ]),
    ).rejects.toThrow(/handshake timed out/i);
    expect(socket.closed).toBe(true);
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
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "ui-test", role: "ui" })),
    );
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

  it("publishes a completed state when the server ends the game", async () => {
    const socket = new FakeSocket();
    const states: GameState[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });
    transport.onGameState((state) => states.push(state));

    const connecting = transport.connect();
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "ui-test", role: "ui" })),
    );
    await connecting;

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "match_found",
          gameId: "game-1",
          color: "white",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        }),
      ),
    );
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "game_completed",
          fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
          pgn: "1. f3 e5 2. g4 Qh4#",
        }),
      ),
    );

    expect(states.at(-1)).toMatchObject({
      status: "completed",
      turn: "white",
      playerColor: "white",
    });
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
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "ui-test", role: "ui" })),
    );
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

  it("surfaces server protocol errors without disconnecting", async () => {
    const socket = new FakeSocket();
    const notices: string[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      userId: "ui-test",
      socketFactory: () => socket,
    });
    transport.onNotice((notice) => notices.push(notice.message));

    const connecting = transport.connect();
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: "ui-test", role: "ui" })),
    );
    await connecting;

    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "error", reason: "UI role cannot send waiting" })),
    );

    expect(notices.at(-1)).toBe("Server error: UI role cannot send waiting");
    expect(socket.closed).toBe(false);
  });
});
