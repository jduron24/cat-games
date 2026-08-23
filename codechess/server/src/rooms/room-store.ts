import { randomBytes as secureRandomBytes } from "node:crypto";

import type { ActivityAction, CreateRoomResponse } from "@codechess/shared/http-contract";

import {
  createPlayerToken,
  hashPlayerToken,
  type RandomBytes,
  verifyPlayerToken,
} from "./token.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RoomPlayer = {
  id: string;
  displayName: string;
  tokenHash: string;
  activities: Map<string, number>;
};

export type Room = {
  code: string;
  players: RoomPlayer[];
  currentGameId: string | null;
};

export class RoomStoreError extends Error {
  constructor(
    public readonly code: "ROOM_NOT_FOUND" | "ROOM_FULL" | "TOKEN_INVALID",
    message: string,
  ) {
    super(message);
  }
}

export type RoomStoreOptions = {
  randomBytes?: RandomBytes;
  now?: () => number;
};

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly randomBytes: RandomBytes;
  private readonly now: () => number;

  constructor(options: RoomStoreOptions = {}) {
    this.randomBytes = options.randomBytes ?? secureRandomBytes;
    this.now = options.now ?? Date.now;
  }

  create(displayName: string): CreateRoomResponse {
    let code: string;
    do {
      code = this.generateCode();
    } while (this.rooms.has(code));
    const { player, credentials } = this.createPlayer(code, displayName);
    this.rooms.set(code, { code, players: [player], currentGameId: null });
    return credentials;
  }

  join(roomCode: string, displayName: string): CreateRoomResponse {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new RoomStoreError("ROOM_NOT_FOUND", "Room not found");
    }
    if (room.players.length >= 2) {
      throw new RoomStoreError("ROOM_FULL", "Room already has two players");
    }
    const { player, credentials } = this.createPlayer(roomCode, displayName);
    room.players.push(player);
    return credentials;
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  authenticate(token: string): { room: Room; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        if (verifyPlayerToken(token, player.tokenHash)) {
          return { room, player };
        }
      }
    }
    return null;
  }

  updateActivity(
    token: string,
    activityId: string,
    action: ActivityAction,
    leaseMs: number,
  ): boolean {
    const authenticated = this.authenticate(token);
    if (!authenticated) {
      throw new RoomStoreError("TOKEN_INVALID", "Invalid player token");
    }
    if (action === "stop") {
      authenticated.player.activities.delete(activityId);
    } else {
      authenticated.player.activities.set(activityId, this.now() + leaseMs);
    }
    return this.isActive(authenticated.player.id);
  }

  isActive(playerId: string): boolean {
    const player = this.findPlayer(playerId)?.player;
    if (!player) return false;
    const now = this.now();
    for (const [activityId, expiresAt] of player.activities) {
      if (expiresAt <= now) player.activities.delete(activityId);
    }
    return player.activities.size > 0;
  }

  expireActivities(): string[] {
    const changed: string[] = [];
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        const wasActive = player.activities.size > 0;
        this.isActive(player.id);
        if (wasActive && player.activities.size === 0) changed.push(player.id);
      }
    }
    return changed;
  }

  clearRoomActivities(roomCode: string): void {
    for (const player of this.rooms.get(roomCode)?.players ?? []) {
      player.activities.clear();
    }
  }

  findPlayer(playerId: string): { room: Room; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (player) return { room, player };
    }
    return null;
  }

  private createPlayer(roomCode: string, displayName: string): {
    player: RoomPlayer;
    credentials: CreateRoomResponse;
  } {
    const playerToken = createPlayerToken(this.randomBytes);
    const playerId = this.randomBytes(16).toString("hex");
    return {
      player: {
        id: playerId,
        displayName,
        tokenHash: hashPlayerToken(playerToken),
        activities: new Map(),
      },
      credentials: { roomCode, playerId, playerToken },
    };
  }

  private generateCode(): string {
    const bytes = this.randomBytes(8);
    const characters = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
    return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
  }
}
