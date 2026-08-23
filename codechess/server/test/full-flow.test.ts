import assert from "node:assert/strict";
import { test } from "node:test";

import { WebSocketTransport } from "../../agent/src/transport/websocketTransport.js";
import { WebSocketGameTransport } from "../../client/src/transport/websocket-game-transport.js";
import type { GameState } from "../../client/src/types.js";
import type { TransportNotice } from "../../client/src/transport/game-transport.js";
import { createCodeChessServer } from "../src/server.js";

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      assert.fail(`Timed out waiting for ${description}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

test("completes a match, move, pause, and resume across four real sockets", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) =>
    server.webSocketServer.once("listening", resolve),
  );
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const url = `ws://localhost:${address.port}`;

  const aliceStates: GameState[] = [];
  const bobStates: GameState[] = [];
  const aliceNotices: TransportNotice[] = [];
  const aliceUi = new WebSocketGameTransport({ url, userId: "flow-alice" });
  const bobUi = new WebSocketGameTransport({ url, userId: "flow-bob" });
  aliceUi.onGameState((state) => aliceStates.push(state));
  bobUi.onGameState((state) => bobStates.push(state));
  aliceUi.onNotice((notice) => aliceNotices.push(notice));

  const aliceAgent = new WebSocketTransport({ url, userId: "flow-alice" });
  const bobAgent = new WebSocketTransport({ url, userId: "flow-bob" });

  try {
    await Promise.all([aliceUi.connect(), bobUi.connect()]);
    await aliceAgent.send({ type: "waiting" });
    await bobAgent.send({ type: "waiting" });

    await waitFor(
      () =>
        aliceStates.at(-1)?.status === "active" &&
        bobStates.at(-1)?.status === "active",
      "both UIs to receive the initial game state",
    );

    const aliceInitial = aliceStates.at(-1);
    const bobInitial = bobStates.at(-1);
    assert(aliceInitial && bobInitial);
    assert.equal(aliceInitial.fen, bobInitial.fen);
    assert.notEqual(aliceInitial.playerColor, bobInitial.playerColor);

    const whiteUi =
      aliceInitial.playerColor === "white" ? aliceUi : bobUi;
    const savedInitialFen = aliceInitial.fen;
    whiteUi.sendMove("e2", "e4");

    await waitFor(
      () =>
        aliceStates.at(-1)?.fen !== savedInitialFen &&
        aliceStates.at(-1)?.fen === bobStates.at(-1)?.fen &&
        aliceStates.at(-1)?.turn === "black" &&
        bobStates.at(-1)?.turn === "black",
      "the accepted move to reach both UIs",
    );
    const savedMovedFen = aliceStates.at(-1)?.fen;
    assert(savedMovedFen);

    await bobAgent.send({ type: "done" });
    await waitFor(
      () =>
        aliceStates.at(-1)?.status === "paused" &&
        bobStates.at(-1)?.status === "paused",
      "both UIs to observe the paused game",
    );
    assert(
      aliceNotices.some((notice) =>
        notice.message.includes("Opponent's agent finished"),
      ),
    );

    await aliceAgent.send({ type: "waiting" });
    await bobAgent.send({ type: "waiting" });
    await waitFor(
      () =>
        aliceStates.at(-1)?.status === "active" &&
        bobStates.at(-1)?.status === "active" &&
        aliceStates.at(-1)?.fen === savedMovedFen &&
        bobStates.at(-1)?.fen === savedMovedFen,
      "the same game position to resume on both UIs",
    );
  } finally {
    aliceUi.disconnect();
    bobUi.disconnect();
    await Promise.all([aliceAgent.close(), bobAgent.close()]);
    await server.close();
  }
});
