import assert from "node:assert/strict";
import test from "node:test";

import {
  HTTP_CONTRACT_LIMITS,
  parseActivityRequest,
  parseCreateRoomRequest,
  parseCreateRoomResponse,
  parseJoinRoomRequest,
} from "../src/http-contract.js";

test("parses canonical room creation and join requests", () => {
  assert.deepEqual(parseCreateRoomRequest({ displayName: "  Alice  " }), {
    displayName: "Alice",
  });
  assert.deepEqual(
    parseJoinRoomRequest({ roomCode: " blue-cat7 ", displayName: " Bob " }),
    { roomCode: "BLUE-CAT7", displayName: "Bob" },
  );
});

test("rejects malformed display names and room codes", () => {
  const malformed = [
    { displayName: "" },
    { displayName: "\u0000Alice" },
    { displayName: "a".repeat(HTTP_CONTRACT_LIMITS.displayName + 1) },
    { roomCode: "SHORT", displayName: "Bob" },
    { roomCode: "BLUE-CAT-47", displayName: "Bob" },
    { roomCode: 42, displayName: "Bob" },
  ];

  assert.equal(parseCreateRoomRequest(malformed[0]), null);
  assert.equal(parseCreateRoomRequest(malformed[1]), null);
  assert.equal(parseCreateRoomRequest(malformed[2]), null);
  for (const value of malformed.slice(3)) {
    assert.equal(parseJoinRoomRequest(value), null);
  }
});

test("parses canonical activity events", () => {
  for (const action of ["start", "heartbeat", "stop"] as const) {
    assert.deepEqual(parseActivityRequest({ activityId: "task-123", action }), {
      activityId: "task-123",
      action,
    });
  }
});

test("rejects malformed activity events", () => {
  const malformed = [
    { activityId: "", action: "start" },
    {
      activityId: "a".repeat(HTTP_CONTRACT_LIMITS.activityId + 1),
      action: "start",
    },
    { activityId: "task-123", action: "begin" },
  ];

  for (const value of malformed) {
    assert.equal(parseActivityRequest(value), null);
  }
});

test("parses room credentials returned by the server", () => {
  const response = {
    roomCode: "BLUE-CAT7",
    playerId: "player-1",
    playerToken: "0123456789abcdef0123456789abcdef",
  };
  assert.deepEqual(parseCreateRoomResponse(response), response);
  assert.equal(
    parseCreateRoomResponse({ ...response, playerToken: "too-short" }),
    null,
  );
});
