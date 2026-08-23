import assert from "node:assert/strict";
import test from "node:test";
import { WebSocketServer } from "ws";

import { createCodeChessServer } from "../../server/src/server.js";
import { WebSocketTransport } from "../src/transport/websocketTransport.js";

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 250;
  while (!condition()) {
    if (Date.now() >= deadline) {
      assert.fail("Timed out waiting for server state to update");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

test("registers the agent role before sending lifecycle messages", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");

  let transport: WebSocketTransport | undefined;
  try {
    assert.doesNotThrow(() => {
      transport = new WebSocketTransport({
        url: `ws://localhost:${address.port}`,
        userId: "agent-transport-user",
      });
    });
    assert(transport);

    await transport.send({ type: "waiting" });
    await waitFor(() => server.users.get("agent-transport-user")?.waitingForAgent === true);
    const user = server.users.get("agent-transport-user");
    assert.equal(user?.agentSocket?.readyState, 1);
    assert.equal(user?.waitingForAgent, true);

    await transport.send({ type: "done" });
    await waitFor(() => user?.waitingForAgent === false);
    assert.equal(user?.waitingForAgent, false);
  } finally {
    await transport?.close();
    await server.close();
  }
});

test("normalizes the agent user ID before matching the server acknowledgement", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const transport = new WebSocketTransport({
    url: `ws://localhost:${address.port}`,
    userId: "  normalized-agent  ",
    handshakeTimeoutMs: 50,
  });

  try {
    await Promise.race([
      transport.send({ type: "waiting" }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("Agent handshake remained pending")), 100),
      ),
    ]);
    await waitFor(
      () => server.users.get("normalized-agent")?.waitingForAgent === true,
    );
    assert.equal(server.users.has("  normalized-agent  "), false);
  } finally {
    await server.close();
    await transport.close();
  }
});

test("rejects an acknowledgement for a different agent identity", async () => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  server.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(
        JSON.stringify({ type: "hello_ack", userId: "other-agent", role: "agent" }),
      );
    });
  });
  const transport = new WebSocketTransport({
    url: `ws://localhost:${address.port}`,
    userId: "expected-agent",
    handshakeTimeoutMs: 50,
  });

  try {
    await assert.rejects(
      Promise.race([
        transport.send({ type: "waiting" }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("Agent handshake remained pending")), 100),
        ),
      ]),
      /acknowledgement.*identity/i,
    );
  } finally {
    for (const client of server.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await transport.close();
  }
});

test("rejects when the agent handshake is not acknowledged in time", async () => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const transport = new WebSocketTransport({
    url: `ws://localhost:${address.port}`,
    userId: "timeout-agent",
    handshakeTimeoutMs: 10,
  });

  try {
    await assert.rejects(
      Promise.race([
        transport.send({ type: "waiting" }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("Agent transport did not enforce its timeout")),
            100,
          ),
        ),
      ]),
      /handshake timed out/i,
    );
  } finally {
    for (const client of server.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await transport.close();
  }
});

test("reports server protocol errors without closing the transport", async () => {
  const server = createCodeChessServer(0);
  await new Promise<void>((resolve) => server.webSocketServer.once("listening", resolve));
  const address = server.webSocketServer.address();
  assert(address && typeof address === "object");
  const errors: Error[] = [];
  const transport = new WebSocketTransport({
    url: `ws://localhost:${address.port}`,
    userId: "agent-error-user",
    onError: (error) => errors.push(error),
  });

  try {
    await transport.send({ type: "move", from: "e2", to: "e4" } as never);
    await waitFor(() => errors.length === 1);
    assert.equal(errors[0]?.message, "move is not allowed for the agent role");

    await transport.send({ type: "waiting" });
    await waitFor(() => server.users.get("agent-error-user")?.waitingForAgent === true);
  } finally {
    await transport.close();
    await server.close();
  }
});
