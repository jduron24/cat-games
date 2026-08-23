import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createCodeChessServer, type CodeChessServer } from "../src/server.js";

let server: CodeChessServer;
let baseUrl: string;

before(async () => {
  server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => server.close());

test("public HTTP API supports health, room creation, join, and activity", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const created = await fetch(`${baseUrl}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Alice" }),
  });
  assert.equal(created.status, 201);
  const alice = (await created.json()) as Record<string, string>;
  assert.match(alice.roomCode ?? "", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const joined = await fetch(`${baseUrl}/v1/rooms/${alice.roomCode}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Bob" }),
  });
  assert.equal(joined.status, 200);

  const activity = await fetch(`${baseUrl}/v1/activity`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${alice.playerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ activityId: "task-a", action: "start" }),
  });
  assert.equal(activity.status, 204);
});

test("public HTTP API rejects invalid auth and oversized JSON", async () => {
  const unauthorized = await fetch(`${baseUrl}/v1/activity`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${"x".repeat(43)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ activityId: "task-a", action: "start" }),
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), {
    error: { code: "TOKEN_INVALID", message: "Invalid player token" },
  });

  const oversized = await fetch(`${baseUrl}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "A", padding: "x".repeat(17_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(((await oversized.json()) as { error: { code: string } }).error.code, "BODY_TOO_LARGE");
});
