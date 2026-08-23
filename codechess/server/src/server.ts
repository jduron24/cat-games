import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";
import { WebSocket, WebSocketServer } from "ws";

type HelloMessage = {
  type: "hello";
  userId: string;
};

type ClientMessage =
  | HelloMessage
  | { type: "waiting" }
  | { type: "done" }
  | { type: "move"; from: string; to: string }
  | { type: "disconnect" };

type ConnectedUser = {
  id: string;
  socket: WebSocket;
  waitingForAgent: boolean;
  currentGameId: string | null;
};

type Game = {
  id: string;
  playerWhite: string;
  playerBlack: string;
  fen: string;
  pgn: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  currentTurn: "white" | "black";
};

export type CodeChessServer = {
  webSocketServer: WebSocketServer;
  users: Map<string, ConnectedUser>;
  games: Map<string, Game>;
  gamesByPair: Map<string, string>;
  close: () => Promise<void>;
};

function send(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(data: Buffer): ClientMessage | null {
  try {
    const message: unknown = JSON.parse(data.toString());

    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      typeof message.type !== "string"
    ) {
      return null;
    }

    return message as ClientMessage;
  } catch {
    return null;
  }
}

function pairKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(":");
}

export function createCodeChessServer(port = 8080): CodeChessServer {
  const users = new Map<string, ConnectedUser>();
  const games = new Map<string, Game>();
  const gamesByPair = new Map<string, string>();
  const webSocketServer = new WebSocketServer({ port });

  function resumeGame(game: Game, first: ConnectedUser, second: ConnectedUser): void {
    game.status = "ACTIVE";
    first.currentGameId = game.id;
    second.currentGameId = game.id;

    const resumed = {
      type: "game_resumed",
      fen: game.fen,
      pgn: game.pgn,
    };
    send(first.socket, resumed);
    send(second.socket, resumed);
    console.log(`Match resumed: ${game.playerWhite} vs ${game.playerBlack}`);
  }

  function tryMatch(user: ConnectedUser): void {
    if (user.currentGameId) {
      const currentGame = games.get(user.currentGameId);
      if (!currentGame || currentGame.status !== "PAUSED") {
        send(user.socket, { type: "error", reason: "User is already in a game" });
        return;
      }

      const opponentId =
        currentGame.playerWhite === user.id
          ? currentGame.playerBlack
          : currentGame.playerWhite;
      const opponent = users.get(opponentId);
      if (opponent?.waitingForAgent && opponent.socket.readyState === WebSocket.OPEN) {
        resumeGame(currentGame, user, opponent);
      } else {
        send(user.socket, { type: "waiting_for_player" });
      }
      return;
    }

    const opponent = [...users.values()].find(
      (candidate) =>
        candidate.id !== user.id &&
        candidate.waitingForAgent &&
        candidate.currentGameId === null &&
        candidate.socket.readyState === WebSocket.OPEN,
    );

    if (!opponent) {
      send(user.socket, { type: "waiting_for_player" });
      return;
    }

    const existingGameId = gamesByPair.get(pairKey(user.id, opponent.id));
    const existingGame = existingGameId ? games.get(existingGameId) : undefined;
    if (existingGame?.status === "PAUSED") {
      resumeGame(existingGame, user, opponent);
      return;
    }

    const chess = new Chess();
    const userIsWhite = Math.random() < 0.5;
    const white = userIsWhite ? user : opponent;
    const black = userIsWhite ? opponent : user;
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

    send(white.socket, {
      type: "match_found",
      gameId: game.id,
      color: "white",
      fen: game.fen,
    });
    send(black.socket, {
      type: "match_found",
      gameId: game.id,
      color: "black",
      fen: game.fen,
    });

    const initialState = { type: "game_state", fen: game.fen, turn: game.currentTurn };
    send(white.socket, initialState);
    send(black.socket, initialState);
    console.log(`Match created: ${white.id} (white) vs ${black.id} (black)`);
  }

  function handleMove(
    user: ConnectedUser,
    message: Extract<ClientMessage, { type: "move" }>,
  ): void {
    if (!user.currentGameId) {
      send(user.socket, { type: "move_rejected", reason: "User is not in a game" });
      return;
    }

    const game = games.get(user.currentGameId);
    if (!game || game.status !== "ACTIVE") {
      send(user.socket, { type: "move_rejected", reason: "Game is not active" });
      return;
    }

    const userColor = game.playerWhite === user.id ? "white" : "black";
    if (game.currentTurn !== userColor) {
      send(user.socket, { type: "move_rejected", reason: "It is not your turn" });
      return;
    }

    if (!/^[a-h][1-8]$/.test(message.from) || !/^[a-h][1-8]$/.test(message.to)) {
      send(user.socket, { type: "move_rejected", reason: "Invalid chess square" });
      return;
    }

    const chess = new Chess(game.fen);
    try {
      chess.move({ from: message.from, to: message.to });
    } catch {
      send(user.socket, { type: "move_rejected", reason: "Illegal chess move" });
      return;
    }

    game.fen = chess.fen();
    game.pgn = chess.pgn();
    game.currentTurn = chess.turn() === "w" ? "white" : "black";

    const update = {
      type: "move_accepted",
      fen: game.fen,
      turn: game.currentTurn,
    };
    const white = users.get(game.playerWhite);
    const black = users.get(game.playerBlack);
    if (white) send(white.socket, update);
    if (black) send(black.socket, update);
  }

  function handleDone(user: ConnectedUser): void {
    user.waitingForAgent = false;

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
    if (white) send(white.socket, { type: "game_paused" });
    if (black) send(black.socket, { type: "game_paused" });

    const opponent = user.id === game.playerWhite ? black : white;
    if (opponent) {
      send(opponent.socket, { type: "opponent_agent_finished" });
    }
    console.log(`Match paused: ${game.playerWhite} vs ${game.playerBlack}`);
  }

  webSocketServer.on("connection", (socket) => {
    let connectedUserId: string | null = null;

    socket.on("message", (data) => {
      const message = parseMessage(Buffer.from(data as ArrayBuffer));

      if (!message) {
        send(socket, { type: "error", reason: "Invalid JSON message" });
        return;
      }

      if (message.type === "hello") {
        if (!message.userId?.trim()) {
          send(socket, { type: "error", reason: "hello requires a userId" });
          return;
        }

        connectedUserId = message.userId.trim();
        users.set(connectedUserId, {
          id: connectedUserId,
          socket,
          waitingForAgent: false,
          currentGameId: null,
        });

        send(socket, { type: "hello_ack", userId: connectedUserId });
        console.log(`User connected: ${connectedUserId}`);
        return;
      }

      if (!connectedUserId) {
        send(socket, { type: "error", reason: "Send hello before other messages" });
        return;
      }

      const user = users.get(connectedUserId);
      if (!user) {
        send(socket, { type: "error", reason: "User is no longer registered" });
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

      send(socket, {
        type: "error",
        reason: `${message.type} is not implemented yet`,
      });
    });

    socket.on("close", () => {
      if (connectedUserId) {
        users.delete(connectedUserId);
        console.log(`User disconnected: ${connectedUserId}`);
      }
    });
  });

  return {
    webSocketServer,
    users,
    games,
    gamesByPair,
    close: () =>
      new Promise((resolve, reject) => {
        for (const client of webSocketServer.clients) {
          client.terminate();
        }
        webSocketServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
