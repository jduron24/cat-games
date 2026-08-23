import { TerminalKitAdapter } from "./terminal-kit-adapter.js";
import { TerminalChessUI } from "./terminal-ui.js";
import { WebSocketGameTransport } from "./transport/websocket-game-transport.js";

export async function runTerminalSession(options: {
  websocketUrl: string;
  playerToken: string;
}): Promise<void> {
  const transport = new WebSocketGameTransport({
    url: options.websocketUrl,
    playerToken: options.playerToken,
  });
  const ui = new TerminalChessUI({ transport, terminal: new TerminalKitAdapter() });
  const stop = (): void => ui.stop();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await transport.connect();
    await ui.run();
  } finally {
    ui.stop();
    transport.disconnect();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
