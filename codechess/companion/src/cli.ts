#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export type CliCommand =
  | { name: "help" }
  | { name: "setup"; serverUrl: string }
  | { name: "host"; displayName: string }
  | { name: "join"; roomCode: string; displayName: string }
  | { name: "play" }
  | { name: "doctor" }
  | { name: "uninstall-hooks" }
  | { name: "hook"; action: "start" | "heartbeat" | "stop" };

export function parseCli(args: string[]): CliCommand {
  const [command, ...rest] = args;
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return { name: "help" };
    case "setup":
      return { name: "setup", serverUrl: requirePublicServer(readOption(rest, "--server")) };
    case "host":
      return { name: "host", displayName: readOption(rest, "--name") };
    case "join": {
      const roomCode = rest[0];
      if (!roomCode || roomCode.startsWith("--")) {
        throw new Error("join requires a room code.");
      }
      return {
        name: "join",
        roomCode: roomCode.trim().toUpperCase(),
        displayName: readOption(rest.slice(1), "--name"),
      };
    }
    case "play":
    case "doctor":
    case "uninstall-hooks":
      if (rest.length > 0) {
        throw new Error(`${command} does not accept arguments.`);
      }
      return { name: command };
    case "hook": {
      const action = rest[0];
      if ((action !== "start" && action !== "heartbeat" && action !== "stop") || rest.length !== 1) {
        throw new Error("hook requires start, heartbeat, or stop.");
      }
      return { name: "hook", action };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function readOption(args: string[], option: string): string {
  const index = args.indexOf(option);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value.trim();
}

function requirePublicServer(value: string): string {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("Public CodeChess servers must use HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

export const CLI_HELP = `CodeChess terminal companion

Usage:
  codechess setup --server https://play.codechess.dev
  codechess host --name Alice
  codechess join BLUE-CAT7 --name Bob
  codechess play
  codechess doctor
  codechess uninstall-hooks

Keep host, join, or play open while you work. Normal Codex prompts activate the board.
`;

async function main(): Promise<void> {
  const command = parseCli(process.argv.slice(2));
  if (command.name === "help") {
    process.stdout.write(CLI_HELP);
    return;
  }
  const { executeCommand } = await import("./app.js");
  process.stdout.write(await executeCommand(command));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
