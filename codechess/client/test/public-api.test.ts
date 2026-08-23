import { afterEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(),
  run: vi.fn(async () => {}),
  stop: vi.fn(),
  transportOptions: null as unknown,
}));

vi.mock("../src/transport/websocket-game-transport.js", () => ({
  WebSocketGameTransport: class {
    constructor(options: unknown) {
      fakes.transportOptions = options;
    }
    connect = fakes.connect;
    disconnect = fakes.disconnect;
    sendMove() {}
    onGameState() {}
    onNotice() {}
  },
}));

vi.mock("../src/terminal-kit-adapter.js", () => ({
  TerminalKitAdapter: class {},
}));

vi.mock("../src/terminal-ui.js", () => ({
  TerminalChessUI: class {
    run = fakes.run;
    stop = fakes.stop;
  },
}));

import { runTerminalSession } from "../src/public-api.js";

describe("runTerminalSession", () => {
  afterEach(() => vi.clearAllMocks());

  it("authenticates, runs, and always restores the terminal session", async () => {
    await runTerminalSession({
      websocketUrl: "wss://play.example.test/ws",
      playerToken: "secret-player-token-that-is-long-enough",
    });

    expect(fakes.transportOptions).toEqual({
      url: "wss://play.example.test/ws",
      playerToken: "secret-player-token-that-is-long-enough",
    });
    expect(fakes.connect).toHaveBeenCalledOnce();
    expect(fakes.run).toHaveBeenCalledOnce();
    expect(fakes.stop).toHaveBeenCalledOnce();
    expect(fakes.disconnect).toHaveBeenCalledOnce();
  });
});
