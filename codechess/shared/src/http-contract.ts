export const HTTP_CONTRACT_LIMITS = {
  activityId: 128,
  displayName: 40,
  playerId: 128,
  playerToken: 256,
} as const;

export type CreateRoomRequest = { displayName: string };
export type CreateRoomResponse = {
  roomCode: string;
  playerId: string;
  playerToken: string;
};
export type JoinRoomRequest = { roomCode: string; displayName: string };
export type ActivityAction = "start" | "heartbeat" | "stop";
export type ActivityRequest = { activityId: string; action: ActivityAction };

export function parseCreateRoomRequest(value: unknown): CreateRoomRequest | null {
  if (!isObject(value)) {
    return null;
  }
  const displayName = normalizeDisplayName(value.displayName);
  return displayName ? { displayName } : null;
}

export function parseJoinRoomRequest(value: unknown): JoinRoomRequest | null {
  if (!isObject(value)) {
    return null;
  }
  const displayName = normalizeDisplayName(value.displayName);
  const roomCode = normalizeRoomCode(value.roomCode);
  return displayName && roomCode ? { roomCode, displayName } : null;
}

export function parseActivityRequest(value: unknown): ActivityRequest | null {
  if (!isObject(value) || !isBoundedString(value.activityId, 1, HTTP_CONTRACT_LIMITS.activityId)) {
    return null;
  }
  if (value.action !== "start" && value.action !== "heartbeat" && value.action !== "stop") {
    return null;
  }
  return { activityId: value.activityId, action: value.action };
}

export function parseCreateRoomResponse(value: unknown): CreateRoomResponse | null {
  if (!isObject(value)) {
    return null;
  }
  const roomCode = normalizeRoomCode(value.roomCode);
  if (
    !roomCode ||
    !isBoundedString(value.playerId, 1, HTTP_CONTRACT_LIMITS.playerId) ||
    !isBoundedString(value.playerToken, 32, HTTP_CONTRACT_LIMITS.playerToken)
  ) {
    return null;
  }
  return { roomCode, playerId: value.playerId, playerToken: value.playerToken };
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized &&
    normalized.length <= HTTP_CONTRACT_LIMITS.displayName &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}
