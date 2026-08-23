import assert from "node:assert/strict";
import { test } from "node:test";

import { RoomStore, RoomStoreError } from "../src/rooms/room-store.js";

test("room store creates private credentials and enforces two seats", () => {
  let seed = 0;
  const store = new RoomStore({
    randomBytes: (size) => Buffer.alloc(size, seed++),
  });

  const host = store.create("Alice");
  const guest = store.join(host.roomCode, "Bob");

  assert.match(host.roomCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(host.playerToken.length >= 32);
  assert.notEqual(host.playerToken, guest.playerToken);
  assert.equal(store.getRoom(host.roomCode)?.players.length, 2);
  assert.throws(
    () => store.join(host.roomCode, "Charlie"),
    (error: unknown) =>
      error instanceof RoomStoreError && error.code === "ROOM_FULL",
  );
});

test("room store hashes tokens at rest and rejects unknown tokens", () => {
  let seed = 5;
  const store = new RoomStore({
    randomBytes: (size) => Buffer.alloc(size, seed++),
  });
  const credentials = store.create("Alice");
  const room = store.getRoom(credentials.roomCode);

  assert(room);
  assert.equal(room.players[0]?.tokenHash.length, 64);
  assert.notEqual(room.players[0]?.tokenHash, credentials.playerToken);
  assert.equal(store.authenticate(credentials.playerToken)?.player.id, credentials.playerId);
  assert.equal(store.authenticate("x".repeat(43)), null);
});

test("room store tracks overlapping activity leases idempotently", () => {
  let now = 1_000;
  const store = new RoomStore({ now: () => now });
  const credentials = store.create("Alice");

  assert.equal(store.updateActivity(credentials.playerToken, "task-1", "start", 90_000), true);
  assert.equal(store.updateActivity(credentials.playerToken, "task-2", "start", 90_000), true);
  assert.equal(store.updateActivity(credentials.playerToken, "task-1", "stop", 90_000), true);
  assert.equal(store.isActive(credentials.playerId), true);

  now = 91_001;
  assert.deepEqual(store.expireActivities(), [credentials.playerId]);
  assert.equal(store.isActive(credentials.playerId), false);
});

test("room store heartbeat refreshes an existing activity but cannot start one", () => {
  let now = 1_000;
  const store = new RoomStore({ now: () => now });
  const credentials = store.create("Alice");

  assert.equal(store.updateActivity(credentials.playerToken, "task", "heartbeat", 90_000), false);
  store.updateActivity(credentials.playerToken, "task", "start", 90_000);
  now = 2_000;
  assert.equal(store.updateActivity(credentials.playerToken, "task", "heartbeat", 90_000), true);
  now = 91_500;
  assert.equal(store.isActive(credentials.playerId), true);
});
