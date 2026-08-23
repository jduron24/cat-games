# CodeChess

CodeChess turns agent wait time into a short multiplayer chess session. Each
developer runs a terminal UI and an agent lifecycle process under the same user
ID. The game pauses when either agent finishes and resumes from the saved FEN
when both agents become available again.

## Architecture

| Package | Responsibility |
|---|---|
| `client` | Terminal rendering, input, and UI WebSocket transport |
| `server` | Identity, matchmaking, chess validation, and in-memory game state |
| `agent` | Manual or Cursor SDK lifecycle and agent WebSocket transport |
| `shared` | Runtime-validated WebSocket protocol |

Each logical user owns two role-specific sockets:

```text
terminal UI ── hello(role=ui) ─────┐
                                   ├── server user record ── game
agent      ── hello(role=agent) ───┘
```

The UI sends moves. The agent sends `waiting` and `done`. The server sends game
state only to UI sockets.

## Start here

Run all commands from the repository root:

```bash
npm ci
npm run check
```

- [Protocol](shared/PROTOCOL.md)
- [Five-process demo](docs/DEMO_SCRIPT.md)
- [Integrated execution status](docs/EXECUTION_PLAN.md)
- [Client controls](client/README.md)
- [Server behavior](server/README.md)
- [Agent lifecycle](agent/README.md)

## Definition of done

```text
both agents waiting
→ both UIs matched
→ a legal move reaches both UIs
→ one agent finishes
→ both UIs pause
→ both agents wait again
→ the saved board resumes
```

Authentication, accounts, ratings, chat, spectators, clocks, databases, and
cross-process reconnection persistence remain out of scope.
