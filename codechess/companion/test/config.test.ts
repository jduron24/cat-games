import assert from "node:assert/strict";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configPath, readConfig, writeConfig } from "../src/config.js";

test("config writes atomically with private permissions", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-config-"));
  const path = configPath(home);
  await writeConfig({ serverUrl: "https://play.test", playerToken: "secret-token" }, path);
  assert.deepEqual(await readConfig(path), {
    serverUrl: "https://play.test",
    playerToken: "secret-token",
  });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(join(home, ".codechess")), ["config.json"]);
});
