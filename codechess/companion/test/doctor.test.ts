import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configPath, writeConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { hooksPath } from "../src/hooks/installer.js";

test("doctor reports readiness without exposing credentials", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-doctor-"));
  const secret = "private-room-token";
  await writeConfig(
    {
      serverUrl: "https://play.test",
      roomCode: "BLUE-CAT7",
      playerId: "alice",
      playerToken: secret,
    },
    configPath(home),
  );
  await mkdir(join(home, ".cursor"));
  const managed = (action: string) => ({ command: `/node /cli hook ${action} # codechess-managed-v1` });
  await writeFile(
    hooksPath(home),
    JSON.stringify({
      version: 1,
      hooks: {
        beforeSubmitPrompt: [managed("start")],
        afterAgentThought: [managed("heartbeat")],
        stop: [managed("stop")],
      },
    }),
  );
  await chmod(hooksPath(home), 0o600);

  const report = await runDoctor({
    home,
    nodeVersion: "22.13.0",
    terminal: true,
    apiFactory: () => ({ health: async () => true }),
  });
  assert.equal(report.split("\n").filter(Boolean).every((line) => line.startsWith("PASS")), true);
  assert.doesNotMatch(report, new RegExp(secret));
});
