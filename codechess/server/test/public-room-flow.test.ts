import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket, type RawData } from "ws";

import { createCodeChessServer } from "../src/server.js";

async function waitForMessage(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 1_000);
    const onMessage = (data: RawData): void => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === type) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(message);
      }
    };
    socket.on("message", onMessage);
  });
}

async function connect(url: string, token: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const ack = waitForMessage(socket, "room_hello_ack");
  socket.send(JSON.stringify({ type: "room_hello", playerToken: token }));
  await ack;
  return socket;
}

test("public room activity starts, pauses, and resumes the saved chess game", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsUrl = `ws://127.0.0.1:${address.port}`;

  const post = (path: string, body: unknown, token?: string) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  try {
    const alice = await (await post("/v1/rooms", { displayName: "Alice" })).json() as Record<string, string>;
    const bob = await (await post(`/v1/rooms/${alice.roomCode}/join`, { displayName: "Bob" })).json() as Record<string, string>;
    const aliceSocket = await connect(wsUrl, alice.playerToken!);
    const bobSocket = await connect(wsUrl, bob.playerToken!);

    const aliceMatch = waitForMessage(aliceSocket, "match_found");
    const bobMatch = waitForMessage(bobSocket, "match_found");
    await post("/v1/activity", { activityId: "alice-task", action: "start" }, alice.playerToken);
    await post("/v1/activity", { activityId: "bob-task", action: "start" }, bob.playerToken);
    const [aliceMatched, bobMatched] = await Promise.all([aliceMatch, bobMatch]);
    assert.notEqual(aliceMatched.color, bobMatched.color);

    const white = aliceMatched.color === "white" ? aliceSocket : bobSocket;
    const aliceMove = waitForMessage(aliceSocket, "move_accepted");
    const bobMove = waitForMessage(bobSocket, "move_accepted");
    white.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
    const [saved] = await Promise.all([aliceMove, bobMove]);

    const alicePaused = waitForMessage(aliceSocket, "game_paused");
    const bobPaused = waitForMessage(bobSocket, "game_paused");
    await post("/v1/activity", { activityId: "bob-task", action: "stop" }, bob.playerToken);
    await Promise.all([alicePaused, bobPaused]);

    const aliceResumed = waitForMessage(aliceSocket, "game_resumed");
    const bobResumed = waitForMessage(bobSocket, "game_resumed");
    await post("/v1/activity", { activityId: "bob-task", action: "start" }, bob.playerToken);
    const resumed = await Promise.all([aliceResumed, bobResumed]);
    assert.equal(resumed[0]?.fen, saved.fen);
    assert.equal(resumed[1]?.fen, saved.fen);

    const room = server.roomStore.getRoom(alice.roomCode!);
    assert(room?.currentGameId);
    const completedGameId = room.currentGameId;
    const completedGame = server.games.get(completedGameId);
    assert(completedGame);
    completedGame.status = "COMPLETED";
    server.roomStore.clearRoomActivities(room.code);

    const aliceRematch = waitForMessage(aliceSocket, "match_found");
    const bobRematch = waitForMessage(bobSocket, "match_found");
    await post("/v1/activity", { activityId: "alice-rematch", action: "start" }, alice.playerToken);
    await post("/v1/activity", { activityId: "bob-rematch", action: "start" }, bob.playerToken);
    const rematch = await Promise.all([aliceRematch, bobRematch]);
    assert.notEqual(rematch[0]?.gameId, completedGameId);
    assert.equal(rematch[0]?.gameId, rematch[1]?.gameId);
    assert.equal(server.games.has(completedGameId), false);

    aliceSocket.close();
    bobSocket.close();
  } finally {
    await server.close();
  }
});

