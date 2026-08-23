import { CLI_HELP, parseCliOptions } from "./cli.js";
import { TerminalKitAdapter } from "./terminal-kit-adapter.js";
import { TerminalChessUI } from "./terminal-ui.js";
import type { GameTransport } from "./transport/game-transport.js";
import { MockGameTransport } from "./transport/mock-game-transport.js";
import { WebSocketGameTransport } from "./transport/websocket-game-transport.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  if (options.help) {
    process.stdout.write(CLI_HELP);
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CodeChess requires an interactive terminal (TTY).");
  }

  const transport: GameTransport = options.mock
    ? new MockGameTransport()
    : new WebSocketGameTransport({ url: options.url, userId: options.userId });
  const mockTransport = options.mock ? (transport as MockGameTransport) : undefined;
  const terminal = new TerminalKitAdapter();
  const ui = new TerminalChessUI({
    transport,
    terminal,
    mockControls: mockTransport,
  });
  let shuttingDown = false;

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    ui.stop();
    transport.disconnect();
    process.exitCode = exitCode;
  };

  const handleSigint = (): void => shutdown(130);
  const handleSigterm = (): void => shutdown(143);
  const handleFatal = (error: unknown): void => {
    shutdown(1);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`CodeChess stopped after an unexpected error:\n${detail}\n`);
  };

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  process.once("uncaughtException", handleFatal);
  process.once("unhandledRejection", handleFatal);

  try {
    await transport.connect();
    if (!shuttingDown) {
      await ui.run();
    }
  } finally {
    ui.stop();
    transport.disconnect();
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    process.removeListener("uncaughtException", handleFatal);
    process.removeListener("unhandledRejection", handleFatal);
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to start CodeChess: ${detail}\n`);
  process.exitCode = 1;
});
