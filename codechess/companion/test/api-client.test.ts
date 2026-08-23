import assert from "node:assert/strict";
import test from "node:test";

import { CodeChessApiClient, toWebSocketUrl } from "../src/api-client.js";

const room = { roomCode: "BLUE-CAT7", playerId: "alice", playerToken: "x".repeat(32) };

test("room API hosts and joins through the contract", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(room), { status: calls.length === 1 ? 201 : 200 });
  }) as typeof fetch;
  const api = new CodeChessApiClient("https://play.test", fakeFetch);
  assert.deepEqual(await api.host("Alice"), room);
  assert.deepEqual(await api.join("BLUE-CAT7", "Bob"), room);
  assert.equal(calls[0]?.url, "https://play.test/v1/rooms");
  assert.equal(calls[1]?.url, "https://play.test/v1/rooms/BLUE-CAT7/join");
  assert.deepEqual(calls[1]?.body, { roomCode: "BLUE-CAT7", displayName: "Bob" });
  assert.equal(toWebSocketUrl("https://play.test"), "wss://play.test");
});

test("room API enforces its deadline", async () => {
  const fakeFetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      setTimeout(() => reject(new Error("request did not abort")), 50);
    })) as typeof fetch;
  await assert.rejects(new CodeChessApiClient("https://play.test", fakeFetch, 5).host("Alice"));
});
