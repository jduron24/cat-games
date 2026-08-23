import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hooksPath, installHooks, uninstallHooks } from "../src/hooks/installer.js";

test("hook install merges idempotently and uninstall preserves unrelated hooks", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-hooks-"));
  await mkdir(join(home, ".cursor"));
  const unrelated = { command: "/usr/bin/true", timeout: 4 };
  await writeFile(hooksPath(home), JSON.stringify({ version: 1, extra: true, hooks: { stop: [unrelated] } }));
  const cli = join(home, "code chess'cli.js");
  await writeFile(cli, "");
  await chmod(cli, 0o600);

  const options = { home, nodePath: process.execPath, cliPath: cli };
  await installHooks(options);
  await installHooks(options);
  const installed = JSON.parse(await readFile(hooksPath(home), "utf8"));
  for (const event of ["beforeSubmitPrompt", "afterAgentThought", "stop"]) {
    const managed = installed.hooks[event].filter(
      (entry: Record<string, unknown>) => String(entry.command).includes("# codechess-managed-v1"),
    );
    assert.equal(managed.length, 1);
    assert.equal(managed[0].timeout, 2);
    assert.equal(managed[0].failClosed, false);
    assert.match(managed[0].command, /^'\//);
  }
  assert.deepEqual(installed.hooks.stop[0], unrelated);

  await uninstallHooks(home);
  const removed = JSON.parse(await readFile(hooksPath(home), "utf8"));
  assert.deepEqual(removed.hooks.stop, [unrelated]);
  assert.deepEqual(removed.hooks.beforeSubmitPrompt, []);
});

test("hook install refuses malformed existing event data", async () => {
  const home = await mkdtemp(join(tmpdir(), "codechess-hooks-invalid-"));
  await mkdir(join(home, ".cursor"));
  await writeFile(hooksPath(home), JSON.stringify({ version: 1, hooks: { stop: { command: "keep-me" } } }));
  const cli = join(home, "cli.js");
  await writeFile(cli, "");
  await chmod(cli, 0o600);

  await assert.rejects(
    installHooks({ home, nodePath: process.execPath, cliPath: cli }),
    /invalid hook event/,
  );
  const preserved = JSON.parse(await readFile(hooksPath(home), "utf8"));
  assert.deepEqual(preserved.hooks.stop, { command: "keep-me" });
});
