import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";

import {
  parseClientMessage,
  type ClientMessage,
  type PeerRole,
  type ServerMessage,
} from "@codechess/shared";
import { Chess } from "chess.js";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { LeaseManager } from "./activity/lease-manager.js";
import { createApiHandler } from "./http/api.js";
import { RoomStore } from "./rooms/room-store.js";

export type ConnectedUser = {
  id: string;
  uiSocket: WebSocket | null;
  agentSocket: WebSocket | null;
  waitingForAgent: boolean;
  currentGameId: string | null;
};

export type Game = {
  id: string;
  playerWhite: string;
  playerBlack: string;
  fen: string;
  pgn: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  currentTurn: "white" | "black";
};

export type CodeChessServer = {
  httpServer: HttpServer;
  webSocketServer: WebSocketServer;
  roomStore: RoomStore;
  users: Map<string, ConnectedUser>;
  games: Map<string, Game>;
  gamesByPair: Map<string, string>;
  close: () => Promise<void>;
};

type ConnectionIdentity = {
  userId: string;
  role: PeerRole;
  roomCode?: string;
};

export type CodeChessServerOptions = {
  host?: string;
  leaseMs?: number;
  sweepMs?: number;
  pingMs?: number;
  handshakeMs?: number;
  maxPayloadBytes?: number;
  maxRooms?: number;
  roomTtlMs?: number;
  allowLegacyProtocol?: boolean;
};

function send(socket: WebSocket | null, message: ServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(data: RawData): ClientMessage | null {
  try {
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : Buffer.from(data as ArrayBuffer).toString("utf8");
    return parseClientMessage(JSON.parse(text));
  } catch {
    return null;
  }
}

function pairKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(":");
}

function socketField(role: PeerRole): "uiSocket" | "agentSocket" {
  return role === "ui" ? "uiSocket" : "agentSocket";
}

function isAllowedForRole(message: ClientMessage, role: PeerRole): boolean {
  if (message.type === "hello") {
    return false;
  }
  if (message.type === "disconnect") {
    return true;
  }
  return role === "ui" ? message.type === "move" : message.type === "waiting" || message.type === "done";
}

