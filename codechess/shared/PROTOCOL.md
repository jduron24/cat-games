# Shared WebSocket Protocol

Owner: all three tracks jointly. This is the contract everyone codes against.

**Lock this before writing client/server/agent code.** Once agreed, avoid changing these shapes unless required — every change here is a change in three places at once.

The server is the source of truth for game state. Clients never compute chess legality themselves; they render what the server tells them and propose moves.

The server only ever transmits game-related information — never shell commands, terminal history, source code, AI prompts, files, or arbitrary messages.

## Client → Server

```ts
type ClientMessage =
    | { type: "hello"; userId: string }
    | { type: "waiting" }
    | { type: "done" }
    | { type: "move"; from: string; to: string }
    | { type: "disconnect" }
```

| Message | Sent when | Sent by |
|---|---|---|
| `hello` | on connect, to identify the user | client (Person 1) |
| `waiting` | agent's `turn.started` fires | agent integration (Person 3) |
| `done` | agent's `turn.completed` fires | agent integration (Person 3) |
| `move` | user submits a move (keyboard Enter/Enter or click/click) | client (Person 1) |
| `disconnect` | clean shutdown, if reachable | client (Person 1) |

`from` / `to` are algebraic squares, e.g. `"e2"`, `"e4"`.

## Server → Client

```ts
type ServerMessage =
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
    | { type: "move_rejected"; reason: string }
    | { type: "game_paused" }
    | { type: "opponent_agent_finished" }
    | { type: "game_resumed"; fen: string; pgn: string }
```

| Message | Sent when | Consumed by |
|---|---|---|
| `waiting_for_player` | user is waiting, no opponent yet | client UI: show "Waiting for another developer..." |
| `match_found` | matchmaking paired two waiting users | client UI: mount the board, note assigned color |
| `game_state` | full state sync (e.g. right after match, or on reconnect) | client UI: render board |
| `move_accepted` | a submitted move was legal and applied | client UI: redraw board, flip turn indicator |
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
    socket: WebSocket
    waitingForAgent: boolean
    currentGameId: string | null
}
```

A user is matchmaking-eligible when `connected === true && waitingForAgent === true`.

## Sequence reference

**Match + move:**

```
A: hello        →
A: waiting      →                    (no opponent yet) ← waiting_for_player
B: hello        →
B: waiting      →                    ← match_found (both A and B)
A: move e2-e4   →                    ← move_accepted (both A and B)
B: move e7-e5   →                    ← move_accepted (both A and B)
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
