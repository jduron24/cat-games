# Shared WebSocket Protocol

Owner: all three tracks jointly. This is the contract everyone codes against.

**Lock this before writing client/server/agent code.** Once agreed, avoid changing these shapes unless required — every change here is a change in three places at once.

The server is the source of truth for game state. Clients never compute chess legality themselves; they render what the server tells them and propose moves.

The server only ever transmits game-related information — never shell commands, terminal history, source code, AI prompts, files, or arbitrary messages.

## Client → Server

```ts
type ClientMessage =
    | { type: "hello"; userId: string; role: "ui" | "agent" }
    | { type: "room_hello"; playerToken: string }
    | { type: "waiting" }
    | { type: "done" }
    | { type: "move"; from: string; to: string }
    | { type: "disconnect" }
```

| Message | Sent when | Sent by |
|---|---|---|
| `hello` | on connect, to identify the logical user and socket role | client and agent |
| `waiting` | agent's `turn.started` fires | agent integration (Person 3) |
| `done` | agent's `turn.completed` fires | agent integration (Person 3) |
| `move` | user submits a move (keyboard Enter/Enter or click/click) | client (Person 1) |
| `disconnect` | clean shutdown, if reachable | client (Person 1) |

`from` / `to` are algebraic squares, e.g. `"e2"`, `"e4"`.

The TUI and agent runner are separate processes. They connect with the same
`userId` and different roles. The `ui` role may send moves; the `agent` role
may send lifecycle messages (`waiting` and `done`).

## Server → Client

```ts
type ServerMessage =
    | { type: "hello_ack"; userId: string; role: "ui" | "agent" }
    | { type: "room_hello_ack"; roomCode: string; playerId: string }
    | { type: "error"; reason: string }
    | { type: "waiting_for_player" }
    | {
        type: "match_found"
        gameId: string
        color: "white" | "black"
        fen: string
      }
    | {
        type: "game_state"
        fen: string
        turn: "white" | "black"
      }
    | { type: "move_accepted"; fen: string; turn: "white" | "black" }
    | { type: "game_completed"; fen: string; pgn: string }
    | { type: "move_rejected"; reason: string }
    | { type: "game_paused" }
    | { type: "opponent_agent_finished" }
    | { type: "game_resumed"; fen: string; pgn: string }
```

| Message | Sent when | Consumed by |
|---|---|---|
| `hello_ack` | a UI or agent socket has been attached to a logical user | connecting socket |
| `room_hello_ack` | a public terminal token has authenticated its room seat | connecting terminal |
| `error` | a message is malformed or not allowed for the socket role | sending socket |
| `waiting_for_player` | user is waiting, no opponent yet | client UI: show "Waiting for another developer..." |
| `match_found` | matchmaking paired two waiting users | client UI: mount the board, note assigned color |
| `game_state` | full state sync (e.g. right after match, or on reconnect) | client UI: render board |
| `move_accepted` | a submitted move was legal and applied | client UI: redraw board, flip turn indicator |
| `game_completed` | an accepted move ended the game | client UI: load the final position and freeze the board as completed |
| `move_rejected` | a submitted move was illegal | client UI: show reason, keep selection cleared |
| `game_paused` | either player's agent finished | client UI: freeze board, show paused banner |
| `opponent_agent_finished` | specifically the *other* player's agent finished (distinguishes from your own `done`) | client UI: "Opponent's agent finished. Game paused." |
| `game_resumed` | both players waiting again and a prior game exists for this pair | client UI: load FEN/PGN, show "Game resumed" |

## Game record (server-internal, not wire format)

```ts
interface Game {
    id: string
    playerWhite: string   // userId
    playerBlack: string   // userId
    fen: string
    pgn: string
    status: "ACTIVE" | "PAUSED" | "COMPLETED"
    currentTurn: "white" | "black"
}
```

## User record (server-internal, not wire format)

```ts
interface User {
    id: string
    uiSocket: WebSocket | null
    agentSocket: WebSocket | null
    waitingForAgent: boolean
    currentGameId: string | null
}
```

A user is matchmaking-eligible when its UI socket is connected and
`waitingForAgent === true`.

## Public room HTTP API

The installable companion uses HTTP for short-lived setup and hook events:

```text
GET  /healthz
POST /v1/rooms
POST /v1/rooms/:roomCode/join
POST /v1/activity
```

Room creation accepts `{ "displayName": "Alice" }`. Joining accepts the same
display name in the body and an eight-character code such as `BLUE-CAT7` in
the URL. Both return a room code, player ID, and opaque player token. Activity
requests use `Authorization: Bearer <playerToken>` and carry an activity ID
plus `start`, `heartbeat`, or `stop`.

Public terminals authenticate by sending `room_hello` with their player token.
The server replies with `room_hello_ack`, then sends the existing chess state
messages. Tokens, prompts, source code, and terminal history never appear in
logs or game messages.

The hackathon server keeps public rooms and games in memory. Restarting the
server clears every room, token, and saved position.

## Sequence reference

**Match + move:**

```
A UI: hello(role=ui)       →
A agent: hello(role=agent) →
A agent: waiting           →          (no opponent yet) ← waiting_for_player (A UI)
B UI: hello(role=ui)       →
B agent: hello(role=agent) →
B agent: waiting           →          ← match_found (both UIs)
A: move e2-e4   →                    ← move_accepted (both A and B)
B: move e7-e5   →                    ← move_accepted (both A and B)
... terminal move ...                ← game_completed (both A and B)
```

**Pause + resume:**

```
B: done         →                    ← game_paused (A: also opponent_agent_finished)
... time passes, server keeps Game in memory (games.get(gameId)) ...
A: waiting      →
B: waiting      →                    ← game_resumed (both, loaded from stored fen/pgn)
```

## Change process

If a shape here needs to change mid-hackathon: whoever needs the change pings the other two before editing this file. Don't let client/server drift out of sync with undocumented ad-hoc fields.