export function createCodeChessServer(port = 8080, options: CodeChessServerOptions = {}): CodeChessServer {
  const users = new Map<string, ConnectedUser>();
  const games = new Map<string, Game>();
  const gamesByPair = new Map<string, string>();
  const roomStore = new RoomStore({
    maxRooms: options.maxRooms,
    roomTtlMs: options.roomTtlMs,
  });
  let reconcilePublicRoom = (_roomCode: string): void => undefined;
  const httpServer = createServer(createApiHandler({
    roomStore,
    leaseMs: options.leaseMs,
    onActivityChanged: (roomCode) => reconcilePublicRoom(roomCode),
  }));
  const webSocketServer = new WebSocketServer({
    server: httpServer,
    maxPayload: options.maxPayloadBytes ?? 64 * 1_024,
  });
  httpServer.listen(port, options.host);

  function sendToUi(user: ConnectedUser | undefined, message: ServerMessage): void {
    if (user) {
      send(user.uiSocket, message);
    }
  }

  function resumeGame(game: Game, first: ConnectedUser, second: ConnectedUser): void {
    game.status = "ACTIVE";
    first.currentGameId = game.id;
    second.currentGameId = game.id;

    const resumed: ServerMessage = {
      type: "game_resumed",
      fen: game.fen,
      pgn: game.pgn,
    };
    sendToUi(first, resumed);
    sendToUi(second, resumed);
    console.log(`Match resumed: ${game.playerWhite} vs ${game.playerBlack}`);
  }

  function createGame(first: ConnectedUser, second: ConnectedUser): Game {
    const chess = new Chess();
    const firstIsWhite = Math.random() < 0.5;
    const white = firstIsWhite ? first : second;
    const black = firstIsWhite ? second : first;
    const game: Game = {
      id: randomUUID(),
      playerWhite: white.id,
      playerBlack: black.id,
      fen: chess.fen(),
      pgn: chess.pgn(),
      status: "ACTIVE",
      currentTurn: "white",
    };
    games.set(game.id, game);
    gamesByPair.set(pairKey(white.id, black.id), game.id);
    white.currentGameId = game.id;
    black.currentGameId = game.id;
    sendToUi(white, { type: "match_found", gameId: game.id, color: "white", fen: game.fen });
    sendToUi(black, { type: "match_found", gameId: game.id, color: "black", fen: game.fen });
    const initialState: ServerMessage = { type: "game_state", fen: game.fen, turn: "white" };
    sendToUi(white, initialState);
    sendToUi(black, initialState);
    return game;
  }

  function tryMatch(user: ConnectedUser): void {
    if (user.uiSocket?.readyState !== WebSocket.OPEN) {
      return;
    }

    if (user.currentGameId) {
      const currentGame = games.get(user.currentGameId);
      if (!currentGame || currentGame.status !== "PAUSED") {
        sendToUi(user, { type: "error", reason: "User is already in a game" });
        return;
      }

      const opponentId =
        currentGame.playerWhite === user.id
          ? currentGame.playerBlack
          : currentGame.playerWhite;
      const opponent = users.get(opponentId);
      if (
        opponent?.waitingForAgent &&
        opponent.uiSocket?.readyState === WebSocket.OPEN
      ) {
        resumeGame(currentGame, user, opponent);
      } else {
        sendToUi(user, { type: "waiting_for_player" });
      }
      return;
    }

    const opponent = [...users.values()].find(
      (candidate) =>
        candidate.id !== user.id &&
        candidate.waitingForAgent &&
        candidate.currentGameId === null &&
        candidate.uiSocket?.readyState === WebSocket.OPEN,
    );

    if (!opponent) {
      sendToUi(user, { type: "waiting_for_player" });
      return;
    }

    const existingGameId = gamesByPair.get(pairKey(user.id, opponent.id));
    const existingGame = existingGameId ? games.get(existingGameId) : undefined;
    if (existingGame?.status === "PAUSED") {
      resumeGame(existingGame, user, opponent);
      return;
    }

    const game = createGame(user, opponent);
    console.log(`Match created: ${game.playerWhite} (white) vs ${game.playerBlack} (black)`);
  }

  function handleMove(
    user: ConnectedUser,
    message: Extract<ClientMessage, { type: "move" }>,
  ): void {
    if (!user.currentGameId) {
      sendToUi(user, { type: "move_rejected", reason: "User is not in a game" });
      return;
    }

    const game = games.get(user.currentGameId);
    if (!game || game.status !== "ACTIVE") {
      sendToUi(user, { type: "move_rejected", reason: "Game is not active" });
      return;
    }

    const userColor = game.playerWhite === user.id ? "white" : "black";
    if (game.currentTurn !== userColor) {
      sendToUi(user, { type: "move_rejected", reason: "It is not your turn" });
      return;
    }

    const chess = game.pgn ? new Chess() : new Chess(game.fen);
    if (game.pgn) {
      chess.loadPgn(game.pgn);
    }
    try {
      chess.move({ from: message.from, to: message.to, promotion: "q" });
    } catch {
      sendToUi(user, { type: "move_rejected", reason: "Illegal chess move" });
      return;
    }

    game.fen = chess.fen();
    game.pgn = chess.pgn();
    game.currentTurn = chess.turn() === "w" ? "white" : "black";
    const isGameOver = chess.isGameOver();
    if (isGameOver) {
      game.status = "COMPLETED";
      const room = roomStore.findPlayer(user.id)?.room;
      if (room) {
        roomStore.clearRoomActivities(room.code);
      }
    }

    const update: ServerMessage = isGameOver
      ? { type: "game_completed", fen: game.fen, pgn: game.pgn }
      : {
          type: "move_accepted",
          fen: game.fen,
          turn: game.currentTurn,
        };
    sendToUi(users.get(game.playerWhite), update);
    sendToUi(users.get(game.playerBlack), update);
  }

  function pauseGame(user: ConnectedUser, notifyOpponentFinished: boolean): void {
    if (!user.currentGameId) {
      return;
    }

    const game = games.get(user.currentGameId);
    if (!game || game.status !== "ACTIVE") {
      return;
    }

    game.status = "PAUSED";
    const white = users.get(game.playerWhite);
    const black = users.get(game.playerBlack);
    sendToUi(white, { type: "game_paused" });
    sendToUi(black, { type: "game_paused" });

    if (notifyOpponentFinished) {
      const opponent = user.id === game.playerWhite ? black : white;
      sendToUi(opponent, { type: "opponent_agent_finished" });
    }
    console.log(`Match paused: ${game.playerWhite} vs ${game.playerBlack}`);
  }

  function handleDone(user: ConnectedUser): void {
    user.waitingForAgent = false;
    pauseGame(user, true);
  }

  function publicUser(playerId: string): ConnectedUser {
    const existing = users.get(playerId);
    if (existing) return existing;
    const created: ConnectedUser = {
      id: playerId,
      uiSocket: null,
      agentSocket: null,
      waitingForAgent: false,
      currentGameId: null,
    };
    users.set(playerId, created);
    return created;
  }

  reconcilePublicRoom = (roomCode): void => {
    const room = roomStore.getRoom(roomCode);
    if (!room) return;
    const players = room.players.map((seat) => publicUser(seat.id));
    const bothSeated = players.length === 2;
    const bothActive = bothSeated && room.players.every((seat) => roomStore.isActive(seat.id));
    const game = room.currentGameId ? games.get(room.currentGameId) : undefined;

    if (!bothActive) {
      if (game?.status === "ACTIVE") {
        game.status = "PAUSED";
        for (const player of players) sendToUi(player, { type: "game_paused" });
      } else if (!game) {
        for (const player of players) sendToUi(player, { type: "waiting_for_player" });
      }
      return;
    }

    if (game?.status === "ACTIVE") return;
    if (game?.status === "PAUSED") {
      resumeGame(game, players[0]!, players[1]!);
      return;
    }

    if (game?.status === "COMPLETED") {
      games.delete(game.id);
      gamesByPair.delete(pairKey(game.playerWhite, game.playerBlack));
    }
    const nextGame = createGame(players[0]!, players[1]!);
    room.currentGameId = nextGame.id;
  };

  function attachRoomSocket(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "room_hello" }>,
  ): ConnectionIdentity | null {
    const authenticated = roomStore.authenticate(message.playerToken);
    if (!authenticated) {
      send(socket, { type: "error", reason: "Invalid player token" });
      socket.close(4001, "Unauthorized");
      return null;
    }
    const user = publicUser(authenticated.player.id);
    const previousSocket = user.uiSocket;
    user.uiSocket = socket;
    user.currentGameId = authenticated.room.currentGameId;
    if (previousSocket && previousSocket !== socket) {
      previousSocket.close(4000, "Replaced by a newer connection");
    }
    send(socket, {
      type: "room_hello_ack",
      roomCode: authenticated.room.code,
      playerId: authenticated.player.id,
    });

    const game = user.currentGameId ? games.get(user.currentGameId) : undefined;
    if (game) {
      send(socket, {
        type: "match_found",
        gameId: game.id,
        color: game.playerWhite === user.id ? "white" : "black",
        fen: game.fen,
      });
      if (game.status === "ACTIVE") {
        send(socket, { type: "game_state", fen: game.fen, turn: game.currentTurn });
      } else if (game.status === "PAUSED") {
        send(socket, { type: "game_paused" });
      } else {
        send(socket, { type: "game_completed", fen: game.fen, pgn: game.pgn });
      }
    } else {
      send(socket, { type: "waiting_for_player" });
    }
    reconcilePublicRoom(authenticated.room.code);
    return { userId: user.id, role: "ui", roomCode: authenticated.room.code };
  }

  function attachSocket(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "hello" }>,
  ): ConnectionIdentity {
    const user = users.get(message.userId) ?? {
      id: message.userId,
      uiSocket: null,
      agentSocket: null,
      waitingForAgent: false,
      currentGameId: null,
    };
    const field = socketField(message.role);
    const previousSocket = user[field];

    user[field] = socket;
    users.set(user.id, user);
    if (previousSocket && previousSocket !== socket) {
      previousSocket.close(4000, "Replaced by a newer connection");
    }

    send(socket, {
      type: "hello_ack",
      userId: user.id,
      role: message.role,
    });
    console.log(`User ${message.role} connected: ${user.id}`);

    if (message.role === "ui" && user.waitingForAgent) {
      tryMatch(user);
    }

    return { userId: user.id, role: message.role };
  }

  const liveSockets = new WeakSet<WebSocket>();

  webSocketServer.on("connection", (socket) => {
    let identity: ConnectionIdentity | null = null;
    liveSockets.add(socket);
    socket.on("error", () => {
      // Protocol errors (including maxPayload violations) close only this peer.
    });
    socket.on("pong", () => liveSockets.add(socket));
    const handshakeTimer = setTimeout(() => {
      if (!identity) socket.close(4008, "Authentication timeout");
    }, options.handshakeMs ?? 10_000);
    handshakeTimer.unref();

    socket.on("message", (data) => {
      const message = parseMessage(data);

      if (!message) {
        send(socket, { type: "error", reason: "Invalid protocol message" });
        return;
      }

      if (message.type === "hello") {
        if (identity) {
          send(socket, { type: "error", reason: "Socket is already registered" });
          return;
        }
        if (options.allowLegacyProtocol === false) {
          send(socket, { type: "error", reason: "Legacy protocol is disabled" });
          socket.close(4001, "Unauthorized");
          return;
        }
        if (roomStore.findPlayer(message.userId)) {
          send(socket, { type: "error", reason: "User id is reserved by a public room" });
          socket.close(4001, "Unauthorized");
          return;
        }
        identity = attachSocket(socket, message);
        clearTimeout(handshakeTimer);
        return;
      }

      if (message.type === "room_hello") {
        if (identity) {
          send(socket, { type: "error", reason: "Socket is already registered" });
          return;
        }
        identity = attachRoomSocket(socket, message);
        if (identity) clearTimeout(handshakeTimer);
        return;
      }

      if (!identity) {
        send(socket, { type: "error", reason: "Send hello before other messages" });
        return;
      }

      const user = users.get(identity.userId);
      if (!user || user[socketField(identity.role)] !== socket) {
        send(socket, { type: "error", reason: "Socket is no longer registered" });
        return;
      }

      if (identity.roomCode && message.type !== "move" && message.type !== "disconnect") {
        send(socket, { type: "error", reason: `${message.type} is not allowed for a room terminal` });
        return;
      }

      if (!identity.roomCode && !isAllowedForRole(message, identity.role)) {
        send(socket, {
          type: "error",
          reason: `${message.type} is not allowed for the ${identity.role} role`,
        });
        return;
      }

      if (message.type === "waiting") {
        user.waitingForAgent = true;
        tryMatch(user);
        return;
      }

      if (message.type === "move") {
        handleMove(user, message);
        return;
      }

      if (message.type === "done") {
        handleDone(user);
        return;
      }

      socket.close(1000, "Client disconnected");
    });

    socket.on("close", () => {
      clearTimeout(handshakeTimer);
      if (!identity) {
        return;
      }

      const user = users.get(identity.userId);
      const field = socketField(identity.role);
      if (!user || user[field] !== socket) {
        return;
      }

      user[field] = null;
      if (identity.roomCode) {
        return;
      } else if (identity.role === "agent") {
        user.waitingForAgent = false;
        pauseGame(user, false);
      } else {
        pauseGame(user, false);
      }

      if (!user.uiSocket && !user.agentSocket && !user.currentGameId) {
        users.delete(user.id);
      }
      console.log(`User ${identity.role} disconnected: ${identity.userId}`);
    });
  });

  const leaseManager = new LeaseManager(
    roomStore,
    (roomCodes) => {
      for (const roomCode of roomCodes) reconcilePublicRoom(roomCode);
    },
    options.sweepMs,
  );

  const socketPing = setInterval(() => {
    for (const client of webSocketServer.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (!liveSockets.has(client)) {
        client.terminate();
        continue;
      }
      liveSockets.delete(client);
      client.ping();
    }
  }, options.pingMs ?? 30_000);
  socketPing.unref();

  return {
    httpServer,
    webSocketServer,
    roomStore,
    users,
    games,
    gamesByPair,
    close: () =>
      new Promise((resolve, reject) => {
        leaseManager.close();
        clearInterval(socketPing);
        for (const client of webSocketServer.clients) {
          client.terminate();
        }
        webSocketServer.close((webSocketError) => {
          if (webSocketError) return reject(webSocketError);
          httpServer.close((httpError) => (httpError ? reject(httpError) : resolve()));
        });
      }),
  };
}
