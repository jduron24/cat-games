import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { WebSocket } from "ws";

import { createCodeChessServer, type CodeChessServer } from "../src/server.js";

let server: CodeChessServer;
let port: number;

type PlayerConnection = {
  ui: WebSocket;
  agent: WebSocket;
};

function nextMessage(client: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    client.once("error", reject);
    client.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

function nextMessages(
  client: WebSocket,
  count: number,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    client.once("error", reject);
    client.on("message", function collect(data) {
      messages.push(JSON.parse(data.toString()));
      if (messages.length === count) {
        client.off("message", collect);
        resolve(messages);
      }
    });
  });
}

async function connectRole(userId: string, role: "ui" | "agent"): Promise<WebSocket> {
  const client = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", resolve);
  });
  const acknowledgement = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", userId, role }));
  assert.deepEqual(await acknowledgement, { type: "hello_ack", userId, role });
  return client;
}

async function connectPlayer(userId: string): Promise<PlayerConnection> {
  const ui = await connectRole(userId, "ui");
  const agent = await connectRole(userId, "agent");
  return { ui, agent };
}

function closePlayer(player: PlayerConnection): void {
  player.ui.close();
  player.agent.close();
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 250;
  while (!condition()) {
    if (Date.now() >= deadline) {
      assert.fail("Timed out waiting for server state to update");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function createMatchedPlayers(prefix: string): Promise<{
  white: PlayerConnection;
  black: PlayerConnection;
  gameId: string;
}> {
  const first = await connectPlayer(`${prefix}-first`);
  const second = await connectPlayer(`${prefix}-second`);

  const waitingMessage = nextMessage(first.ui);
  first.agent.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await waitingMessage, { type: "waiting_for_player" });

  const firstMessages = nextMessages(first.ui, 2);
  const secondMessages = nextMessages(second.ui, 2);
  second.agent.send(JSON.stringify({ type: "waiting" }));
  const [[firstMatch], [secondMatch]] = await Promise.all([
    firstMessages,
    secondMessages,
  ]);

  assert.equal(firstMatch.type, "match_found");
  assert.equal(secondMatch.type, "match_found");
  assert.equal(firstMatch.gameId, secondMatch.gameId);

  return {
    white: firstMatch.color === "white" ? first : second,
    black: firstMatch.color === "black" ? first : second,
    gameId: firstMatch.gameId as string,
  };
}

before(async () => {
  server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  port = address.port;
});

after(async () => {
  await server.close();
});

test("registers a role-specific user socket after hello", async () => {
  const client = await connectRole("alice", "ui");

  assert.equal(server.users.get("alice")?.uiSocket?.readyState, WebSocket.OPEN);
  assert.equal(server.users.get("alice")?.agentSocket, null);
  client.close();
});

test("rejects invalid JSON without crashing", async () => {
  const client = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", resolve);
  });

  const invalidResponse = nextMessage(client);
  client.send("not-json");
  assert.equal((await invalidResponse).type, "error");

  const acknowledgement = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", userId: "after-invalid", role: "ui" }));
  assert.deepEqual(await acknowledgement, {
    type: "hello_ack",
    userId: "after-invalid",
    role: "ui",
  });
  client.close();
});

test("matches two waiting agents and sends game state to their UIs", async () => {
  const initialGameCount = server.games.size;
  const alice = await connectPlayer("match-alice");
  const bob = await connectPlayer("match-bob");

  const aliceWaitingMessage = nextMessage(alice.ui);
  alice.agent.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await aliceWaitingMessage, { type: "waiting_for_player" });

  const aliceMessages = nextMessages(alice.ui, 2);
  const bobMessages = nextMessages(bob.ui, 2);
  bob.agent.send(JSON.stringify({ type: "waiting" }));

  const [[aliceMatch, aliceState], [bobMatch, bobState]] = await Promise.all([
    aliceMessages,
    bobMessages,
  ]);

  assert.equal(aliceMatch.type, "match_found");
  assert.equal(bobMatch.type, "match_found");
  assert.equal(aliceMatch.gameId, bobMatch.gameId);
  assert.notEqual(aliceMatch.color, bobMatch.color);
  assert.equal(server.games.size, initialGameCount + 1);
  assert.deepEqual(aliceState, bobState);
  assert.equal(aliceState.type, "game_state");
  assert.equal(aliceState.turn, "white");

  closePlayer(alice);
  closePlayer(bob);
});

