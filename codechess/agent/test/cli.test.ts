import assert from "node:assert/strict";
import test from "node:test";

type ParseCliOptions = (
  args: string[],
  environment: Record<string, string | undefined>,
) => {
  help: boolean;
  mode: "manual" | "codex";
  prompt: string;
  wsUrl?: string;
  userId?: string;
};

const originalArgv = process.argv;
process.argv = ["node", "cli.ts", "--help"];
const cliModule = (await import("../src/cli.js?agent-cli-tests")) as Record<string, unknown>;
process.argv = originalArgv;

test("exports a pure CLI parser for flags and environment values", () => {
  assert.equal(typeof cliModule.parseCliOptions, "function");
  const parseCliOptions = cliModule.parseCliOptions as ParseCliOptions;

  assert.deepEqual(
    parseCliOptions(
      [
        "--mode",
        "manual",
        "--prompt",
        "hello",
        "--ws-url",
        "ws://server:8080",
        "--user-id",
        "alice",
      ],
      {},
    ),
    {
      help: false,
      mode: "manual",
      prompt: "hello",
      wsUrl: "ws://server:8080",
      userId: "alice",
    },
  );
  assert.deepEqual(
    parseCliOptions(["--prompt", "hello"], {
      CODECHESS_WS_URL: "ws://environment:8080",
      CODECHESS_USER_ID: "environment-user",
    }),
    {
      help: false,
      mode: "codex",
      prompt: "hello",
      wsUrl: "ws://environment:8080",
      userId: "environment-user",
    },
  );
});

test("requires a user ID when WebSocket mode is enabled", () => {
  assert.equal(typeof cliModule.parseCliOptions, "function");
  const parseCliOptions = cliModule.parseCliOptions as ParseCliOptions;

  assert.throws(
    () => parseCliOptions(["--ws-url", "ws://localhost:8080", "--prompt", "hello"], {}),
    /user ID/i,
  );
});

test("help documents the shared URL and user identity options", () => {
  assert.equal(typeof cliModule.CLI_HELP, "string");
  const help = cliModule.CLI_HELP as string;
  assert.match(help, /--user-id/);
  assert.match(help, /CODECHESS_WS_URL/);
  assert.match(help, /CODECHESS_USER_ID/);
});
