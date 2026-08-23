# PRD: CodeChess

## Overview

CodeChess is a multiplayer terminal chess experience for developers using AI coding agents like Codex.

When a developer sends a prompt to an AI coding agent, there is often a period where the agent is reading files, writing code, running tests, or fixing errors. CodeChess turns that idle time into a shared multiplayer experience.

If two developers are both waiting on their AI agents at the same time, CodeChess automatically matches them into a live chess game inside their terminals.

The chess game only exists while both developers are waiting. If either developer's agent finishes, the game pauses and that developer immediately returns to their AI result.

The chess state is saved so that if those two developers are simultaneously waiting again later, they can resume the same game.

---

## Core Product Loop

```text
Developer A                         Developer B

Prompt Codex                        Prompt Codex
     │                                   │
     ▼                                   ▼
Codex working                       Codex working
     │                                   │
     └──────── Both waiting ─────────────┘
                      │
                      ▼
                 CodeChess
                      │
                Shared game
                      │
          ┌───────────┴───────────┐
          │                       │
       A moves                 B moves
          │                       │
          └───────────┬───────────┘
                      │
             One agent finishes
                      │
                      ▼
                  Game pauses
                      │
                      ▼
              AI response shown
```

---

## Hackathon Goal

Build a working end-to-end demo in approximately 4 hours.

The demo must prove:

1. Two different terminals can connect to the same game server.
2. A user only enters matchmaking while their AI agent is processing.
3. Two waiting users are automatically matched.
4. Chess is playable directly inside the terminal.
5. Moves appear in realtime in both terminals.
6. The game pauses when either AI agent finishes.
7. Game state can resume later.

Everything else is secondary.

---

## MVP Scope

### Required

* Terminal-based chess board
* Two users
* Realtime multiplayer
* Automatic matchmaking
* Chess move validation
* Keyboard navigation
* Click-to-select / click-to-move if feasible
* AI agent working state
* Game appears only when both users are waiting
* Game pauses when one agent finishes
* Chess state persists during the running server session
* Same game can resume later

### Stretch Goals

* Mouse drag-and-drop
* Better terminal animations
* Agent activity display
* Persistent storage across server restarts
* User aliases
* Rematch support
* Multiple simultaneous games

### Explicitly Out of Scope

Do not build during the hackathon:

* Accounts
* Authentication
* Elo
* Ranked matchmaking
* Friends
* Chat
* Spectators
* Chess clocks
* Tournaments
* Multiple games per person
* Full database architecture
* Custom chess engine
* Direct terminal-to-terminal shell access
* Shared shell sessions
* Claude / Gemini integrations
* Production security system

---

## Architecture

The terminals should **not connect directly to one another**.

Each CodeChess client connects to a central game server.

```text
┌──────────────────────┐
│ Developer A Terminal │
│                      │
│ Codex                │
│ CodeChess TUI        │
└──────────┬───────────┘
           │
           │ WebSocket
           │
           ▼
     ┌──────────────┐
     │ Game Server  │
     │              │
     │ Matchmaking  │
     │ Chess state  │
     │ User state   │
     └──────┬───────┘
            │
            │ WebSocket
            ▼
┌──────────────────────┐
│ Developer B Terminal │
│                      │
│ Codex                │
│ CodeChess TUI        │
└──────────────────────┘
```

The server only shares game information.

It does **not** send:

* shell commands
* terminal history
* source code
* AI prompts
* files
* arbitrary messages

Players interact only through chess.

---

## Recommended Stack

### Client

TypeScript / Node.js

Potential libraries:

* Terminal rendering: Terminal Kit, Ink, or simple ANSI rendering
* Chess state input/output: custom UI layer
* WebSocket client

### Server

TypeScript / Node.js

* `ws` for WebSockets
* `chess.js` for move validation and board state

### Agent Integration

Codex SDK / streamed Codex lifecycle events.

Relevant lifecycle:

```text
turn.started
↓
agent working
↓
item events
↓
turn.completed
```

CodeChess treats:

```text
turn.started
```

as:

```text
USER_WAITING = true
```

and:

```text
turn.completed
```

as:

```text
USER_WAITING = false
```

---

## Terminal Chess UX

The chessboard should be interactive inside the terminal.

Example:

```text
╭─────────────────────────────────────╮
│ CODECHESS                           │
│ Codex: ● Running tests              │
├─────────────────────────────────────┤
│                                     │
│       a  b  c  d  e  f  g  h       │
│                                     │
│   8   ♜  ♞  ♝  ♛  ♚  ♝  ♞  ♜      │
│   7   ♟  ♟  ♟  ♟  ♟  ♟  ♟  ♟      │
│   6   ·  ·  ·  ·  ·  ·  ·  ·      │
│   5   ·  ·  ·  ·  ·  ·  ·  ·      │
│   4   ·  ·  ·  ·  ♙  ·  ·  ·      │
│   3   ·  ·  ·  ·  ·  ·  ·  ·      │
│   2   ♙  ♙  ♙  ♙  ·  ♙  ♙  ♙      │
│   1   ♖  ♘  ♗  ♕  ♔  ♗  ♘  ♖      │
│                                     │
│            Opponent's turn          │
│                                     │
│  Mouse: click      Keys: ↑ ↓ ← →   │
╰─────────────────────────────────────╯
```