test("production mode rejects legacy hello before it can claim a public player id", async () => {
  const server = createCodeChessServer(0, { allowLegacyProtocol: false });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const created = await fetch(`${baseUrl}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Alice" }),
  });
  const alice = await created.json() as Record<string, string>;
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => socket.once("open", resolve));

  try {
    const rejection = waitForMessage(socket, "error");
    socket.send(JSON.stringify({ type: "hello", userId: alice.playerId, role: "ui" }));
    assert.match(String((await rejection).reason), /legacy protocol is disabled/i);
    assert.equal(server.users.has(alice.playerId!), false);
  } finally {
    socket.close();
    await server.close();
  }
});

test("legacy mode cannot claim an id reserved by a public room", async () => {
  const server = createCodeChessServer(0, { allowLegacyProtocol: true });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const created = await fetch(`${baseUrl}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Alice" }),
  });
  const alice = await created.json() as Record<string, string>;
  const publicSocket = await connect(`ws://127.0.0.1:${address.port}`, alice.playerToken!);
  const originalSocket = server.users.get(alice.playerId!)?.uiSocket;
  const legacySocket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => legacySocket.once("open", resolve));

  try {
    const rejection = waitForMessage(legacySocket, "error");
    legacySocket.send(JSON.stringify({ type: "hello", userId: alice.playerId, role: "ui" }));
    assert.match(String((await rejection).reason), /reserved/i);
    assert.equal(server.users.get(alice.playerId!)?.uiSocket, originalSocket);
  } finally {
    publicSocket.close();
    legacySocket.close();
    await server.close();
  }
});

test("closes sockets that do not authenticate before the handshake deadline", async () => {
  const server = createCodeChessServer(0, { handshakeMs: 20, pingMs: 60_000 });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => socket.once("open", resolve));

  try {
    const closed = new Promise<number>((resolve) => socket.once("close", resolve));
    assert.equal(await closed, 4008);
  } finally {
    await server.close();
  }
});

test("rejects websocket payloads above the configured limit", async () => {
  const server = createCodeChessServer(0, {
    maxPayloadBytes: 64,
    handshakeMs: 1_000,
    pingMs: 60_000,
  });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => socket.once("open", resolve));

  try {
    const closed = new Promise<number>((resolve) => socket.once("close", resolve));
    socket.send("x".repeat(65));
    assert.equal(await closed, 1009);
  } finally {
    await server.close();
  }
});

test("terminates a websocket that does not prove liveness with pong", async () => {
  const server = createCodeChessServer(0, { pingMs: 20, handshakeMs: 1_000 });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => socket.once("open", resolve));
  const acknowledgement = waitForMessage(socket, "hello_ack");
  socket.send(JSON.stringify({ type: "hello", userId: "unresponsive", role: "ui" }));
  await acknowledgement;

  try {
    const serverSocket = [...server.webSocketServer.clients][0];
    assert(serverSocket);
    serverSocket.removeAllListeners("pong");
    const closed = new Promise<number>((resolve) => socket.once("close", resolve));
    assert.equal(await closed, 1006);
  } finally {
    await server.close();
  }
});

test("public room pauses when activity leases expire", async () => {
  const server = createCodeChessServer(0, { leaseMs: 25, sweepMs: 10, pingMs: 60_000 });
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, token?: string) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const alice = await (await post("/v1/rooms", { displayName: "Alice" })).json() as Record<string, string>;
    const bob = await (await post(`/v1/rooms/${alice.roomCode}/join`, { displayName: "Bob" })).json() as Record<string, string>;
    const aliceSocket = await connect(`ws://127.0.0.1:${address.port}`, alice.playerToken!);
    const bobSocket = await connect(`ws://127.0.0.1:${address.port}`, bob.playerToken!);
    const matched = Promise.all([
      waitForMessage(aliceSocket, "match_found"),
      waitForMessage(bobSocket, "match_found"),
    ]);
    await post("/v1/activity", { activityId: "alice", action: "start" }, alice.playerToken);
    await post("/v1/activity", { activityId: "bob", action: "start" }, bob.playerToken);
    await matched;
    const paused = Promise.all([
      waitForMessage(aliceSocket, "game_paused"),
      waitForMessage(bobSocket, "game_paused"),
    ]);
    await paused;
    aliceSocket.close();
    bobSocket.close();
  } finally {
    await server.close();
  }
});

test("public room rejects an unknown terminal token", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => socket.once("open", resolve));
  const rejection = waitForMessage(socket, "error");
  socket.send(JSON.stringify({ type: "room_hello", playerToken: "x".repeat(43) }));
  assert.match(String((await rejection).reason), /invalid player token/i);
  socket.close();
  await server.close();
});
