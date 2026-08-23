import assert from "node:assert/strict";
import test from "node:test";

import { parseCli } from "../src/cli.js";

test("parses setup, room, play, and maintenance commands", () => {
  assert.deepEqual(parseCli(["setup", "--server", "https://play.example.test"]), {
    name: "setup",
    serverUrl: "https://play.example.test",
  });
  assert.deepEqual(parseCli(["host", "--name", "Alice"]), {
    name: "host",
    displayName: "Alice",
  });
  assert.deepEqual(parseCli(["join", "blue-cat7", "--name", "Bob"]), {
    name: "join",
    roomCode: "BLUE-CAT7",
    displayName: "Bob",
  });
  assert.deepEqual(parseCli(["play"]), { name: "play" });
  assert.deepEqual(parseCli(["doctor"]), { name: "doctor" });
  assert.deepEqual(parseCli(["uninstall-hooks"]), { name: "uninstall-hooks" });
});

test("requires HTTPS except for loopback development", () => {
  assert.throws(
    () => parseCli(["setup", "--server", "http://play.example.test"]),
    /must use HTTPS/,
  );
  assert.deepEqual(parseCli(["setup", "--server", "http://localhost:8080"]), {
    name: "setup",
    serverUrl: "http://localhost:8080",
  });
});
