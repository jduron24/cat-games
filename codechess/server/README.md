# CodeChess Multiplayer Server

The public HTTP/WebSocket server owns private rooms, player activity leases,
and authoritative chess state. Room tokens authenticate terminal sockets and
activity events. Production startup disables the unauthenticated legacy demo
protocol.

## Start the server

Run from the repository root:

```bash
npm run server
```

The server listens for HTTP and WebSocket traffic on `0.0.0.0:8080`. Override
the port when needed:

```bash
PORT=8090 npm run server
```

Health is available at `GET /healthz`. Public routes are `POST /v1/rooms`,
`POST /v1/rooms/:roomCode/join`, and authenticated `POST /v1/activity`.

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

State persists only for the life of the server process. Run exactly one public
instance. Rooms expire after 24 hours and the process caps room storage at
1,000 rooms. Database persistence, multi-instance coordination, and recovery
after a server restart remain out of scope.

See the [shared protocol](../shared/PROTOCOL.md) for message ownership and wire
formats.
