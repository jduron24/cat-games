import { parseServerMessage, type ServerMessage } from "@codechess/shared";
import WebSocket from "ws";

import { parseFenBoard } from "../fen.js";
import type { GameState, PlayerColor, Square } from "../types.js";
import type { GameTransport, TransportNotice } from "./game-transport.js";

export interface ClientSocket {
  readyState: number;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  send(data: string): void;
  close(): void;
}

type ReconnectScheduler = {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
};

type CommonOptions = {
  url: string;
  socketFactory?: (url: string) => ClientSocket;
  handshakeTimeoutMs?: number;
  reconnectScheduler?: ReconnectScheduler;
  reconnectJitter?: (baseDelayMs: number, attempt: number) => number;
};

export type WebSocketGameTransportOptions = CommonOptions &
  ({ userId: string; playerToken?: never } | { playerToken: string; userId?: never });

type RoomIdentity = { roomCode: string; playerId: string };

const DEFAULT_RECONNECT_SCHEDULER: ReconnectScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class WebSocketGameTransport implements GameTransport {
  private readonly url: string;
  private readonly userId: string | null;
  private readonly playerToken: string | null;
  private readonly socketFactory: (url: string) => ClientSocket;
  private readonly handshakeTimeoutMs: number;
  private readonly reconnectScheduler: ReconnectScheduler;
  private readonly reconnectJitter: (baseDelayMs: number, attempt: number) => number;
  private readonly stateHandlers = new Set<(state: GameState) => void>();
  private readonly noticeHandlers = new Set<(notice: TransportNotice) => void>();
  private socket: ClientSocket | null = null;
  private connection: Promise<void> | null = null;
  private currentState: GameState | null = null;
  private roomIdentity: RoomIdentity | null = null;
  private retryHandle: unknown = null;
  private retryAttempt = 0;
  private explicitlyDisconnected = false;
  private cancelPendingConnection: (() => void) | null = null;

  constructor(options: WebSocketGameTransportOptions) {
    this.url = options.url;
    this.userId = "userId" in options && options.userId !== undefined ? options.userId.trim() : null;
    this.playerToken =
      "playerToken" in options && options.playerToken !== undefined ? options.playerToken : null;
    if (this.userId !== null && !this.userId) {
      throw new Error("WebSocket UI transport requires a non-empty user ID.");
    }
    if (this.playerToken !== null && !this.playerToken) {
      throw new Error("WebSocket UI transport requires a player token.");
    }
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as ClientSocket);
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000;
    this.reconnectScheduler = options.reconnectScheduler ?? DEFAULT_RECONNECT_SCHEDULER;
    this.reconnectJitter =
      options.reconnectJitter ?? ((baseDelayMs) => Math.floor(Math.random() * baseDelayMs * 0.2));
  }

  connect(): Promise<void> {
    if (this.connection) return this.connection;
    this.explicitlyDisconnected = false;
    this.connection = this.openSocket(false);
    return this.connection;
  }

  sendMove(from: Square, to: Square): void {
    if (this.currentState && this.currentState.status !== "active") {
      this.emitNotice("info", "Moves are disabled until the game is active.");
      return;
    }
    this.send({ type: "move", from, to });
  }

  onGameState(handler: (state: GameState) => void): void {
    this.stateHandlers.add(handler);
  }

  onNotice(handler: (notice: TransportNotice) => void): void {
    this.noticeHandlers.add(handler);
  }

  disconnect(): void {
    this.explicitlyDisconnected = true;
    if (this.retryHandle !== null) {
      this.reconnectScheduler.cancel(this.retryHandle);
      this.retryHandle = null;
    }
    const cancelPendingConnection = this.cancelPendingConnection;
    this.cancelPendingConnection = null;
    cancelPendingConnection?.();
    const socket = this.socket;
    this.socket = null;
    this.connection = null;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "disconnect" }));
    socket.close();
  }

  private openSocket(reconnecting: boolean): Promise<void> {
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      let acknowledged = false;
      let settled = false;
      let handshakeTimeout: ReturnType<typeof setTimeout>;
      const removeSocketListeners = (): void => {
        socket.off?.("open", handleOpen);
        socket.off?.("message", handleMessage);
        socket.off?.("error", handleError);
        socket.off?.("close", handleClose);
      };
      const finishHandshake = (): void => {
        clearTimeout(handshakeTimeout);
        if (this.cancelPendingConnection === cancelPendingConnection) {
          this.cancelPendingConnection = null;
        }
      };
      const rejectHandshake = (error: Error, removeListeners = false): void => {
        if (settled) return;
        settled = true;
        finishHandshake();
        if (removeListeners) removeSocketListeners();
        reject(error);
      };
      const cancelPendingConnection = (): void => {
        rejectHandshake(new Error("WebSocket connection disconnected before the handshake completed."), true);
      };
      const handleOpen = (): void => {
        socket.send(
          JSON.stringify(
            this.playerToken !== null
              ? { type: "room_hello", playerToken: this.playerToken }
              : { type: "hello", userId: this.userId, role: "ui" },
          ),
        );
      };
      const handleMessage = (data: unknown): void => {
        const message = this.handleMessage(data);
        if (!message || acknowledged) return;
        if (this.playerToken !== null && message.type === "room_hello_ack") {
          const identity = { roomCode: message.roomCode, playerId: message.playerId };
          if (
            this.roomIdentity &&
            (identity.roomCode !== this.roomIdentity.roomCode || identity.playerId !== this.roomIdentity.playerId)
          ) {
            rejectHandshake(new Error("Server acknowledgement identity did not match this room session."));
            socket.close();
            return;
          }
          this.roomIdentity = identity;
          acknowledged = true;
          settled = true;
          finishHandshake();
          this.retryAttempt = 0;
          this.emitNotice("info", `Connected to room ${identity.roomCode}.`);
          resolve();
          return;
        }
        if (
          this.userId !== null &&
          message.type === "hello_ack" &&
          message.userId === this.userId &&
          message.role === "ui"
        ) {
          acknowledged = true;
          settled = true;
          finishHandshake();
          resolve();
          return;
        }
        if (message.type === "error") {
          rejectHandshake(new Error(this.redact(message.reason)));
          return;
        }
        if (message.type === "hello_ack" || message.type === "room_hello_ack") {
          rejectHandshake(new Error("Server acknowledgement identity did not match this UI."));
          socket.close();
        }
      };
      const handleError = (error: unknown): void => {
        const detail = this.redact(error instanceof Error ? error.message : String(error));
        this.emitNotice("error", `WebSocket error: ${detail}`);
        if (!acknowledged) rejectHandshake(new Error(detail));
      };
      const handleClose = (): void => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.connection = null;
        if (!acknowledged) {
          rejectHandshake(new Error("WebSocket closed before the handshake was acknowledged."));
          if (reconnecting) this.scheduleReconnect();
          return;
        }
        if (this.playerToken !== null && !this.explicitlyDisconnected) {
          this.markReconnecting();
          this.scheduleReconnect();
        } else if (!this.explicitlyDisconnected) {
          this.emitNotice("info", "Disconnected from the CodeChess server.");
        }
      };
      handshakeTimeout = setTimeout(() => {
        if (!acknowledged) {
          rejectHandshake(new Error("WebSocket UI handshake timed out."));
          socket.close();
        }
      }, this.handshakeTimeoutMs);
      this.cancelPendingConnection = cancelPendingConnection;
      socket.on("open", handleOpen);
      socket.on("message", handleMessage);
      socket.on("error", handleError);
      socket.on("close", handleClose);
    });
  }

  private scheduleReconnect(): void {
    if (this.explicitlyDisconnected || this.retryHandle !== null) return;
    const attempt = this.retryAttempt;
    const baseDelayMs = Math.min(250 * 2 ** attempt, 5_000);
    const delayMs = Math.min(5_000, Math.max(0, baseDelayMs + this.reconnectJitter(baseDelayMs, attempt)));
    this.retryAttempt += 1;
    this.retryHandle = this.reconnectScheduler.schedule(() => {
      this.retryHandle = null;
      if (this.explicitlyDisconnected) return;
      this.connection = this.openSocket(true);
      void this.connection.catch(() => {
        if (!this.explicitlyDisconnected && this.retryHandle === null) this.scheduleReconnect();
      });
    }, delayMs);
  }

  private markReconnecting(): void {
    if (this.currentState) this.updateState({ status: "reconnecting" });
    this.emitNotice("info", "Connection lost. Reconnecting…");
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
      case "room_hello_ack":
        break;
      case "error":
        this.emitNotice("error", `Server error: ${this.redact(message.reason)}`);
        break;
      case "waiting_for_player":
        this.emitNotice("info", "Waiting for your teammate and both coding agents…");
        break;
      case "match_found":
        this.publishState({ fen: message.fen, playerColor: message.color, turn: turnFromFen(message.fen), status: "active", opponentStatus: "playing" });
        this.emitNotice("info", `Match found. You are ${message.color}.`);
        break;
      case "game_state":
      case "move_accepted":
        this.updateState({ fen: message.fen, turn: message.turn, status: "active" });
        break;
      case "game_completed":
        this.updateState({ fen: message.fen, turn: turnFromFen(message.fen), status: "completed" });
        this.emitNotice("info", "Game completed. Start a rematch when both agents are active again.");
        break;
      case "move_rejected":
        this.emitNotice("error", `Move rejected: ${this.redact(message.reason)}`);
        break;
      case "game_paused":
        this.updateState({ status: "paused", opponentStatus: "waiting" });
        this.emitNotice("info", "Game paused while waiting for both agents.");
        break;
      case "opponent_agent_finished":
        this.updateState({ status: "paused", opponentStatus: "agent_finished" });
        this.emitNotice("info", "Opponent's agent finished. Game paused.");
        break;
      case "game_resumed":
        this.updateState({ fen: message.fen, turn: turnFromFen(message.fen), status: "active", opponentStatus: "playing" });
        this.emitNotice("info", "Saved game restored and resumed.");
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
    for (const handler of this.stateHandlers) handler({ ...state });
  }

  private emitNotice(level: TransportNotice["level"], message: string): void {
    for (const handler of this.noticeHandlers) handler({ level, message: this.redact(message) });
  }

  private redact(message: string): string {
    return this.playerToken ? message.split(this.playerToken).join("[redacted]") : message;
  }
}

function turnFromFen(fen: string): PlayerColor {
  return fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
}

function isFen(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const turn = value.trim().split(/\s+/)[1];
  if (turn !== "w" && turn !== "b") return false;
  try {
    parseFenBoard(value);
    return true;
  } catch {
    return false;
  }
}
