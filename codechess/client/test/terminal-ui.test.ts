import { describe, expect, it, vi } from "vitest";

import {
  TerminalChessUI,
  type TerminalAdapter,
  type TerminalEventHandlers,
} from "../src/terminal-ui.js";
import type { RenderedTerminalView } from "../src/renderer.js";
import type { GameTransport, TransportNotice } from "../src/transport/game-transport.js";
import type { MockDevelopmentControls } from "../src/transport/mock-game-transport.js";
import type { GameState, Square } from "../src/types.js";

const STARTING_STATE: GameState = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playerColor: "white",
  turn: "white",
  status: "active",
  opponentStatus: "playing",
};

class FakeTransport implements GameTransport {
  moves: Array<{ from: Square; to: Square }> = [];
  private stateHandler: ((state: GameState) => void) | null = null;

  async connect(): Promise<void> {}

  sendMove(from: Square, to: Square): void {
    this.moves.push({ from, to });
  }

  onGameState(handler: (state: GameState) => void): void {
    this.stateHandler = handler;
  }

  onNotice(_handler: (notice: TransportNotice) => void): void {}

  disconnect(): void {}

  emitState(state: GameState): void {
    this.stateHandler?.(state);
  }
}

class FakeTerminal implements TerminalAdapter {
  width = 90;
  height = 30;
  enteredFullscreen = 0;
  exitedFullscreen = 0;
  hiddenCursor = 0;
  shownCursor = 0;
  enabledInput = 0;
  disabledInput = 0;
  draws = 0;
  lastView: RenderedTerminalView | null = null;
  handlers: TerminalEventHandlers | null = null;

  enterFullscreen(): void {
    this.enteredFullscreen += 1;
  }
  exitFullscreen(): void {
    this.exitedFullscreen += 1;
  }
  hideCursor(): void {
    this.hiddenCursor += 1;
  }
  showCursor(): void {
    this.shownCursor += 1;
  }
  enableInput(): void {
    this.enabledInput += 1;
  }
  disableInput(): void {
    this.disabledInput += 1;
  }
  setEventHandlers(handlers: TerminalEventHandlers): void {
    this.handlers = handlers;
  }
  clearEventHandlers(): void {
    this.handlers = null;
  }
  draw(view: RenderedTerminalView): void {
    this.draws += 1;
    this.lastView = view;
  }
}

class ThrowingCleanupTerminal extends FakeTerminal {
  cleanupCalls: string[] = [];

  override clearEventHandlers(): void {
    this.cleanupCalls.push("clearEventHandlers");
    throw new Error("clear failed");
  }

  override disableInput(): void {
    this.cleanupCalls.push("disableInput");
    throw new Error("disable failed");
  }

  override showCursor(): void {
    this.cleanupCalls.push("showCursor");
    throw new Error("cursor failed");
  }

  override exitFullscreen(): void {
    this.cleanupCalls.push("exitFullscreen");
    throw new Error("fullscreen failed");
  }
}

describe("TerminalChessUI", () => {
  it("submits e2/e4 with Enter and arrow keys, then cleans up on q", async () => {
    const transport = new FakeTransport();
    const terminal = new FakeTerminal();
    const ui = new TerminalChessUI({ transport, terminal });
    transport.emitState(STARTING_STATE);

    const running = ui.run();
    terminal.handlers?.key("ENTER");
    terminal.handlers?.key("UP");
    terminal.handlers?.key("UP");
    terminal.handlers?.key("ENTER");

    expect(transport.moves).toEqual([{ from: "e2", to: "e4" }]);

    terminal.handlers?.key("q");
    await running;

    expect(terminal.enteredFullscreen).toBe(1);
    expect(terminal.enabledInput).toBe(1);
    expect(terminal.disabledInput).toBe(1);
    expect(terminal.shownCursor).toBe(1);
    expect(terminal.exitedFullscreen).toBe(1);
  });

  it("submits e2/e4 through click-to-move", async () => {
    const transport = new FakeTransport();
    const terminal = new FakeTerminal();
    const ui = new TerminalChessUI({ transport, terminal });
    transport.emitState(STARTING_STATE);

    const running = ui.run();
    // At 90x30 the board begins at x=26, y=11.
    terminal.handlers?.mouse("MOUSE_LEFT_BUTTON_PRESSED", { x: 46, y: 17 });
    terminal.handlers?.mouse("MOUSE_LEFT_BUTTON_PRESSED", { x: 46, y: 15 });

    expect(transport.moves).toEqual([{ from: "e2", to: "e4" }]);

    ui.stop();
    await running;
  });

  it("exposes development keys only when mock controls are injected", async () => {
    const transport = new FakeTransport();
    const terminal = new FakeTerminal();
    const controls: MockDevelopmentControls = {
      togglePaused: vi.fn(),
      simulateOpponentMove: vi.fn(),
      reset: vi.fn(),
      simulateOpponentAgentFinished: vi.fn(),
    };
    const ui = new TerminalChessUI({ transport, terminal, mockControls: controls });
    transport.emitState(STARTING_STATE);

    const running = ui.run();
    terminal.handlers?.key("p");
    terminal.handlers?.key("o");
    terminal.handlers?.key("r");
    terminal.handlers?.key("f");

    expect(controls.togglePaused).toHaveBeenCalledOnce();
    expect(controls.simulateOpponentMove).toHaveBeenCalledOnce();
    expect(controls.reset).toHaveBeenCalledOnce();
    expect(controls.simulateOpponentAgentFinished).toHaveBeenCalledOnce();

    ui.stop();
    ui.stop();
    await running;
    expect(terminal.disabledInput).toBe(1);
  });

  it("attempts every restoration step when earlier cleanup operations fail", async () => {
    const transport = new FakeTransport();
    const terminal = new ThrowingCleanupTerminal();
    const ui = new TerminalChessUI({ transport, terminal });
    transport.emitState(STARTING_STATE);

    const running = ui.run();

    expect(() => ui.stop()).not.toThrow();
    await running;
    expect(terminal.cleanupCalls).toEqual([
      "clearEventHandlers",
      "disableInput",
      "showCursor",
      "exitFullscreen",
    ]);
  });

  it("explains that input is disabled after the game completes", async () => {
    const transport = new FakeTransport();
    const terminal = new FakeTerminal();
    const ui = new TerminalChessUI({ transport, terminal });
    transport.emitState({ ...STARTING_STATE, status: "completed" });

    const running = ui.run();
    terminal.handlers?.key("ENTER");

    const plainView = terminal.lastView?.lines
      .join("\n")
      .replace(/\u001b\[[0-9;]*m/g, "");
    expect(plainView).toContain("Game is completed.");
    expect(transport.moves).toHaveLength(0);

    ui.stop();
    await running;
  });
});
