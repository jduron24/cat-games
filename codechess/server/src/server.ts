#!/usr/bin/env node
import { WebSocketServer, WebSocket } from "ws";

type ClientMessage =
  | { type: "hello"; userId: string }
  | { type: "waiting" }
  | { type: "done" }
  | { type: "move"; from: string; to: string }
  | { type: "disconnect" };

type ServerMessage =
  | { type: "waiting_for_player" }
  | { type: "match_found"; gameId: string; color: "white" | "black"; fen: string }
  | { type: "game_state"; fen: string; turn: "white" | "black" }
  | { type: "move_accepted"; fen: string; turn: "white" | "black" }
  | { type: "move_rejected"; reason: string }
  | { type: "game_paused" }
  | { type: "opponent_agent_finished" }
  | { type: "game_resumed"; fen: string; pgn: string };

interface User {
  id: string;
  socket: WebSocket;
  waitingForAgent: boolean;
  currentGameId: string | null;
}

interface Game {
  id: string;
  playerWhite: string;
  playerBlack: string;
  fen: string;
  pgn: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  currentTurn: "white" | "black";
}

const users = new Map<string, User>();
const waitingOrder: string[] = [];
const games = new Map<string, Game>();
const pairToGame = new Map<string, string>();

function send(socket: WebSocket, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function startFen() {
  return "startpos";
}

function createGame(a: User, b: User): Game {
  const game: Game = {
    id: `game_${Date.now()}`,
    playerWhite: a.id,
    playerBlack: b.id,
    fen: startFen(),
    pgn: "",
    status: "ACTIVE",
    currentTurn: "white"
  };
  games.set(game.id, game);
  pairToGame.set(pairKey(a.id, b.id), game.id);
  a.currentGameId = game.id;
  b.currentGameId = game.id;
  return game;
}

function getWaitingUser(excludeId: string) {
  return waitingOrder.map((id) => users.get(id)).find((user): user is User => Boolean(user) && user.id !== excludeId && user.waitingForAgent && !user.currentGameId);
}

function cleanupWaiting(id: string) {
  const index = waitingOrder.indexOf(id);
  if (index >= 0) waitingOrder.splice(index, 1);
}

function ensureGame(user: User) {
  const existing = user.currentGameId ? games.get(user.currentGameId) : undefined;
  if (existing) return existing;
  return undefined;
}

function handleWaiting(user: User) {
  user.waitingForAgent = true;
  if (!waitingOrder.includes(user.id)) waitingOrder.push(user.id);

  const opponent = getWaitingUser(user.id);
  if (!opponent) {
    send(user.socket, { type: "waiting_for_player" });
    return;
  }

  const existingGameId = pairToGame.get(pairKey(user.id, opponent.id));
  let game = existingGameId ? games.get(existingGameId) : undefined;
  if (!game) {
    game = createGame(user, opponent);
    const white = game.playerWhite === user.id ? user : opponent;
    const black = game.playerBlack === user.id ? user : opponent;
    send(white.socket, { type: "match_found", gameId: game.id, color: "white", fen: game.fen });
    send(black.socket, { type: "match_found", gameId: game.id, color: "black", fen: game.fen });
  } else {
    game.status = "ACTIVE";
    game.fen = game.fen || startFen();
    user.currentGameId = game.id;
    opponent.currentGameId = game.id;
    send(user.socket, { type: "game_resumed", fen: game.fen, pgn: game.pgn });
    send(opponent.socket, { type: "game_resumed", fen: game.fen, pgn: game.pgn });
  }
}

function handleDone(user: User) {
  user.waitingForAgent = false;
  cleanupWaiting(user.id);
  const game = ensureGame(user);
  if (!game) return;
  game.status = "PAUSED";
  const opponentId = game.playerWhite === user.id ? game.playerBlack : game.playerWhite;
  const opponent = users.get(opponentId);
  send(user.socket, { type: "game_paused" });
  if (opponent) send(opponent.socket, { type: "game_paused" });
  if (opponent) send(opponent.socket, { type: "opponent_agent_finished" });
}

function handleMove(user: User, from: string, to: string) {
  const game = ensureGame(user);
  if (!game) {
    send(user.socket, { type: "move_rejected", reason: "No active game" });
    return;
  }
  game.fen = `${from}-${to}`;
  game.currentTurn = game.currentTurn === "white" ? "black" : "white";
  const opponentId = game.playerWhite === user.id ? game.playerBlack : game.playerWhite;
  const opponent = users.get(opponentId);
  const message: ServerMessage = { type: "move_accepted", fen: game.fen, turn: game.currentTurn };
  send(user.socket, message);
  if (opponent) send(opponent.socket, message);
}

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const help = process.argv.includes("--help") || process.argv.includes("-h");

if (help) {
  process.stdout.write("Usage: codechess-server --port=3000\n");
  process.exit(0);
}

const port = portArg ? Number(portArg.split("=", 2)[1]) : 3000;
const wss = new WebSocketServer({ port, host: "127.0.0.1" });

wss.on("connection", (socket) => {
  let currentUser: User | null = null;

  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString()) as ClientMessage;
    if (parsed.type === "hello") {
      const user = users.get(parsed.userId) ?? { id: parsed.userId, socket, waitingForAgent: false, currentGameId: null };
      user.socket = socket;
      users.set(parsed.userId, user);
      currentUser = user;
      return;
    }

    if (!currentUser) return;
    if (parsed.type === "waiting") handleWaiting(currentUser);
    if (parsed.type === "done") handleDone(currentUser);
    if (parsed.type === "move") handleMove(currentUser, parsed.from, parsed.to);
    if (parsed.type === "disconnect") socket.close();
  });

  socket.on("close", () => {
    if (currentUser) {
      cleanupWaiting(currentUser.id);
      users.delete(currentUser.id);
    }
  });
});

process.stdout.write(`CodeChess temporary WebSocket endpoint listening on ws://localhost:${port}\n`);
