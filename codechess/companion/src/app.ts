import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { CodeChessApiClient, toWebSocketUrl } from "./api-client.js";
import type { CliCommand } from "./cli.js";
import { configPath, readConfig, writeConfig, type CompanionConfig } from "./config.js";
import type { RunTerminal } from "./contracts.js";
import { runDoctor } from "./doctor.js";
import { handleHookActivity } from "./hooks/activity.js";
import { installHooks, uninstallHooks } from "./hooks/installer.js";

export type AppDependencies = {
  home?: string;
  nodePath?: string;
  cliPath?: string;
  runTerminal?: RunTerminal;
  apiFactory?: (url: string) => CodeChessApiClient;
  readStdin?: () => Promise<string>;
};

export async function executeCommand(command: CliCommand, dependencies: AppDependencies = {}): Promise<string> {
  const home = dependencies.home ?? homedir();
  const path = configPath(home);
  const runTerminal = dependencies.runTerminal ?? productionTerminalAdapter;
  const apiFactory = dependencies.apiFactory ?? ((url) => new CodeChessApiClient(url));
  switch (command.name) {
    case "help":
      return "";
    case "setup": {
      const previous = await readConfig(path);
      await writeConfig({ ...(previous ?? {}), serverUrl: command.serverUrl }, path);
      await installHooks({
        home,
        nodePath: dependencies.nodePath ?? process.execPath,
        cliPath: dependencies.cliPath ?? fileURLToPath(new URL("./cli.js", import.meta.url)),
      });
      return "CodeChess configured and Codex hooks installed.\n";
    }
    case "host": {
      const config = await requireConfig(path);
      const room = await apiFactory(config.serverUrl).host(command.displayName);
      const active = { ...config, ...room, displayName: command.displayName };
      await writeConfig(active, path);
      await runTerminal(toSession(active));
      return `Room ${room.roomCode} created. Share this code with your teammate.\n`;
    }
    case "join": {
      const config = await requireConfig(path);
      const room = await apiFactory(config.serverUrl).join(command.roomCode, command.displayName);
      const active = { ...config, ...room, displayName: command.displayName };
      await writeConfig(active, path);
      await runTerminal(toSession(active));
      return `Joined room ${room.roomCode}.\n`;
    }
    case "play": {
      const config = await requireActiveConfig(path);
      await runTerminal(toSession(config));
      return "";
    }
    case "doctor":
      return runDoctor({ home, apiFactory });
    case "uninstall-hooks":
      await uninstallHooks(home);
      return "CodeChess hooks removed.\n";
    case "hook": {
      const input = await (dependencies.readStdin ?? readStandardInput)();
      const diagnostic = await handleHookActivity(command.action, input, { configFile: path });
      if (diagnostic) process.stderr.write(`${diagnostic}\n`);
      return "{}\n";
    }
  }
}

async function requireConfig(path: string): Promise<CompanionConfig> {
  const config = await readConfig(path);
  if (!config) throw new Error("Run `codechess setup --server <url>` first.");
  return config;
}

async function requireActiveConfig(path: string): Promise<CompanionConfig & Required<Pick<CompanionConfig, "playerToken">>> {
  const config = await requireConfig(path);
  if (!config.playerToken) throw new Error("Host or join a room before running play.");
  return config as CompanionConfig & Required<Pick<CompanionConfig, "playerToken">>;
}

function toSession(config: CompanionConfig & Required<Pick<CompanionConfig, "playerToken">>) {
  return { websocketUrl: toWebSocketUrl(config.serverUrl), playerToken: config.playerToken };
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function productionTerminalAdapter(session: Parameters<RunTerminal>[0]): Promise<void> {
  // Kept isolated so the integration lane only needs to replace this adapter
  // with @codechess/client's runTerminalSession public export.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  const client = await dynamicImport("@codechess/client/public-api");
  if (typeof client.runTerminalSession !== "function") {
    throw new Error("Installed CodeChess client does not expose terminal sessions.");
  }
  await (client.runTerminalSession as RunTerminal)(session);
}
