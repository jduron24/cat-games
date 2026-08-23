import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configPath, writeConfig } from "../src/config.js";
import { deriveActivityId, handleHookActivity } from "../src/hooks/activity.js";

test("hook activity is stable and throttles heartbeats across invocations", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-activity-"));
  const path = configPath(home);
  await writeConfig({ serverUrl: "https://play.test", playerId: "alice", playerToken: "secret" }, path);
  const calls: string[] = [];
  const dependencies = {
    configFile: path,
    now: () => 50_000,
    postActivity: async (_url: string, _token: string, activityId: string, action: string) => {
      calls.push(`${activityId}:${action}`);
    },
  };
  const input = JSON.stringify({ task_id: "task-123", prompt: "never send me" });
  assert.equal(await handleHookActivity("start", input, dependencies), null);
  assert.equal(await handleHookActivity("heartbeat", input, dependencies), null);
  assert.equal(await handleHookActivity("heartbeat", input, dependencies), null);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.split(":")[0], deriveActivityId({ task_id: "task-123" }, "alice"));
});

test("hook failures fail open without exposing configuration secrets", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-activity-"));
  const path = configPath(home);
  const token = "do-not-print-this-token";
  await writeConfig({ serverUrl: "https://play.test", playerId: "alice", playerToken: token }, path);
  const diagnostic = await handleHookActivity("start", "{}", {
    configFile: path,
    postActivity: async () => {
      throw new Error(`network rejected ${token}`);
    },
  });
  assert.match(diagnostic ?? "", /continuing normally/);
  assert.doesNotMatch(diagnostic ?? "", new RegExp(token));
  assert.match((await handleHookActivity("start", "not json", { configFile: path })) ?? "", /invalid input/);
});
