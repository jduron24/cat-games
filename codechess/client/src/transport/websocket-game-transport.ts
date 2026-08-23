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
};

type ServerMessage =
  | { type: "waiting_for_player" }
  | { type: "match_found"; gameId: string; color: PlayerColor; fen: string }
  | { type: "game_state"; fen: string; turn: PlayerColor }
  | { type: "move_accepted"; fen: string; turn: PlayerColor }
  | { type: "move_rejected"; reason: string }
  | { type: "game_paused" }
  | { type: "opponent_agent_finished" }
  | { type: "game_resumed"; fen: string; pgn: string };

export class WebSocketGameTransport implements GameTransport {
  private readonly url: string;
  private readonly userId: string;
  private readonly socketFactory: (url: string) => ClientSocket;
  private readonly stateHandlers = new Set<(state: GameState) => void>();
  private readonly noticeHandlers = new Set<(notice: TransportNotice) => void>();
  private socket: ClientSocket | null = null;
  private currentState: GameState | null = null;

  constructor(options: WebSocketGameTransportOptions) {
    this.url = options.url;
    this.userId = options.userId;
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as ClientSocket);
  }

  connect(): Promise<void> {
    if (this.socket) {
      return Promise.resolve();
    }

    const socket = this.socketFactory(this.url);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let opened = false;

      socket.on("open", () => {
        opened = true;
        this.send({ type: "hello", userId: this.userId });
        resolve();
      });
      socket.on("message", (data) => this.handleMessage(data));
      socket.on("error", (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.emitNotice("error", `WebSocket error: ${detail}`);
        if (!opened) {
          reject(error);
        }
      });
      socket.on("close", () => {
        this.emitNotice("info", "Disconnected from the CodeChess server.");
        if (!opened) {
          reject(new Error("WebSocket closed before the connection was established."));
        }
      });
    });
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

  private handleMessage(data: unknown): void {
    let parsed: unknown;
    try {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      parsed = JSON.parse(text);
    } catch {
      this.emitNotice("error", "Server sent an unreadable message.");
      return;
    }

    const message = parseServerMessage(parsed);
    if (!message) {
      this.emitNotice("error", "Server sent an invalid protocol message.");
      return;
    }

    switch (message.type) {
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

function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isObject(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "waiting_for_player":
    case "game_paused":
    case "opponent_agent_finished":
      return { type: value.type };
    case "match_found":
      return typeof value.gameId === "string" && isPlayerColor(value.color) && isFen(value.fen)
        ? { type: value.type, gameId: value.gameId, color: value.color, fen: value.fen }
        : null;
    case "game_state":
    case "move_accepted":
      return isFen(value.fen) && isPlayerColor(value.turn)
        ? { type: value.type, fen: value.fen, turn: value.turn }
        : null;
    case "move_rejected":
      return typeof value.reason === "string"
        ? { type: value.type, reason: value.reason }
        : null;
    case "game_resumed":
      return isFen(value.fen) && typeof value.pgn === "string"
        ? { type: value.type, fen: value.fen, pgn: value.pgn }
        : null;
    default:
      return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "white" || value === "black";
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
