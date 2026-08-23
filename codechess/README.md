# CodeChess

CodeChess turns agent wait time into a short multiplayer chess session. In the
public flow, each developer joins the same private room and leaves one terminal
UI open. Fail-open Codex hooks report prompt activity; the game pauses when
either agent finishes and resumes from the saved FEN when both become active.

## Architecture

| Package | Responsibility |
|---|---|
| `client` | Terminal rendering, input, and UI WebSocket transport |
| `server` | Private rooms, activity leases, chess validation, and in-memory state |
| `companion` | Installable CLI, secure local config, and Codex hook integration |
| `agent` | Manual or Cursor SDK lifecycle and agent WebSocket transport |
| `shared` | Runtime-validated WebSocket protocol |

The public flow uses one authenticated terminal socket plus HTTP activity
events for each player:

```text
Codex hooks ── start/heartbeat/stop ──┐
                                      ├── private room ── saved game
terminal UI ── room token WebSocket ──┘
```

The older four-process demo remains available locally. Production startup
disables its unauthenticated legacy socket handshake.

## Start here

Run all commands from the repository root:

```bash
npm ci
npm run check
```

- [Protocol](shared/PROTOCOL.md)
- [Public hackathon deployment](docs/PUBLIC_DEMO.md)
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

Accounts, ratings, chat, spectators, clocks, databases, multi-instance
coordination, and restart persistence remain out of scope.
