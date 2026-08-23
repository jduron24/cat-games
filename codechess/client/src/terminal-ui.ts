import {
  boardIndexToSquare,
  moveBoardCursor,
  screenCoordinatesToSquare,
  squareToBoardIndex,
  type BoardIndex,
} from "./coordinates.js";
import { parseFenBoard } from "./fen.js";
import { renderTerminalView, type RenderedTerminalView } from "./renderer.js";
import { activateSquare, cancelSelection, type SelectionState } from "./selection.js";
import type { GameTransport } from "./transport/game-transport.js";
import type { MockDevelopmentControls } from "./transport/mock-game-transport.js";
import type { GameState, Square } from "./types.js";

export type TerminalMouseData = {
  x: number;
  y: number;
};

export type TerminalEventHandlers = {
  key: (name: string) => void;
  mouse: (name: string, data: TerminalMouseData) => void;
  resize: (width: number, height: number) => void;
};

export interface TerminalAdapter {
  width: number;
  height: number;
  enterFullscreen(): void;
  exitFullscreen(): void;
  hideCursor(): void;
  showCursor(): void;
  enableInput(): void;
  disableInput(): void;
  setEventHandlers(handlers: TerminalEventHandlers): void;
  clearEventHandlers(): void;
  draw(view: RenderedTerminalView): void;
}

export type TerminalChessUIOptions = {
  transport: GameTransport;
  terminal: TerminalAdapter;
  mockControls?: MockDevelopmentControls;
};

export class TerminalChessUI {
  private readonly transport: GameTransport;
  private readonly terminal: TerminalAdapter;
  private readonly mockControls: MockDevelopmentControls | undefined;
  private readonly handlers: TerminalEventHandlers;
  private gameState: GameState | null = null;
  private cursor: BoardIndex = { row: 6, column: 4 };
  private selection: SelectionState = { selectedSquare: null };
  private notice: string | null = null;
  private currentView: RenderedTerminalView | null = null;
  private viewportWidth: number;
  private viewportHeight: number;
  private started = false;
  private stopped = false;
  private resolveRun: (() => void) | null = null;

  constructor(options: TerminalChessUIOptions) {
    this.transport = options.transport;
    this.terminal = options.terminal;
    this.mockControls = options.mockControls;
    this.viewportWidth = options.terminal.width;
    this.viewportHeight = options.terminal.height;
    this.handlers = {
      key: (name) => this.handleKey(name),
      mouse: (name, data) => this.handleMouse(name, data),
      resize: (width, height) => this.handleResize(width, height),
    };

    this.transport.onGameState((state) => this.handleGameState(state));
    this.transport.onNotice((notice) => {
      this.notice = notice.message;
      this.redraw();
    });
  }

  run(): Promise<void> {
    if (this.started) {
      throw new Error("Terminal UI is already running.");
    }

    this.started = true;
    this.stopped = false;

    const running = new Promise<void>((resolve) => {
      this.resolveRun = resolve;
    });

    try {
      this.terminal.enterFullscreen();
      this.terminal.hideCursor();
      this.terminal.setEventHandlers(this.handlers);
      this.terminal.enableInput();
      this.redraw();
    } catch (error) {
      this.stop();
      throw error;
    }

    return running;
  }

  stop(): void {
    if (!this.started || this.stopped) {
      return;
    }

    this.stopped = true;
    const cleanupSteps = [
      () => this.terminal.clearEventHandlers(),
      () => this.terminal.disableInput(),
      () => this.terminal.showCursor(),
      () => this.terminal.exitFullscreen(),
    ];

    for (const cleanupStep of cleanupSteps) {
      try {
        cleanupStep();
      } catch {
        // Terminal restoration is best-effort; one failed capability must not block the others.
      }
    }

    this.resolveRun?.();
    this.resolveRun = null;
  }

