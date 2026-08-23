import { Agent } from "@cursor/sdk";

import type { LifecycleEventSink } from "../types.js";

type CodexAgentOptions = {
  model: { id: string };
  local: { cwd: string };
};

type CodexRunResult = {
  status: "finished" | "error" | "cancelled";
  result?: string;
  error?: { message: string };
};

type CodexRun = {
  stream(): AsyncIterable<unknown>;
  wait(): Promise<CodexRunResult>;
};

type CodexAgent = {
  send(prompt: string): Promise<CodexRun>;
  [Symbol.asyncDispose](): Promise<void>;
};

export type CodexAgentFactory = {
  create(options: CodexAgentOptions): Promise<CodexAgent>;
};

export interface CodexLifecycleOptions {
  prompt: string;
  sink: LifecycleEventSink;
  cwd?: string;
  factory?: CodexAgentFactory;
}

class CodexLifecycleFailure extends Error {
  constructor(
    readonly phase: "startup" | "run",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "CodexLifecycleFailure";
  }
}

const defaultFactory: CodexAgentFactory = {
  create: (options) => Agent.create(options),
};

function errorDetail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function publishActivity(event: unknown, sink: LifecycleEventSink): void {
  if (!event || typeof event !== "object" || !("type" in event)) {
    return;
  }

  switch (event.type) {
    case "assistant":
      sink.onActivity("Codex: generating response");
      break;
    case "thinking":
      sink.onActivity("Codex: reasoning");
      break;
    case "tool_call":
      sink.onActivity("Codex: using a tool");
      break;
    case "status":
      sink.onActivity("Codex: status changed");
      break;
  }
}

export async function runCodexLifecycle({
  prompt,
  sink,
  cwd = process.cwd(),
  factory = defaultFactory,
}: CodexLifecycleOptions): Promise<void> {
  let agent: CodexAgent | undefined;
  let runStarted = false;
  let terminalResultReceived = false;

  try {
    agent = await factory.create({
      model: { id: "auto" },
      local: { cwd },
    });

    await sink.onTurnStarted();
    const run = await agent.send(prompt);
    runStarted = true;

    let streamFailure: unknown;
    try {
      for await (const event of run.stream()) {
        publishActivity(event, sink);
      }
    } catch (cause) {
      streamFailure = cause;
    }

    const result = await run.wait();
    terminalResultReceived = true;
    if (streamFailure) {
      sink.onError(
        new Error(`Codex activity stream failed: ${errorDetail(streamFailure)}`, {
          cause: streamFailure,
        }),
      );
    }
    if (result.status === "error") {
      throw new CodexLifecycleFailure(
        "run",
        `Codex run failed: ${result.error?.message ?? "unknown SDK error"}`,
      );
    }
    if (result.status === "cancelled") {
      throw new CodexLifecycleFailure("run", "Codex run cancelled.");
    }

    await sink.onTurnCompleted(result.result?.trim() ?? "");
  } catch (cause) {
    const failure =
      cause instanceof CodexLifecycleFailure
        ? cause
        : new CodexLifecycleFailure(
            runStarted ? "run" : "startup",
            `${runStarted ? "Codex run failed" : "Unable to start Codex SDK run"}: ${errorDetail(cause)}`,
            cause,
          );

    sink.onError(failure);
    if (failure.phase === "run" && terminalResultReceived) {
      await sink.onTurnCompleted("");
    }
    throw failure;
  } finally {
    await agent?.[Symbol.asyncDispose]();
  }
}
