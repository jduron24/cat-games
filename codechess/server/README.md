# CodeChess Multiplayer Server

The WebSocket server owns user, match, and chess state. It stores separate UI
and agent sockets under one logical user ID and enforces each role's protocol
messages.

## Start the server

Run from the repository root:

```bash
npm run server
```

The server listens on `ws://localhost:8080`. Override the port when needed:

```bash
PORT=8090 npm run server
```

Set `CODECHESS_WS_URL=ws://localhost:8090` for both clients when changing the
port.

## State model

```ts
type ConnectedUser = {
  id: string;
  uiSocket: WebSocket | null;
  agentSocket: WebSocket | null;
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
```

The server matches two users only when both have open UI sockets and waiting
agents. It validates moves with `chess.js`, preserves full PGN history, defaults
promotion to a queen, and completes checkmate or draw positions. `done` pauses
the active game; a later `waiting` from both agents resumes its FEN and PGN.

State persists only for the life of the server process. Authentication,
database persistence, and reconnecting after a server restart remain out of
scope.

See the [shared protocol](../shared/PROTOCOL.md) for message ownership and wire
formats.
