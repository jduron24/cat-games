#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCodexLifecycle } from "./lifecycle/codexLifecycle.js";
import { runManualLifecycle } from "./lifecycle/manualLifecycle.js";
import { ConsoleTransport } from "./transport/consoleTransport.js";
import { WebSocketTransport } from "./transport/websocketTransport.js";
import type { AgentTransport, LifecycleEventSink } from "./types.js";

type Environment = Record<string, string | undefined>;

export type AgentCliOptions = {
  help: boolean;
  mode: "manual" | "codex";
  prompt: string;
  wsUrl?: string;
  userId?: string;
};

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected a value after ${option}.`);
  }
  return value;
}

export function parseCliOptions(args: string[], environment: Environment): AgentCliOptions {
  const options: AgentCliOptions = {
    help: false,
    mode: "codex",
    prompt: "",
    wsUrl: environment.CODECHESS_WS_URL,
    userId: environment.CODECHESS_USER_ID,
  };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--mode": {
        const value = readValue(args, index, "--mode");
        if (value !== "manual" && value !== "codex") {
          throw new Error("--mode must be manual or codex.");
        }
        options.mode = value;
        index += 1;
        break;
      }
      case "--prompt":
        options.prompt = readValue(args, index, "--prompt");
        index += 1;
        break;
      case "--ws-url":
        options.wsUrl = readValue(args, index, "--ws-url");
        index += 1;
        break;
      case "--user-id":
        options.userId = readValue(args, index, "--user-id");
        index += 1;
        break;
      default:
        if (argument.startsWith("--")) {
          throw new Error(`Unknown option: ${argument}`);
        }
        positional.push(argument);
    }
  }

  if (!options.prompt && positional.length > 0) {
    options.prompt = positional.join(" ");
  }
  if (!options.help && options.wsUrl && !options.userId?.trim()) {
    throw new Error("WebSocket mode requires a user ID via --user-id or CODECHESS_USER_ID.");
  }

  return options;
}

export const CLI_HELP = `CodeChess agent runner

Usage:
  npm run agent -- --prompt "build the feature"
  npm run agent -- --mode manual --prompt "hello" --ws-url ws://localhost:8080 --user-id alice

Options:
  --prompt <text>       Prompt sent to the agent
  --mode <mode>         codex (default) or manual
  --ws-url <websocket>  CodeChess server URL
  --user-id <id>        Identity shared with the matching terminal UI
  -h, --help            Show this help

Environment:
  CODECHESS_WS_URL
  CODECHESS_USER_ID
`;

function createTransport(options: AgentCliOptions): AgentTransport {
  if (options.wsUrl && options.userId) {
    return new WebSocketTransport({ url: options.wsUrl, userId: options.userId });
  }
  return new ConsoleTransport();
}

export async function main(
  args = process.argv.slice(2),
  environment: Environment = process.env,
): Promise<void> {
  const options = parseCliOptions(args, environment);
  if (options.help) {
    process.stdout.write(CLI_HELP);
    return;
  }
  if (!options.prompt.trim()) {
    throw new Error("A prompt is required via --prompt or positional text.");
  }

  const transport = createTransport(options);
  let completion: Promise<void> = Promise.resolve();

  const sink: LifecycleEventSink = {
    onActivity(message) {
      console.error(message);
    },
    onTurnStarted() {
      completion = transport.send({ type: "waiting" });
    },
    onTurnCompleted(finalOutput) {
      completion = completion.then(() => transport.send({ type: "done" })).then(() => {
        if (finalOutput) {
          process.stdout.write(`${finalOutput}\n`);
        }
      });
    },
    onError(error) {
      console.error(error.message);
    },
  };

  try {
    if (options.mode === "manual") {
      await runManualLifecycle(options.prompt, sink);
    } else {
      await runCodexLifecycle({ prompt: options.prompt, sink });
    }
    await completion;
  } finally {
    await transport.close();
  }
}

const isDirectInvocation =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "");

if (isDirectInvocation) {
  void main().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Unable to run CodeChess agent: ${detail}\n`);
    process.exitCode = 1;
  });
}
