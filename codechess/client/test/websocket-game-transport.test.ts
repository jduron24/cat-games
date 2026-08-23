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

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("WebSocketGameTransport", () => {
  it("authenticates room sessions without exposing the player token", async () => {
    const token = "secret-player-token-that-is-long-enough";
    const socket = new FakeSocket();
    const notices: string[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      playerToken: token,
      socketFactory: () => socket,
      handshakeTimeoutMs: 50,
    });
    transport.onNotice((notice) => notices.push(notice.message));

    const connecting = transport.connect();
    socket.emit("open");
    expect(JSON.parse(socket.sent[0] ?? "{}")).toEqual({ type: "room_hello", playerToken: token });

    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "hello_ack", userId: token, role: "ui" })),
    );
    await expect(connecting).rejects.toThrow(/acknowledgement/i);
    expect(notices.join(" ")).not.toContain(token);
  });

  it("requires a room acknowledgement before room sessions are ready", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      playerToken: "secret-player-token-that-is-long-enough",
      socketFactory: () => socket,
      handshakeTimeoutMs: 10,
    });

    const connecting = transport.connect();
    socket.emit("open");
    await expect(connecting).rejects.toThrow(/handshake timed out/i);
  });

  it("reconnects room sessions with capped backoff and reauthenticates", async () => {
    const first = new FakeSocket();
    const second = new FakeSocket();
    const sockets = [first, second];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const states: GameState[] = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      playerToken: "secret-player-token-that-is-long-enough",
      socketFactory: () => sockets.shift()!,
      reconnectScheduler: {
        schedule(callback, delayMs) {
          scheduled.push({ callback, delayMs });
          return callback;
        },
        cancel() {},
      },
      reconnectJitter: () => 0,
    });
    transport.onGameState((state) => states.push(state));

    const connecting = transport.connect();
    first.emit("open");
    first.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "room_hello_ack", roomCode: "BLUE-CAT1", playerId: "p1" })),
    );
    await connecting;
    first.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "match_found", gameId: "g1", color: "white", fen: STARTING_FEN }),
      ),
    );
    first.emit("close");

    expect(states.at(-1)?.status).toBe("reconnecting");
    expect(scheduled[0]?.delayMs).toBe(250);
    scheduled[0]?.callback();

    second.emit("open");
    expect(JSON.parse(second.sent[0] ?? "{}")).toEqual({
      type: "room_hello",
      playerToken: "secret-player-token-that-is-long-enough",
    });
    second.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "room_hello_ack", roomCode: "BLUE-CAT1", playerId: "p1" })),
    );
    second.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "game_resumed", fen: STARTING_FEN, pgn: "" })),
    );
    await Promise.resolve();

    expect(states.at(-1)?.status).toBe("active");
  });

  it("cancels pending room reconnects on explicit disconnect", async () => {
    const socket = new FakeSocket();
    const cancelled: unknown[] = [];
    const scheduled: Array<() => void> = [];
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      playerToken: "secret-player-token-that-is-long-enough",
      socketFactory: () => socket,
      reconnectScheduler: {
        schedule(callback) {
          scheduled.push(callback);
          return "retry-1";
        },
        cancel(handle) {
          cancelled.push(handle);
        },
      },
    });

    const connecting = transport.connect();
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "room_hello_ack", roomCode: "BLUE-CAT1", playerId: "p1" })),
    );
    await connecting;
    socket.emit("close");
    transport.disconnect();

    expect(scheduled).toHaveLength(1);
    expect(cancelled).toEqual(["retry-1"]);
  });

  it("does not send moves while a known game is paused, completed, or reconnecting", async () => {
    const socket = new FakeSocket();
    const transport = new WebSocketGameTransport({
      url: "ws://localhost:8080",
      playerToken: "secret-player-token-that-is-long-enough",
      socketFactory: () => socket,
    });
    const connecting = transport.connect();
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "room_hello_ack", roomCode: "BLUE-CAT1", playerId: "p1" })),
    );
    await connecting;
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "match_found", gameId: "g1", color: "white", fen: STARTING_FEN }),
      ),
    );

    for (const message of [
      { type: "game_paused" },
      { type: "game_completed", fen: STARTING_FEN, pgn: "" },
    ]) {
      socket.emit("message", Buffer.from(JSON.stringify(message)));
      transport.sendMove("e2", "e4");
    }
    socket.emit("close");
    transport.sendMove("e2", "e4");

    expect(socket.sent.map((value) => JSON.parse(value)).filter((value) => value.type === "move"))
      .toHaveLength(0);
    transport.disconnect();
  });
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