---

## Input Methods

### Priority 1: Keyboard

The user moves around the board with:

```text
↑
↓
←
→
```

Press:

```text
Enter
```

to select a piece.

Move the cursor.

Press:

```text
Enter
```

again to choose the destination.

Example:

```text
select e2
↓
move cursor to e4
↓
Enter
↓
submit e2 → e4
```

---

### Priority 2: Mouse Click

The terminal captures mouse coordinates.

First click:

```text
e2
```

selects the pawn.

Second click:

```text
e4
```

attempts the move.

The terminal UI converts screen coordinates into chess squares.

```text
terminal x/y
    ↓
board row/column
    ↓
chess square
    ↓
e2 → e4
```

---

### Stretch: Drag and Drop

Mouse down:

```text
e2
```

Drag:

```text
toward e4
```

Mouse release:

```text
e4
```

Client sends:

```text
e2 → e4
```

This is optional.

Click-to-move should be completed before drag-and-drop.

---

## Game State

The server is the source of truth.

Example:

```ts
Game {
    id
    playerWhite
    playerBlack
    fen
    pgn
    status
    currentTurn
}
```

Possible game states:

```text
ACTIVE
PAUSED
COMPLETED
```

---

## User State

Each connected user should have:

```ts
User {
    id
    socket
    waitingForAgent
    currentGameId
}
```

A user is eligible for matchmaking when:

```text
connected = true
AND
waitingForAgent = true
```

---

## Matchmaking

When a user's agent starts:

```text
USER_WAITING = true
```

The server checks:

```text
Is another user waiting?
```

If no:

```text
Waiting for another developer...
```

If yes:

```text
User A + User B
        ↓
find existing game
        OR
create new game
        ↓
GAME ACTIVE
```

---

## Realtime Events

### Client → Server

```text
hello
waiting
done
move
disconnect
```

Example:

```json
{
  "type": "move",
  "from": "e2",
  "to": "e4"
}
```

---

### Server → Client

```text
waiting_for_player
match_found
game_state
move_accepted
move_rejected
game_paused
opponent_agent_finished
game_resumed
```

---

## Move Flow

```text
User clicks e2
        ↓
User clicks e4
        ↓
Client sends move
        ↓
Server receives e2 → e4
        ↓
chess.js validates
        ↓
legal?
   ┌────┴────┐
   │         │
  yes        no
   │         │
update     reject
state       move
   │
broadcast
   │
   ├─────────────▶ User A
   │
   └─────────────▶ User B
```

---

## Agent Completion Flow

Suppose both users are playing.

```text
Alice Codex = working
Bob Codex = working

Game ACTIVE
```

Then Bob's Codex completes.

```text
Bob Codex = done
```

Bob sends:

```text
done
```

The server updates:

```text
Bob.waitingForAgent = false
```

Game becomes:

```text
PAUSED
```

Bob immediately sees his Codex response.

Alice sees:

```text
Opponent's agent finished.

Game paused.
```

When Alice's agent finishes, she also returns normally.

---

## Game Resume

Later:

```text
Alice prompts Codex
Bob prompts Codex
```

Both become waiting again.

Server checks whether they have an existing game.

If yes:

```text
load previous FEN
```

and both terminals see:

```text
Game resumed
```

instead of starting from the initial board.

---

## Persistence

For the hackathon, do not use a database unless everything else works early.

Use:

```ts
const games = new Map()
```

Example:

```ts
games.set(gameId, {
    white: "alice",
    black: "bob",
    fen: "...",
    pgn: "..."
})
```

This demonstrates persistent game state as long as the server remains running.

Database persistence can be added later.

---

## Team Split

We have 3 developers.

Each person should own a vertical component and avoid stepping on the others.

See per-track docs: [`../client/README.md`](../client/README.md), [`../server/README.md`](../server/README.md), [`../agent/README.md`](../agent/README.md).

---

## Shared Responsibility

All 3 people should agree on the WebSocket protocol before splitting up.

Do this first. See [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md).

Once agreed, avoid changing these structures unless required.

---

## 4-Hour Execution Plan

See [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) for the full timeline.

---

## Hackathon Demo Script

See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

---

## Definition of Done

The MVP is complete if the team can demonstrate this sequence:

```text
Two terminals
       ↓
Two AI prompts
       ↓
Both agents running
       ↓
Automatic matchmaking
       ↓
Interactive terminal chess
       ↓
Realtime moves
       ↓
One agent completes
       ↓
Game pauses
       ↓
AI answer appears
       ↓
Same chess game can resume
```

If this works reliably, stop.

Everything else is polish.

---

## Core Product Principle

We are not building a chess app.

We are testing a new interaction model:

> AI agents create moments where developers are waiting but still sitting at their terminals. CodeChess turns overlapping wait time into lightweight synchronous multiplayer experiences.

Chess is the first game.

Longer-term, the same infrastructure could support:

```text
Chess
Connect Four
Tic-Tac-Toe
Battleship
Checkers
Word games
Collaborative puzzles
```

The reusable product is the **multiplayer layer that activates while AI agents are working**.
