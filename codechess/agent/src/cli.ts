#!/usr/bin/env node
import { ConsoleTransport } from "./transport/consoleTransport.js";
import { WebSocketTransport } from "./transport/websocketTransport.js";
import { runCodexLifecycle } from "./lifecycle/codexLifecycle.js";
import { runManualLifecycle } from "./lifecycle/manualLifecycle.js";
import type { AgentTransport, LifecycleEventSink } from "./types.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (current.startsWith("--")) {
      const [key, inlineValue] = current.slice(2).split("=", 2);
      if (inlineValue !== undefined) {
        args.set(key, inlineValue);
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args.set(key, argv[i + 1]);
        i += 1;
      } else {
        args.set(key, true);
      }
    }
  }
  return args;
}

async function createTransport(args: Map<string, string | boolean>): Promise<AgentTransport> {
  const url = args.get("ws-url");
  if (typeof url === "string" && url.length > 0) {
    return new WebSocketTransport(url);
  }
  return new ConsoleTransport();
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.has("help") || args.has("h")) {
    process.stdout.write("Usage: codechess --prompt \"...\" [--mode manual] [--ws-url ws://localhost:1234]\n");
    return;
  }

  const prompt = typeof args.get("prompt") === "string" ? String(args.get("prompt")) : process.argv.slice(2).join(" ");
  const mode = args.get("mode");
  const transport = await createTransport(args);
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
    }
  };

  try {
    if (mode === "manual") {
      await runManualLifecycle(prompt, sink);
    } else {
      await runCodexLifecycle({ prompt, sink });
    }
    await completion;
  } finally {
    await transport.close();
  }
}

void main();
