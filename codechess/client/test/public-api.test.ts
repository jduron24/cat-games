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

  it("disconnects a pending transport connection when the process is interrupted", async () => {
    let rejectConnect: ((error: Error) => void) | undefined;
    fakes.connect.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectConnect = reject;
        }),
    );
    const signalHandlers = new Map<string, (...args: unknown[]) => void>();
    const onceSpy = vi.spyOn(process, "once").mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
      signalHandlers.set(event, listener);
      return process;
    }) as typeof process.once);
    const removeListenerSpy = vi
      .spyOn(process, "removeListener")
      .mockImplementation((() => process) as typeof process.removeListener);

    const session = runTerminalSession({
      websocketUrl: "wss://play.example.test/ws",
      playerToken: "secret-player-token-that-is-long-enough",
    });
    await Promise.resolve();
    signalHandlers.get("SIGINT")?.();
    const disconnectedOnSignal = fakes.disconnect.mock.calls.length > 0;
    rejectConnect?.(new Error("connection cancelled"));

    await expect(session).rejects.toThrow(/cancelled/i);
    expect(disconnectedOnSignal).toBe(true);
    expect(fakes.stop).toHaveBeenCalled();

    onceSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

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