  private handleGameState(state: GameState): void {
    const orientationChanged = this.gameState?.playerColor !== state.playerColor;
    this.gameState = { ...state };

    if (orientationChanged) {
      const homeSquare: Square = state.playerColor === "white" ? "e2" : "e7";
      this.cursor = squareToBoardIndex(homeSquare, state.playerColor);
    }

    if (state.status !== "active") {
      this.selection = cancelSelection(this.selection);
    }

    this.redraw();
  }

  private handleKey(name: string): void {
    switch (name) {
      case "q":
      case "Q":
      case "CTRL_C":
        this.stop();
        return;
      case "UP":
        this.cursor = moveBoardCursor(this.cursor, -1, 0);
        break;
      case "DOWN":
        this.cursor = moveBoardCursor(this.cursor, 1, 0);
        break;
      case "LEFT":
        this.cursor = moveBoardCursor(this.cursor, 0, -1);
        break;
      case "RIGHT":
        this.cursor = moveBoardCursor(this.cursor, 0, 1);
        break;
      case "ENTER":
      case "KP_ENTER":
        this.activateCurrentSquare();
        return;
      case "ESCAPE":
        this.selection = cancelSelection(this.selection);
        this.notice = "Selection canceled.";
        break;
      case "p":
        if (this.mockControls) {
          this.mockControls.togglePaused();
          return;
        }
        break;
      case "o":
        if (this.mockControls) {
          this.mockControls.simulateOpponentMove();
          return;
        }
        break;
      case "r":
        if (this.mockControls) {
          this.selection = cancelSelection(this.selection);
          this.mockControls.reset();
          return;
        }
        break;
      case "f":
        if (this.mockControls) {
          this.mockControls.simulateOpponentAgentFinished();
          return;
        }
        break;
      default:
        return;
    }

    this.redraw();
  }

  private handleMouse(name: string, data: TerminalMouseData): void {
    if (name !== "MOUSE_LEFT_BUTTON_PRESSED" || !this.gameState || !this.currentView?.layout) {
      return;
    }

    const square = screenCoordinatesToSquare(
      data.x,
      data.y,
      this.currentView.layout,
      this.gameState.playerColor,
    );
    if (!square) {
      return;
    }

    this.cursor = squareToBoardIndex(square, this.gameState.playerColor);
    this.activateCurrentSquare();
  }

  private handleResize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.redraw();
  }

  private activateCurrentSquare(): void {
    if (!this.gameState) {
      this.notice = "Waiting for a game state.";
      this.redraw();
      return;
    }

    if (this.gameState.status !== "active") {
      this.notice = this.gameState.status === "paused"
        ? "Game is paused."
        : this.gameState.status === "reconnecting"
          ? "Reconnecting. Moves are disabled."
          : "Game is completed.";
      this.redraw();
      return;
    }

    if (this.gameState.turn !== this.gameState.playerColor) {
      this.notice = "Wait for your turn.";
      this.redraw();
      return;
    }

    const square = this.cursorSquare();
    if (this.selection.selectedSquare === null) {
      const board = parseFenBoard(this.gameState.fen);
      const piece = board[square];
      if (!piece || piece.color !== this.gameState.playerColor) {
        this.notice = "Choose one of your pieces.";
        this.redraw();
        return;
      }
    }

    const result = activateSquare(this.selection, square);
    this.selection = result.state;
    this.notice = result.move ? `${result.move.from} → ${result.move.to}` : `${square} selected`;

    if (result.move) {
      this.transport.sendMove(result.move.from, result.move.to);
    }
    this.redraw();
  }

  private cursorSquare(): Square {
    if (!this.gameState) {
      return "e2";
    }
    return boardIndexToSquare(this.cursor.row, this.cursor.column, this.gameState.playerColor);
  }

  private redraw(): void {
    if (!this.started || this.stopped) {
      return;
    }

    this.currentView = renderTerminalView({
      width: this.viewportWidth,
      height: this.viewportHeight,
      gameState: this.gameState,
      cursorSquare: this.gameState ? this.cursorSquare() : null,
      selectedSquare: this.selection.selectedSquare,
      notice: this.notice,
      mockMode: Boolean(this.mockControls),
    });
    this.terminal.draw(this.currentView);
  }
}
