import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runCodexLifecycle,
  type CodexAgentFactory,
} from "../src/lifecycle/codexLifecycle.js";
import type { LifecycleEventSink } from "../src/types.js";

function createSink(order: string[]): {
  sink: LifecycleEventSink;
  activities: string[];
  completions: string[];
  errors: Error[];
} {
  const activities: string[] = [];
  const completions: string[] = [];
  const errors: Error[] = [];
  const sink: LifecycleEventSink = {
    onActivity(message) {
      order.push("activity");
      activities.push(message);
    },
    async onTurnStarted() {
      order.push("waiting");
    },
    async onTurnCompleted(output) {
      order.push("done");
      completions.push(output);
    },
    onError(error) {
      order.push("error");
      errors.push(error);
    },
  };
  return { sink, activities, completions, errors };
}

test("sends waiting immediately before the SDK run and disposes after completion", async () => {
  const order: string[] = [];
  const { sink, activities, completions, errors } = createSink(order);
  const secretPrompt = "SECRET prompt with private source";
  const secretCode = "const PRIVATE_CODE = true";
  const factory: CodexAgentFactory = {
    async create(options) {
      order.push("create");
      assert.equal(options.model.id, "auto");
      assert.equal(options.local.cwd, "/workspace/codechess");
      return {
        async send(prompt) {
          order.push("send");
          assert.equal(prompt, secretPrompt);
          return {
            async *stream() {
              yield {
                type: "assistant",
                message: { content: [{ type: "text", text: secretCode }] },
              };
              yield { type: "thinking", text: secretPrompt };
              yield { type: "tool_call", name: "shell", status: "completed" };
            },
            async wait() {
              order.push("wait");
              return { status: "finished", result: "Final local result" };
            },
          };
        },
        async [Symbol.asyncDispose]() {
          order.push("dispose");
        },
      };
    },
  };

  await runCodexLifecycle({
    prompt: secretPrompt,
    sink,
    cwd: "/workspace/codechess",
    factory,
  });

  assert.deepEqual(order, [
    "create",
    "waiting",
    "send",
    "activity",
    "activity",
    "activity",
    "wait",
    "done",
    "dispose",
  ]);
  assert.equal(completions[0], "Final local result");
  assert.equal(errors.length, 0);
  assert(!activities.join("\n").includes(secretPrompt));
  assert(!activities.join("\n").includes(secretCode));
});

test("sends done and reports a terminal SDK run failure", async () => {
  const order: string[] = [];
  const { sink, completions, errors } = createSink(order);
  const factory: CodexAgentFactory = {
    async create() {
      order.push("create");
      return {
        async send() {
          order.push("send");
          return {
            async *stream() {},
            async wait() {
              order.push("wait");
              return {
                status: "error",
                error: { message: "agent tool failed" },
              };
            },
          };
        },
        async [Symbol.asyncDispose]() {
          order.push("dispose");
        },
      };
    },
  };

  await assert.rejects(
    runCodexLifecycle({ prompt: "run", sink, factory }),
    /Codex run failed: agent tool failed/,
  );

  assert.deepEqual(order, [
    "create",
    "waiting",
    "send",
    "wait",
    "error",
    "done",
    "dispose",
  ]);
  assert.deepEqual(completions, [""]);
  assert.match(errors[0]?.message ?? "", /^Codex run failed:/);
});

test("distinguishes an SDK startup failure from a terminal run failure", async () => {
  const order: string[] = [];
  const { sink, completions, errors } = createSink(order);
  const factory: CodexAgentFactory = {
    async create() {
      order.push("create");
      throw new Error("invalid API key");
    },
  };

  await assert.rejects(
    runCodexLifecycle({ prompt: "run", sink, factory }),
    /Unable to start Codex SDK run: invalid API key/,
  );

  assert.deepEqual(order, ["create", "error"]);
  assert.deepEqual(completions, []);
  assert.match(errors[0]?.message ?? "", /^Unable to start Codex SDK run:/);
});

test("sends done for a cancelled terminal result", async () => {
  const order: string[] = [];
  const { sink, completions, errors } = createSink(order);
  const factory: CodexAgentFactory = {
    async create() {
      order.push("create");
      return {
        async send() {
          order.push("send");
          return {
            async *stream() {},
            async wait() {
              order.push("wait");
              return { status: "cancelled" };
            },
          };
        },
        async [Symbol.asyncDispose]() {
          order.push("dispose");
        },
      };
    },
  };

  await runCodexLifecycle({ prompt: "run", sink, factory });

  assert.deepEqual(order, [
    "create",
    "waiting",
    "send",
    "wait",
    "done",
    "dispose",
  ]);
  assert.deepEqual(completions, [""]);
  assert.deepEqual(errors, []);
});
