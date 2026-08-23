# Hackathon Public Terminal Design

## Goal

Let any two hackathon participants install CodeChess, enter the same private
room, keep a terminal board open, and automatically play or resume whenever
both participants have active Codex prompts.

## Product flow

Each participant installs the public CLI from the repository or npm, then runs
one setup command:

```bash
codechess setup --server https://play.codechess.dev
```

Setup adds fail-open user hooks without overwriting unrelated entries in
`~/.cursor/hooks.json`. One participant runs `codechess host`; the command
prints a short room code, stores a private player token, and opens the terminal
board. The other runs `codechess join <room-code>`, which stores a second token
and opens the same board. Each player leaves that terminal open.

The `beforeSubmitPrompt` hook marks its player busy. `afterAgentThought`
refreshes a short presence lease, and `stop` marks the player idle. Hooks send
small HTTPS requests and return within one second. Network errors never block
or modify a Codex prompt. When both room members are busy, the server creates
or resumes their game and broadcasts the latest FEN to both terminals. When
either member becomes idle, the server pauses the game. A completed game rolls
over to a fresh game the next time both players become busy.

## Architecture

```text
Codex hooks ── HTTPS activity events ──┐
                                      ├── Node HTTP/WebSocket server
Terminal TUI ── authenticated WSS ────┘        │
                                               └── in-memory rooms and games
```

The Node process owns rooms, player tokens, activity leases, matchmaking,
chess validation, and game state. An HTTP server and `WebSocketServer` share
one public port. HTTP routes create and join rooms, record activity, and expose
`/healthz`. WebSockets carry terminal state and moves. The server accepts the
hosting platform's `PORT` and binds to `0.0.0.0`.

The hackathon release runs exactly one server instance. Rooms, tokens, FEN,
and PGN live only in that process. A crash, sleep, deployment, or restart erases
them; users then run `host` and `join` again. Client reconnect recovers from a
network interruption only while the same server process retains the room.

## Room and activity model

A room has a random, human-readable code and at most two players. Creating or
joining returns a random player token. The server stores only token hashes and
compares tokens with a timing-safe operation. Room codes invite players;
player tokens authorize hooks, sockets, and moves. The server rejects a third
player, duplicate seat claims, oversized payloads, and excessive requests.

Each player owns a set of activity leases keyed by a hook activity ID. Start
creates or refreshes a lease, heartbeat extends it, and stop removes it. This
set prevents one completed task from marking a player idle while another task
remains active. Leases expire if a process crashes or a stop event never
arrives. Start, heartbeat, and stop remain idempotent.

## Installable companion

Add a `codechess/companion` workspace with a `codechess` executable. It owns
configuration, room commands, hook installation, hook event delivery, and the
terminal entry point. Configuration lives under `~/.codechess/`, uses mode
`0600`, and contains the server URL, active room, player token, and display
name. `codechess uninstall-hooks` removes only CodeChess hook entries.

For the hackathon, publish a tagged GitHub install first and an npm package if
the team has an available public package name. `npm pack` and a clean temporary
global install must pass before release. The CLI targets Node.js 22.13 or later.

## Reliability and safety

The terminal reconnects with capped exponential backoff, reauthenticates, and
requests the current room snapshot. The server sends WebSocket pings and drops
stale sockets. Hooks use short deadlines and fail open. Logs omit prompts,
tokens, source code, and terminal history. The wire protocol contains only
room, activity, and chess data.

The server adds payload limits, per-token activity throttles, room creation
throttles, origin-independent token authorization, graceful shutdown, and
structured errors. These controls support a public hackathon demo; they do not
claim production-grade identity or durable storage.

## Testing and acceptance

Tests cover hook merging and removal, config permissions, hook deadlines,
room capacity, token rejection, presence expiry, overlapping activities,
reconnect, rematch, and HTTP health. A real-process acceptance test starts the
server, creates a room, joins two packaged clients, simulates both Codex hook
lifecycles, plays a move, pauses, reconnects, and resumes the saved FEN.

Release acceptance requires a clean install, all unit and integration tests,
all typechecks, `npm pack`, a temporary install smoke test, a public `wss://`
connection, and a two-machine rehearsal.

## Deferred work

PostgreSQL or Supabase persistence, accounts, cross-instance messaging,
browser clients, automatic terminal-window launching, ratings, spectators,
chat, and durable history remain outside the hackathon branch.
