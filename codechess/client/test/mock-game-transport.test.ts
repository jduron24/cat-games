import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockGameTransport } from "../src/transport/mock-game-transport.js";
import type { GameState } from "../src/types.js";

describe("MockGameTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the opening position with the player as White", async () => {
    const states: GameState[] = [];
    const transport = new MockGameTransport({ opponentDelayMs: 750 });
    transport.onGameState((state) => states.push(state));

    await transport.connect();

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      playerColor: "white",
      turn: "white",
      status: "active",
      opponentStatus: "playing",
    });
    expect(states[0]?.fen).toContain("rnbqkbnr/pppppppp");
  });

  it("applies a player move and responds after the configured delay", async () => {
    const states: GameState[] = [];
    const transport = new MockGameTransport({ opponentDelayMs: 750 });
    transport.onGameState((state) => states.push(state));
    await transport.connect();

    transport.sendMove("e2", "e4");

    expect(states.at(-1)).toMatchObject({
      turn: "black",
      lastMove: { from: "e2", to: "e4" },
    });

    await vi.advanceTimersByTimeAsync(749);
    expect(states.at(-1)?.turn).toBe("black");

    await vi.advanceTimersByTimeAsync(1);
    const response = states.at(-1);
    expect(response?.turn).toBe("white");
    expect(response?.lastMove).toBeDefined();
    expect(response?.lastMove).not.toEqual({ from: "e2", to: "e4" });
    expect(["7", "8"]).toContain(response?.lastMove?.from[1]);
  });

  it("supports pause, resume, agent-finished, and reset controls", async () => {
    const states: GameState[] = [];
    const transport = new MockGameTransport({ opponentDelayMs: 750 });
    transport.onGameState((state) => states.push(state));
    await transport.connect();

    transport.togglePaused();
    expect(states.at(-1)?.status).toBe("paused");

    transport.togglePaused();
    expect(states.at(-1)?.status).toBe("active");

    transport.simulateOpponentAgentFinished();
    expect(states.at(-1)).toMatchObject({
      status: "paused",
      opponentStatus: "agent_finished",
    });

    transport.reset();
    expect(states.at(-1)).toMatchObject({
      status: "active",
      turn: "white",
      opponentStatus: "playing",
      lastMove: undefined,
    });
  });

  it("reports illegal moves without changing the board", async () => {
    const notices: string[] = [];
    const transport = new MockGameTransport();
    transport.onNotice((notice) => notices.push(notice.message));
    await transport.connect();

    transport.sendMove("e2", "e5");

    expect(notices.at(-1)).toMatch(/illegal move/i);
  });
});