test("retries matchmaking when a waiting agent's UI connects later", async () => {
  const aliceAgent = await connectRole("late-ui-alice", "agent");
  const bob = await connectPlayer("late-ui-bob");

  const bobWaiting = nextMessage(bob.ui);
  bob.agent.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await bobWaiting, { type: "waiting_for_player" });
  aliceAgent.send(JSON.stringify({ type: "waiting" }));

  const aliceUi = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    aliceUi.once("error", reject);
    aliceUi.once("open", resolve);
  });
  const aliceMessages = nextMessages(aliceUi, 3);
  const bobMessages = nextMessages(bob.ui, 2);
  aliceUi.send(JSON.stringify({ type: "hello", userId: "late-ui-alice", role: "ui" }));

  const [[acknowledgement, aliceMatch, aliceState], [bobMatch, bobState]] =
    await Promise.race([
      Promise.all([aliceMessages, bobMessages]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Matchmaking did not resume after UI connection")), 100),
      ),
    ]);

  assert.deepEqual(acknowledgement, {
    type: "hello_ack",
    userId: "late-ui-alice",
    role: "ui",
  });
  assert.equal(aliceMatch.type, "match_found");
  assert.equal(bobMatch.type, "match_found");
  assert.equal(aliceState.type, "game_state");
  assert.deepEqual(aliceState, bobState);

  aliceUi.close();
  aliceAgent.close();
  closePlayer(bob);
});

test("accepts a legal UI move and broadcasts it to both UIs", async () => {
  const { white, black, gameId } = await createMatchedPlayers("legal");
  const whiteUpdate = nextMessage(white.ui);
  const blackUpdate = nextMessage(black.ui);

  white.ui.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  const [messageForWhite, messageForBlack] = await Promise.all([
    whiteUpdate,
    blackUpdate,
  ]);

  assert.deepEqual(messageForWhite, messageForBlack);
  assert.equal(messageForWhite.type, "move_accepted");
  assert.equal(messageForWhite.turn, "black");
  assert.match(server.games.get(gameId)?.pgn ?? "", /e4/);

  closePlayer(white);
  closePlayer(black);
});

test("rejects an illegal move", async () => {
  const { white, black, gameId } = await createMatchedPlayers("illegal");
  const originalFen = server.games.get(gameId)?.fen;
  const rejection = nextMessage(white.ui);

  white.ui.send(JSON.stringify({ type: "move", from: "e2", to: "e5" }));
  assert.deepEqual(await rejection, {
    type: "move_rejected",
    reason: "Illegal chess move",
  });
  assert.equal(server.games.get(gameId)?.fen, originalFen);

  closePlayer(white);
  closePlayer(black);
});

test("rejects a move played out of turn", async () => {
  const { white, black, gameId } = await createMatchedPlayers("turn");
  const originalFen = server.games.get(gameId)?.fen;
  const rejection = nextMessage(black.ui);

  black.ui.send(JSON.stringify({ type: "move", from: "e7", to: "e5" }));
  assert.deepEqual(await rejection, {
    type: "move_rejected",
    reason: "It is not your turn",
  });
  assert.equal(server.games.get(gameId)?.fen, originalFen);

  closePlayer(white);
  closePlayer(black);
});

test("pauses a game when an agent is done and blocks further UI moves", async () => {
  const { white, black, gameId } = await createMatchedPlayers("pause");
  const whitePauseMessages = nextMessages(white.ui, 2);
  const blackPauseMessage = nextMessage(black.ui);

  black.agent.send(JSON.stringify({ type: "done" }));
  const [[whitePaused, opponentFinished], blackPaused] = await Promise.all([
    whitePauseMessages,
    blackPauseMessage,
  ]);

  assert.deepEqual(whitePaused, { type: "game_paused" });
  assert.deepEqual(opponentFinished, { type: "opponent_agent_finished" });
  assert.deepEqual(blackPaused, { type: "game_paused" });
  assert.equal(server.games.get(gameId)?.status, "PAUSED");

  const rejection = nextMessage(white.ui);
  white.ui.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  assert.deepEqual(await rejection, {
    type: "move_rejected",
    reason: "Game is not active",
  });

  closePlayer(white);
  closePlayer(black);
});

