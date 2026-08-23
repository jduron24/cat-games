export type PeerRole = "ui" | "agent";
export type PlayerColor = "white" | "black";
export type Square = `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"}`;

export type ClientMessage =
  | { type: "hello"; userId: string; role: PeerRole }
  | { type: "waiting" }
  | { type: "done" }
  | { type: "move"; from: Square; to: Square }
  | { type: "disconnect" };

export type ServerMessage =
  | { type: "hello_ack"; userId: string; role: PeerRole }
  | { type: "error"; reason: string }
  | { type: "waiting_for_player" }
  | { type: "match_found"; gameId: string; color: PlayerColor; fen: string }
  | { type: "game_state"; fen: string; turn: PlayerColor }
  | { type: "move_accepted"; fen: string; turn: PlayerColor }
  | { type: "game_completed"; fen: string; pgn: string }
  | { type: "move_rejected"; reason: string }
  | { type: "game_paused" }
  | { type: "opponent_agent_finished" }
  | { type: "game_resumed"; fen: string; pgn: string };

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isObject(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "hello": {
      if (typeof value.userId !== "string" || !value.userId.trim() || !isPeerRole(value.role)) {
        return null;
      }
      return { type: "hello", userId: value.userId.trim(), role: value.role };
    }
    case "waiting":
    case "done":
    case "disconnect":
      return { type: value.type };
    case "move":
      return isSquare(value.from) && isSquare(value.to)
        ? { type: "move", from: value.from, to: value.to }
        : null;
    default:
      return null;
  }
}

export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isObject(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "hello_ack":
      return typeof value.userId === "string" && Boolean(value.userId.trim()) && isPeerRole(value.role)
        ? { type: "hello_ack", userId: value.userId.trim(), role: value.role }
        : null;
    case "error":
    case "move_rejected":
      return typeof value.reason === "string"
        ? { type: value.type, reason: value.reason }
        : null;
    case "waiting_for_player":
    case "game_paused":
    case "opponent_agent_finished":
      return { type: value.type };
    case "match_found":
      return typeof value.gameId === "string" &&
        Boolean(value.gameId) &&
        isPlayerColor(value.color) &&
        isFen(value.fen)
        ? {
            type: "match_found",
            gameId: value.gameId,
            color: value.color,
            fen: value.fen,
          }
        : null;
    case "game_state":
    case "move_accepted":
      return isFen(value.fen) && isPlayerColor(value.turn)
        ? { type: value.type, fen: value.fen, turn: value.turn }
        : null;
    case "game_completed":
      return isFen(value.fen) && typeof value.pgn === "string"
        ? { type: "game_completed", fen: value.fen, pgn: value.pgn }
        : null;
    case "game_resumed":
      return isFen(value.fen) && typeof value.pgn === "string"
        ? { type: "game_resumed", fen: value.fen, pgn: value.pgn }
        : null;
    default:
      return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPeerRole(value: unknown): value is PeerRole {
  return value === "ui" || value === "agent";
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "white" || value === "black";
}

function isSquare(value: unknown): value is Square {
  return typeof value === "string" && /^[a-h][1-8]$/.test(value);
}

function isFen(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const fields = value.trim().split(/\s+/);
  const ranks = fields[0]?.split("/");
  return fields.length === 6 && ranks?.length === 8 && (fields[1] === "w" || fields[1] === "b");
}
