import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { executeCommand } from "../src/app.js";
import { configPath, readConfig, writeConfig } from "../src/config.js";
import type { TerminalSession } from "../src/contracts.js";

test("host, join, and play use the injected terminal runner", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-app-"));
  await writeConfig({ serverUrl: "https://play.test" }, configPath(home));
  const sessions: TerminalSession[] = [];
  let count = 0;
  const api = {
    host: async () => ({ roomCode: "BLUE-CAT7", playerId: "alice", playerToken: "a".repeat(32) }),
    join: async () => ({ roomCode: "BLUE-CAT7", playerId: "bob", playerToken: "b".repeat(32) }),
  };
  const dependencies = {
    home,
    apiFactory: () => api as never,
    runTerminal: async (session: TerminalSession) => {
      count += 1;
      sessions.push(session);
    },
  };
  await executeCommand({ name: "host", displayName: "Alice" }, dependencies);
  assert.equal((await readConfig(configPath(home)))?.playerId, "alice");
  await executeCommand({ name: "join", roomCode: "BLUE-CAT7", displayName: "Bob" }, dependencies);
  await executeCommand({ name: "play" }, dependencies);
  assert.equal(count, 3);
  assert.deepEqual(sessions[2], { websocketUrl: "wss://play.test", playerToken: "b".repeat(32) });
});