test("resumes the same saved position when both agents are waiting again", async () => {
  const { white, black, gameId } = await createMatchedPlayers("resume");

  const whiteMove = nextMessage(white.ui);
  const blackMove = nextMessage(black.ui);
  white.ui.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  await Promise.all([whiteMove, blackMove]);
  const savedGame = server.games.get(gameId);
  const savedFen = savedGame?.fen;
  const savedPgn = savedGame?.pgn;

  const whitePauseMessages = nextMessages(white.ui, 2);
  const blackPauseMessage = nextMessage(black.ui);
  black.agent.send(JSON.stringify({ type: "done" }));
  await Promise.all([whitePauseMessages, blackPauseMessage]);

  const whiteResume = nextMessage(white.ui);
  const blackResume = nextMessage(black.ui);
  black.agent.send(JSON.stringify({ type: "waiting" }));
  const [messageForWhite, messageForBlack] = await Promise.all([
    whiteResume,
    blackResume,
  ]);

  assert.deepEqual(messageForWhite, messageForBlack);
  assert.deepEqual(messageForWhite, {
    type: "game_resumed",
    fen: savedFen,
    pgn: savedPgn,
  });
  assert.equal(server.games.get(gameId)?.status, "ACTIVE");
  assert.equal(server.games.get(gameId)?.fen, savedFen);
  assert.match(server.games.get(gameId)?.pgn ?? "", /e4/);

  closePlayer(white);
  closePlayer(black);
});

test("retains UI and agent sockets for one logical user", async () => {
  const ui = await connectRole("dual-socket-user", "ui");
  const agent = await connectRole("dual-socket-user", "agent");

  const connected = server.users.get("dual-socket-user");
  const serverUiSocket = connected?.uiSocket;
  assert.equal(serverUiSocket?.readyState, WebSocket.OPEN);
  assert.equal(connected?.agentSocket?.readyState, WebSocket.OPEN);

  const agentClosed = new Promise<void>((resolve) => agent.once("close", () => resolve()));
  agent.close();
  await agentClosed;
  await waitFor(() => server.users.get("dual-socket-user")?.agentSocket === null);

  assert.equal(server.users.get("dual-socket-user")?.uiSocket, serverUiSocket);
  assert.equal(server.users.get("dual-socket-user")?.agentSocket, null);

  ui.close();
});

test("rejects messages sent by the wrong socket role", async () => {
  const player = await connectPlayer("role-owner");

  const uiError = nextMessage(player.ui);
  player.ui.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await uiError, {
    type: "error",
    reason: "waiting is not allowed for the ui role",
  });

  const agentError = nextMessage(player.agent);
  player.agent.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  assert.deepEqual(await agentError, {
    type: "error",
    reason: "move is not allowed for the agent role",
  });

  const validWaiting = nextMessage(player.ui);
  player.agent.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await validWaiting, { type: "waiting_for_player" });

  closePlayer(player);
});

test("rejects malformed payloads and continues serving the connection", async () => {
  const client = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", resolve);
  });

  const malformedHello = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", userId: 42, role: "ui" }));
  assert.equal((await malformedHello).type, "error");

  const acknowledgement = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", userId: "valid-after-error", role: "ui" }));
  assert.deepEqual(await acknowledgement, {
    type: "hello_ack",
    userId: "valid-after-error",
    role: "ui",
  });

  const malformedMove = nextMessage(client);
  client.send(JSON.stringify({ type: "move", from: 12, to: "e4" }));
  assert.equal((await malformedMove).type, "error");

  const unknownMessage = nextMessage(client);
  client.send(JSON.stringify({ type: "dance" }));
  assert.equal((await unknownMessage).type, "error");

  client.close();
});
