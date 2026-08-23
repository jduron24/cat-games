import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { WebSocket } from "ws";
import { createCodeChessServer, type CodeChessServer } from "../src/server.js";

let server: CodeChessServer;
let port: number;

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

async function connectUser(userId: string): Promise<WebSocket> {
  const client = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", resolve);
  });
  const acknowledgement = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", userId }));
  assert.deepEqual(await acknowledgement, { type: "hello_ack", userId });
  return client;
}

async function createMatchedPlayers(prefix: string): Promise<{
  white: WebSocket;
  black: WebSocket;
  gameId: string;
}> {
  const first = await connectUser(`${prefix}-first`);
  const second = await connectUser(`${prefix}-second`);

  const waitingMessage = nextMessage(first);
  first.send(JSON.stringify({ type: "waiting" }));
  await waitingMessage;

  const firstMessages = nextMessages(first, 2);
  const secondMessages = nextMessages(second, 2);
  second.send(JSON.stringify({ type: "waiting" }));
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

test("registers a user after hello", async () => {
  const client = new WebSocket(`ws://localhost:${port}`);

  const response = await new Promise<Record<string, string>>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", () => {
      client.send(JSON.stringify({ type: "hello", userId: "alice" }));
    });
    client.once("message", (data) => resolve(JSON.parse(data.toString())));
  });

  assert.deepEqual(response, { type: "hello_ack", userId: "alice" });
  assert.equal(server.users.has("alice"), true);
  client.close();
});

test("rejects invalid JSON without crashing", async () => {
  const client = new WebSocket(`ws://localhost:${port}`);

  const response = await new Promise<Record<string, string>>((resolve, reject) => {
    client.once("error", reject);
    client.once("open", () => client.send("not-json"));
    client.once("message", (data) => resolve(JSON.parse(data.toString())));
  });

  assert.equal(response.type, "error");
  client.close();
});

test("matches two waiting users into the same game", async () => {
  const alice = await connectUser("match-alice");
  const bob = await connectUser("match-bob");

  const aliceWaitingMessage = nextMessage(alice);
  alice.send(JSON.stringify({ type: "waiting" }));
  assert.deepEqual(await aliceWaitingMessage, { type: "waiting_for_player" });

  const aliceMessages = nextMessages(alice, 2);
  const bobMessages = nextMessages(bob, 2);
  bob.send(JSON.stringify({ type: "waiting" }));

  const [[aliceMatch, aliceState], [bobMatch, bobState]] = await Promise.all([
    aliceMessages,
    bobMessages,
  ]);

  assert.equal(aliceMatch.type, "match_found");
  assert.equal(bobMatch.type, "match_found");
  assert.equal(aliceMatch.gameId, bobMatch.gameId);
  assert.notEqual(aliceMatch.color, bobMatch.color);
  assert.equal(server.games.size, 1);

  assert.deepEqual(aliceState, bobState);
  assert.equal(aliceState.type, "game_state");
  assert.equal(aliceState.turn, "white");

  alice.close();
  bob.close();
});

test("accepts a legal move and broadcasts it to both players", async () => {
  const { white, black, gameId } = await createMatchedPlayers("legal");
  const whiteUpdate = nextMessage(white);
  const blackUpdate = nextMessage(black);

  white.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  const [messageForWhite, messageForBlack] = await Promise.all([
    whiteUpdate,
    blackUpdate,
  ]);

  assert.deepEqual(messageForWhite, messageForBlack);
  assert.equal(messageForWhite.type, "move_accepted");
  assert.equal(messageForWhite.turn, "black");
  assert.match(server.games.get(gameId)?.pgn ?? "", /e4/);

  white.close();
  black.close();
});

test("rejects an illegal move", async () => {
  const { white, black, gameId } = await createMatchedPlayers("illegal");
  const originalFen = server.games.get(gameId)?.fen;
  const rejection = nextMessage(white);

  white.send(JSON.stringify({ type: "move", from: "e2", to: "e5" }));
  const message = await rejection;

  assert.deepEqual(message, {
    type: "move_rejected",
    reason: "Illegal chess move",
  });
  assert.equal(server.games.get(gameId)?.fen, originalFen);

  white.close();
  black.close();
});

test("rejects a move played out of turn", async () => {
  const { white, black, gameId } = await createMatchedPlayers("turn");
  const originalFen = server.games.get(gameId)?.fen;
  const rejection = nextMessage(black);

  black.send(JSON.stringify({ type: "move", from: "e7", to: "e5" }));
  const message = await rejection;

  assert.deepEqual(message, {
    type: "move_rejected",
    reason: "It is not your turn",
  });
  assert.equal(server.games.get(gameId)?.fen, originalFen);

  white.close();
  black.close();
});

test("pauses a game on done and blocks further moves", async () => {
  const { white, black, gameId } = await createMatchedPlayers("pause");
  const whitePauseMessages = nextMessages(white, 2);
  const blackPauseMessage = nextMessage(black);

  black.send(JSON.stringify({ type: "done" }));
  const [[whitePaused, opponentFinished], blackPaused] = await Promise.all([
    whitePauseMessages,
    blackPauseMessage,
  ]);

  assert.deepEqual(whitePaused, { type: "game_paused" });
  assert.deepEqual(opponentFinished, { type: "opponent_agent_finished" });
  assert.deepEqual(blackPaused, { type: "game_paused" });
  assert.equal(server.games.get(gameId)?.status, "PAUSED");

  const rejection = nextMessage(white);
  white.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  assert.deepEqual(await rejection, {
    type: "move_rejected",
    reason: "Game is not active",
  });

  white.close();
  black.close();
});

test("resumes the same saved position when both players are waiting again", async () => {
  const { white, black, gameId } = await createMatchedPlayers("resume");

  const whiteMove = nextMessage(white);
  const blackMove = nextMessage(black);
  white.send(JSON.stringify({ type: "move", from: "e2", to: "e4" }));
  await Promise.all([whiteMove, blackMove]);
  const savedGame = server.games.get(gameId);
  const savedFen = savedGame?.fen;
  const savedPgn = savedGame?.pgn;

  const whitePauseMessages = nextMessages(white, 2);
  const blackPauseMessage = nextMessage(black);
  black.send(JSON.stringify({ type: "done" }));
  await Promise.all([whitePauseMessages, blackPauseMessage]);

  const whiteResume = nextMessage(white);
  const blackResume = nextMessage(black);
  black.send(JSON.stringify({ type: "waiting" }));
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

  white.close();
  black.close();
});
