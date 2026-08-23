import { Chess, type Square as ChessSquare } from "chess.js";

import type { GameState, Square } from "../types.js";
import type { GameTransport, TransportNotice } from "./game-transport.js";

export type MockGameTransportOptions = {
  opponentDelayMs?: number;
};

export interface MockDevelopmentControls {
  togglePaused(): void;
  simulateOpponentMove(): void;
  reset(): void;
  simulateOpponentAgentFinished(): void;
}

export class MockGameTransport implements GameTransport, MockDevelopmentControls {
  private readonly chess = new Chess();
  private readonly opponentDelayMs: number;
  private readonly stateHandlers = new Set<(state: GameState) => void>();
  private readonly noticeHandlers = new Set<(notice: TransportNotice) => void>();
  private opponentTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private status: GameState["status"] = "active";
  private opponentStatus: GameState["opponentStatus"] = "playing";
  private lastMove: GameState["lastMove"];

  constructor(options: MockGameTransportOptions = {}) {
    this.opponentDelayMs = options.opponentDelayMs ?? 700;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emitState();
  }

  sendMove(from: Square, to: Square): void {
    if (!this.connected) {
      this.emitNotice("error", "Mock transport is not connected.");
      return;
    }

    if (this.status !== "active") {
      this.emitNotice("error", "Game is paused. Press p to resume.");
      return;
    }

    if (this.chess.turn() !== "w") {
      this.emitNotice("error", "Wait for the opponent's move.");
      return;
    }

    try {
      this.chess.move({
        from: from as ChessSquare,
        to: to as ChessSquare,
        promotion: "q",
      });
    } catch {
      this.emitNotice("error", `Illegal move in mock game: ${from} → ${to}`);
      return;
    }

    this.lastMove = { from, to };
    this.status = this.chess.isGameOver() ? "completed" : "active";
    this.emitState();

    if (this.status === "active") {
      this.scheduleOpponentMove();
    }
  }

  onGameState(handler: (state: GameState) => void): void {
    this.stateHandlers.add(handler);
  }

  onNotice(handler: (notice: TransportNotice) => void): void {
    this.noticeHandlers.add(handler);
  }

  disconnect(): void {
    this.connected = false;
    this.clearOpponentTimer();
  }

  togglePaused(): void {
    if (this.status === "completed") {
      this.emitNotice("info", "Reset the completed game before resuming.");
      return;
    }

    this.status = this.status === "paused" ? "active" : "paused";
    this.opponentStatus = this.status === "paused" ? "waiting" : "playing";

    if (this.status === "paused") {
      this.clearOpponentTimer();
    } else if (this.chess.turn() === "b") {
      this.scheduleOpponentMove();
    }

    this.emitState();
    this.emitNotice("info", this.status === "paused" ? "Mock game paused." : "Mock game resumed.");
  }

  simulateOpponentMove(): void {
    if (this.status !== "active") {
      this.emitNotice("error", "Resume the mock game before simulating a move.");
      return;
    }

    if (this.chess.turn() !== "b") {
      this.emitNotice("info", "The mock opponent can move only on Black's turn.");
      return;
    }

    this.clearOpponentTimer();
    this.applyOpponentMove();
  }

  reset(): void {
    this.clearOpponentTimer();
    this.chess.reset();
    this.status = "active";
    this.opponentStatus = "playing";
    this.lastMove = undefined;
    this.emitState();
    this.emitNotice("info", "Mock game reset.");
  }

  simulateOpponentAgentFinished(): void {
    this.clearOpponentTimer();
    this.status = "paused";
    this.opponentStatus = "agent_finished";
    this.emitState();
    this.emitNotice("info", "Opponent's agent finished. Game paused.");
  }

  private scheduleOpponentMove(): void {
    this.clearOpponentTimer();
    this.opponentTimer = setTimeout(() => this.applyOpponentMove(), this.opponentDelayMs);
  }

  private applyOpponentMove(): void {
    if (!this.connected || this.status !== "active" || this.chess.turn() !== "b") {
      return;
    }

    const move = this.chess.moves({ verbose: true })[0];
    if (!move) {
      this.status = "completed";
      this.emitState();
      return;
    }

    this.chess.move(move);
    this.lastMove = {
      from: move.from as Square,
      to: move.to as Square,
    };
    this.status = this.chess.isGameOver() ? "completed" : "active";
    this.emitState();
  }

  private clearOpponentTimer(): void {
    if (this.opponentTimer !== null) {
      clearTimeout(this.opponentTimer);
      this.opponentTimer = null;
    }
  }

  private emitState(): void {
    const state: GameState = {
      fen: this.chess.fen(),
      playerColor: "white",
      turn: this.chess.turn() === "w" ? "white" : "black",
      status: this.status,
      opponentStatus: this.opponentStatus,
      lastMove: this.lastMove ? { ...this.lastMove } : undefined,
    };

    for (const handler of this.stateHandlers) {
      handler({ ...state, lastMove: state.lastMove ? { ...state.lastMove } : undefined });
    }
  }

  private emitNotice(level: TransportNotice["level"], message: string): void {
    for (const handler of this.noticeHandlers) {
      handler({ level, message });
    }
  }
}
