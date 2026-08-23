# Person 2: Multiplayer + Game Server

Owner of everything involving communication between the two terminals. The server is the source of truth for game and user state.

Protocol contract: [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md).

## Must have

- [ ] WebSocket server (`ws`)
- [ ] Track connected users: `Map<userId, User>`
- [ ] Track waiting users (eligible when `connected && waitingForAgent`)
- [ ] Track games: `Map<gameId, Game>`
- [ ] Handle `hello` → register user, attach socket
- [ ] Handle `waiting` → `user.waitingForAgent = true`, run matchmaking check
- [ ] Handle `done` → `user.waitingForAgent = false`, pause any active game
- [ ] Handle `move` → validate turn + legality via `chess.js`, update FEN, broadcast
- [ ] Matchmaking: two waiting users with no existing pair → find existing game for this pair, else create new game → status `ACTIVE`
- [ ] Pause: either player sends `done` → status `PAUSED`, broadcast `game_paused` to both, `opponent_agent_finished` to the other player specifically
- [ ] Resume: same two players both become `waitingForAgent = true` again with a stored game for the pair → load stored FEN/PGN, status `ACTIVE`, broadcast `game_resumed`
- [ ] In-memory persistence: `const games = new Map()`, keyed by `gameId`, keeps state for the life of the server process

## Stretch

- [ ] Multiple simultaneous games (beyond a single pair at a time)
- [ ] Disconnect/reconnect handling (don't just drop the game state)
- [ ] Database persistence across server restarts

## Server-internal records

```ts
interface Game {
    id: string
    playerWhite: string
    playerBlack: string
    fen: string
    pgn: string
    status: "ACTIVE" | "PAUSED" | "COMPLETED"
    currentTurn: "white" | "black"
}

interface User {
    id: string
    socket: WebSocket
    waitingForAgent: boolean
    currentGameId: string | null
}
```

## Move flow

```
receive { type: "move", from, to }
  → find user's current game
  → verify it is this user's turn (game.currentTurn matches user's color)
  → chess.js: attempt move
  → legal?
      yes → update fen/pgn/currentTurn, broadcast move_accepted to both players
      no  → send move_rejected to sender only, with reason
```

## Matchmaking flow

```
on "waiting":
  mark user.waitingForAgent = true
  find another connected user with waitingForAgent === true and no currentGameId
  if none: send waiting_for_player to this user
  if found:
    look up existing game for this exact pair (by sorted userId pair, e.g. in a Map<pairKey, gameId>)
    if exists: reactivate it (status = ACTIVE), send game_resumed to both
    else: create new Game (fresh FEN, random color assignment), send match_found to both
```

## Server success test (do this before integrating Codex)

This must work with two plain WebSocket clients (can be a throwaway test script, doesn't need the real terminal UI) before Person 3's agent integration or Person 1's full UI are wired in:

```
Terminal A sends: { type: "move", from: "e2", to: "e4" }
       → server validates, updates state
       → Terminal B receives: { type: "move_accepted", fen: "...", turn: "black" }

Terminal B sends: { type: "move", from: "e7", to: "e5" }
       → Terminal A receives the update
```

## Suggested libraries

`ws` for the WebSocket server, `chess.js` for move validation/state (FEN/PGN generation, legal move checks — do not hand-roll chess rules).
