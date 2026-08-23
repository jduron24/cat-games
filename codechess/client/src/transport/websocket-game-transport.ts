import { parseServerMessage, type ServerMessage } from "@codechess/shared";
import WebSocket from "ws";

import { parseFenBoard } from "../fen.js";
import type { GameState, PlayerColor, Square } from "../types.js";
import type { GameTransport, TransportNotice } from "./game-transport.js";

export interface ClientSocket {
  readyState: number;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  send(data: string): void;
  close(): void;
}

export type WebSocketGameTransportOptions = {
  url: string;
  userId: string;
  socketFactory?: (url: string) => ClientSocket;
  handshakeTimeoutMs?: number;
};

export class WebSocketGameTransport implements GameTransport {
  private readonly url: string;
  private readonly userId: string;
  private readonly socketFactory: (url: string) => ClientSocket;
  private readonly handshakeTimeoutMs: number;
  private readonly stateHandlers = new Set<(state: GameState) => void>();
  private readonly noticeHandlers = new Set<(notice: TransportNotice) => void>();
  private socket: ClientSocket | null = null;
  private connection: Promise<void> | null = null;
  private currentState: GameState | null = null;

  constructor(options: WebSocketGameTransportOptions) {
    this.url = options.url;
    this.userId = options.userId.trim();
    if (!this.userId) {
      throw new Error("WebSocket UI transport requires a non-empty user ID.");
    }
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as ClientSocket);
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000;
  }

  connect(): Promise<void> {
    if (this.connection) {
      return this.connection;
    }

    const socket = this.socketFactory(this.url);
    this.socket = socket;

    this.connection = new Promise((resolve, reject) => {
      let acknowledged = false;
      const handshakeTimeout = setTimeout(() => {
        if (!acknowledged) {
          reject(new Error("WebSocket UI handshake timed out."));
          socket.close();
        }
      }, this.handshakeTimeoutMs);

      socket.on("open", () => {
        this.send({ type: "hello", userId: this.userId, role: "ui" });
      });
      socket.on("message", (data) => {
        const message = this.handleMessage(data);
        if (message?.type === "hello_ack") {
          if (message.userId === this.userId && message.role === "ui") {
            acknowledged = true;
            clearTimeout(handshakeTimeout);
            resolve();
          } else if (!acknowledged) {
            clearTimeout(handshakeTimeout);
            reject(new Error("Server acknowledgement identity did not match this UI."));
            socket.close();
          }
        } else if (message?.type === "error" && !acknowledged) {
          clearTimeout(handshakeTimeout);
          reject(new Error(message.reason));
        }
      });
      socket.on("error", (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.emitNotice("error", `WebSocket error: ${detail}`);
        if (!acknowledged) {
          clearTimeout(handshakeTimeout);
          reject(error);
        }
      });
      socket.on("close", () => {
        this.emitNotice("info", "Disconnected from the CodeChess server.");
        if (!acknowledged) {
          clearTimeout(handshakeTimeout);
          reject(new Error("WebSocket closed before the handshake was acknowledged."));
        }
      });
    });

    return this.connection;
  }

  sendMove(from: Square, to: Square): void {
    this.send({ type: "move", from, to });
  }

  onGameState(handler: (state: GameState) => void): void {
    this.stateHandlers.add(handler);
  }

  onNotice(handler: (notice: TransportNotice) => void): void {
    this.noticeHandlers.add(handler);
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    this.connection = null;

    if (!socket) {
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "disconnect" }));
    }
    socket.close();
  }

  private send(message: object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.emitNotice("error", "Cannot send: the WebSocket is not connected.");
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: unknown): ServerMessage | null {
    let parsed: unknown;
    try {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      parsed = JSON.parse(text);
    } catch {
      this.emitNotice("error", "Server sent an unreadable message.");
      return null;
    }

    const message = parseServerMessage(parsed);
    if (!message || ("fen" in message && !isFen(message.fen))) {
      this.emitNotice("error", "Server sent an invalid protocol message.");
      return null;
    }

    switch (message.type) {
      case "hello_ack":
        break;
      case "error":
        this.emitNotice("error", `Server error: ${message.reason}`);
        break;
      case "waiting_for_player":
        this.emitNotice("info", "Waiting for another developer…");
        break;
      case "match_found":
        this.publishState({
          fen: message.fen,
          playerColor: message.color,
          turn: turnFromFen(message.fen),
          status: "active",
          opponentStatus: "playing",
        });
        this.emitNotice("info", `Match found. You are ${message.color}.`);
        break;
      case "game_state":
      case "move_accepted":
        this.updateState({ fen: message.fen, turn: message.turn, status: "active" });
        break;
      case "game_completed":
        this.updateState({
          fen: message.fen,
          turn: turnFromFen(message.fen),
          status: "completed",
        });
        this.emitNotice("info", "Game completed.");
        break;
      case "move_rejected":
        this.emitNotice("error", `Move rejected: ${message.reason}`);
        break;
      case "game_paused":
        this.updateState({ status: "paused", opponentStatus: "waiting" });
        break;
      case "opponent_agent_finished":
        this.updateState({ status: "paused", opponentStatus: "agent_finished" });
        this.emitNotice("info", "Opponent's agent finished. Game paused.");
        break;
      case "game_resumed":
        this.updateState({
          fen: message.fen,
          turn: turnFromFen(message.fen),
          status: "active",
          opponentStatus: "playing",
        });
        this.emitNotice("info", "Game resumed.");
        break;
    }
    return message;
  }

  private updateState(update: Partial<GameState>): void {
    if (!this.currentState) {
      this.emitNotice("error", "Received game state before a match was established.");
      return;
    }
    this.publishState({ ...this.currentState, ...update });
  }

  private publishState(state: GameState): void {
    this.currentState = { ...state };
    for (const handler of this.stateHandlers) {
      handler({ ...state });
    }
  }

  private emitNotice(level: TransportNotice["level"], message: string): void {
    for (const handler of this.noticeHandlers) {
      handler({ level, message });
    }
  }
}

function turnFromFen(fen: string): PlayerColor {
  return fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
}

function isFen(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const turn = value.trim().split(/\s+/)[1];
  if (turn !== "w" && turn !== "b") {
    return false;
  }

  try {
    parseFenBoard(value);
    return true;
  } catch {
    return false;
  }
}
