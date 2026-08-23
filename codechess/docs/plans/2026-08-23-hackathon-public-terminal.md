# Hackathon Public Terminal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an installable terminal companion that places two invited developers in a private CodeChess room and automatically activates or resumes their game while both have active Codex prompts.

**Architecture:** Run one public Node HTTP/WebSocket server with in-memory rooms, token-authorized players, activity leases, and authoritative chess state. Install a `codechess` terminal CLI plus fail-open user hooks; keep one TUI open per player and let normal Codex lifecycle events start, pause, reconnect, and resume the room.

**Tech Stack:** Node.js 22.13+, TypeScript, `ws`, `terminal-kit`, `chess.js`, Node HTTP, Codex command hooks, Vitest/Node test runner, Render, npm/GitHub package installation.

---

## Scope and release contract

This branch targets a public hackathon demo, not a durable service. It runs one
server instance and stores rooms, tokens, activity leases, FEN, and PGN in
memory. A server restart clears all rooms. Users recover by running `codechess
host` and `codechess join` again.

The release must support this path:

```text
install → setup hooks → host/join room → leave TUI open
→ both submit normal Codex prompts → game activates
→ legal move reaches both terminals → one agent stops → game pauses
→ both submit again → latest FEN resumes
```

Defer PostgreSQL, Supabase, accounts, browser UI, multi-instance coordination,
automatic terminal-window creation, ratings, chat, and durable history.

## Parallel execution rules

The primary agent owns shared contracts, root workspace files, the root lockfile,
integration tests, deployment files, and final verification. After the contract
gate, create three sibling worktrees from the same commit:

| Lane | Branch | Exclusive ownership |
|---|---|---|
| Server | `codex/hackathon-server` | `codechess/server/**` |
| Companion | `codex/hackathon-companion` | `codechess/companion/**` |
| Terminal | `codex/hackathon-client` | `codechess/client/**` |

Each worker must be told: “You are not alone in the codebase. Do not edit or
revert files outside your ownership. Do not regenerate the root lockfile.
Commit only your owned files and report commit hashes plus verification.”

The primary agent remains in `codex/hackathon-public-terminal`, reviews each
lane, merges the three branches, regenerates `package-lock.json` once, then owns
all cross-package fixes. Do not dispatch parallel workers until Tasks 1 and 2
are committed.

## Task 1: Freeze the public room and activity contracts

**Owner:** Primary agent, sequential gate

**Files:**
- Modify: `codechess/shared/src/protocol.ts`
- Create: `codechess/shared/src/http-contract.ts`
- Modify: `codechess/shared/package.json`
- Modify: `codechess/shared/test/protocol.test.ts`
- Create: `codechess/shared/test/http-contract.test.ts`
- Modify: `codechess/shared/PROTOCOL.md`

**Step 1: Write failing protocol tests**

Add tests for these canonical messages while retaining the legacy demo
messages:

```ts
parseClientMessage({
  type: "room_hello",
  playerToken: "token-with-at-least-32-characters",
});

parseServerMessage({
  type: "room_hello_ack",
  roomCode: "BLUE-CAT7",
  playerId: "player-1",
});
```

Reject blank, short, numeric, and oversized tokens. Keep chess moves separate
from room authentication.

**Step 2: Write failing HTTP contract tests**

Define and test runtime parsers for:

```ts
type CreateRoomRequest = { displayName: string };
type CreateRoomResponse = {
  roomCode: string;
  playerId: string;
  playerToken: string;
};
type JoinRoomRequest = { roomCode: string; displayName: string };
type ActivityRequest = {
  activityId: string;
  action: "start" | "heartbeat" | "stop";
};
```

Room codes must match `^[A-Z0-9]{4}-[A-Z0-9]{4}$`. Display names are trimmed,
1–40 characters, and contain no control characters. Activity IDs are 1–128
characters. Player tokens remain opaque strings and never enter logs.

**Step 3: Run the shared tests and confirm RED**

Run:

```bash
npm test --workspace @codechess/shared
```

Expected: failures for missing `room_hello`, `room_hello_ack`, and HTTP parsers.

**Step 4: Implement the minimal parsers and exported types**

Return new canonical objects rather than unvalidated input. Set maximum JSON
field lengths in one exported constants object so the server and companion use
the same limits.

**Step 5: Document the public protocol**

Add the create/join/activity HTTP routes, token rules, room WebSocket handshake,
heartbeat behavior, pause/resume behavior, and expected restart data loss.

**Step 6: Verify and commit**

Run:

```bash
npm test --workspace @codechess/shared
npm run typecheck --workspace @codechess/shared
git diff --check
```

Commit:

```bash
git add codechess/shared
git commit -m "feat: define public room protocol"
```

## Task 2: Scaffold the installable companion and parallel seams

**Owner:** Primary agent, sequential gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `codechess/companion/package.json`
- Create: `codechess/companion/tsconfig.json`
- Create: `codechess/companion/tsup.config.ts`
- Create: `codechess/companion/src/contracts.ts`
- Create: `codechess/companion/src/cli.ts`
- Create: `codechess/companion/test/cli.test.ts`

**Step 1: Write a failing CLI smoke test**

Test that `parseCli()` recognizes:

```text
codechess setup --server https://play.example.test
codechess host --name Alice
codechess join BLUE-CAT7 --name Bob
codechess play
codechess doctor
codechess uninstall-hooks
```

Require HTTPS for public URLs and allow HTTP only for loopback development.

**Step 2: Run the test and confirm RED**

Run:

```bash
npm test --workspace @codechess/companion
```

Expected: workspace or parser does not exist.

**Step 3: Add the workspace skeleton**

Add `codechess/companion` to root workspaces. Give both the root package and
companion package a `bin` entry named `codechess` that points to
`codechess/companion/dist/cli.js`. Add a root `prepare` script that builds the
companion during installation from a Git tag. Add `tsup` and configure it to
bundle the companion plus `@codechess/client` and `@codechess/shared` into one
Node ESM entry while leaving ordinary third-party dependencies installed by
npm. Add Node 22.13 engine metadata, build/test/typecheck scripts, and workspace
dependencies on the shared and client packages. Keep publishing metadata
explicit but postpone choosing the final npm name until release.

In `contracts.ts`, freeze this terminal seam for the client lane:

```ts
export type TerminalSession = {
  websocketUrl: string;
  playerToken: string;
};

export type RunTerminal = (session: TerminalSession) => Promise<void>;
```

The companion lane may mock this function. The terminal lane must export a
compatible implementation without editing companion files.

**Step 4: Implement only parsing and help**

Do not implement network, hooks, or terminal launching at this gate. Ensure
`codechess --help` explains that `host` and `join` keep one terminal open.

**Step 5: Verify and commit**

Run:

```bash
npm install
npm test --workspace @codechess/companion
npm run typecheck --workspace @codechess/companion
git diff --check
```

Commit:

```bash
git add package.json package-lock.json codechess/companion
git commit -m "build: scaffold CodeChess companion"
```

## Task 3: Create three isolated worker worktrees

**Owner:** Primary agent

**Step 1: Create branches from the Task 2 commit**

From the repository root, run:

```bash
git worktree add .worktrees/hackathon-server -b codex/hackathon-server codex/hackathon-public-terminal
git worktree add .worktrees/hackathon-companion -b codex/hackathon-companion codex/hackathon-public-terminal
git worktree add .worktrees/hackathon-client -b codex/hackathon-client codex/hackathon-public-terminal
```

**Step 2: Install without editing the lockfile**

Run `npm ci` once in each worktree.

**Step 3: Dispatch three workers concurrently**

Assign one worker to Tasks 4–6, one to Tasks 7–9, and one to Tasks 10–11. Give
each worker the design document, contract commit hash, ownership rule, TDD
requirement, and exact verification commands.

## Task 4: Build secure in-memory rooms

**Owner:** Server lane

**Files:**
- Create: `codechess/server/src/rooms/room-store.ts`
- Create: `codechess/server/src/rooms/token.ts`
- Create: `codechess/server/test/room-store.test.ts`

**Step 1: Write failing room-store tests**

Cover room creation, unique codes, two-seat capacity, unknown rooms, duplicate
joins, timing-safe token verification, token hashing at rest, and fresh game
creation after a completed game.

Use injectable random byte and clock functions. Never assert on actual random
values.

**Step 2: Run and confirm RED**

```bash
npm test --workspace @codechess/server -- --test-name-pattern="room store"
```

**Step 3: Implement the store**

Use `crypto.randomBytes`, SHA-256 token hashes, and `timingSafeEqual`. Store no
raw token. A room owns exactly two player records, optional game ID, active
activity maps, and last-access time.

**Step 4: Verify and commit**

```bash
npm test --workspace @codechess/server
npm run typecheck --workspace @codechess/server
git add codechess/server
git commit -m "feat: add private in-memory rooms"
```

## Task 5: Add HTTP room, activity, and health routes

**Owner:** Server lane

**Files:**
- Create: `codechess/server/src/http/api.ts`
- Create: `codechess/server/src/http/body.ts`
- Create: `codechess/server/test/http-api.test.ts`
- Modify: `codechess/server/src/index.ts`

**Step 1: Write failing HTTP tests**

Use a real server on port `0`. Cover:

```text
GET  /healthz                     → 200 { status: "ok" }
POST /v1/rooms                    → 201 CreateRoomResponse
POST /v1/rooms/:roomCode/join     → 200 CreateRoomResponse
POST /v1/activity                 → 204
```

Authenticate activity with `Authorization: Bearer <playerToken>`. Test malformed
JSON, bodies over 16 KiB, invalid contract values, third-player joins, unknown
tokens, and logs that omit tokens.

**Step 2: Confirm RED, implement, then confirm GREEN**

Create one Node HTTP server. Return structured JSON errors with stable codes.
Add an injectable rate limiter with conservative per-IP room creation and
per-token activity limits. Bind production startup to `HOST=0.0.0.0` and
`PORT`.

**Step 3: Verify and commit**

```bash
npm test --workspace @codechess/server
npm run typecheck --workspace @codechess/server
git add codechess/server
git commit -m "feat: expose room and activity API"
```

## Task 6: Connect rooms, leases, and WebSockets to chess games

**Owner:** Server lane

**Files:**
- Modify: `codechess/server/src/server.ts`
- Create: `codechess/server/src/activity/lease-manager.ts`
- Modify: `codechess/server/test/server.test.ts`
- Modify: `codechess/server/test/full-flow.test.ts`

**Step 1: Write failing lifecycle tests**

Cover room-token WebSocket authentication, both players busy, one player idle,
two simultaneous activities for one player, idempotent events, lease expiry,
reconnect snapshot, latest FEN resume, and new game after terminal completion.

**Step 2: Confirm RED**

```bash
npm test --workspace @codechess/server -- --test-name-pattern="room|activity|lease|reconnect|rematch"
```

**Step 3: Refactor without breaking legacy tests**

Attach `WebSocketServer` to the Task 5 HTTP server. Preserve the legacy
four-socket demo path until the public flow passes. Add 30-second server pings,
90-second activity leases, a 30-second sweep, and graceful timer cleanup in
`close()`.

Persist each accepted move into the in-memory game before broadcasting. When
both players regain activity, send `game_resumed` with the saved FEN and PGN.
When a completed room becomes active again, create a new game.

**Step 4: Verify and commit**

```bash
npm test --workspace @codechess/server
npm run typecheck --workspace @codechess/server
git add codechess/server
git commit -m "feat: drive room games from activity leases"
```

## Task 7: Implement companion configuration and room API commands

**Owner:** Companion lane

**Files:**
- Create: `codechess/companion/src/config.ts`
- Create: `codechess/companion/src/api-client.ts`
- Create: `codechess/companion/src/commands/setup.ts`
- Create: `codechess/companion/src/commands/host.ts`
- Create: `codechess/companion/src/commands/join.ts`
- Create: `codechess/companion/test/config.test.ts`
- Create: `codechess/companion/test/api-client.test.ts`
- Modify: `codechess/companion/src/cli.ts`

**Step 1: Write failing tests**

Use temporary home directories and a local fake HTTP server. Assert that setup
stores the server URL, host/join store the returned room and token, configuration
uses mode `0600`, secrets never appear in errors, and deadlines abort requests.

**Step 2: Confirm RED**

```bash
npm test --workspace @codechess/companion -- --test-name-pattern="config|room API"
```

**Step 3: Implement minimal commands**

Use Node `fetch` with `AbortSignal.timeout`. Write configuration atomically via
a temporary file and rename. Normalize HTTPS/WSS URLs centrally. Keep the API
client injectable so tests never use the internet.

**Step 4: Verify and commit**

```bash
npm test --workspace @codechess/companion
npm run typecheck --workspace @codechess/companion
git add codechess/companion
git commit -m "feat: add CodeChess room commands"
```

## Task 8: Install fail-open Codex hooks

**Owner:** Companion lane; apply the `create-hook` skill

**Files:**
- Create: `codechess/companion/src/hooks/installer.ts`
- Create: `codechess/companion/src/hooks/activity.ts`
- Create: `codechess/companion/test/hook-installer.test.ts`
- Create: `codechess/companion/test/hook-activity.test.ts`
- Create: `codechess/companion/test/fixtures/hooks-existing.json`
- Modify: `codechess/companion/src/cli.ts`

**Step 1: Write failing installer tests**

Assert that installation preserves unrelated hooks, adds one marked CodeChess
entry to `beforeSubmitPrompt`, `afterAgentThought`, and `stop`, uses an absolute
command path, sets a two-second timeout, sets `failClosed: false`, remains
idempotent, and removes only CodeChess entries during uninstall.

**Step 2: Write failing activity tests**

Feed JSON hook events on stdin. Derive an activity key from stable task/session
fields, with a documented single-session fallback. Assert start, throttled
heartbeat, and stop requests. Network failure, invalid input, missing config,
and server timeout must exit `0` without blocking a prompt or printing a token.

**Step 3: Confirm RED**

```bash
npm test --workspace @codechess/companion -- --test-name-pattern="hook"
```

**Step 4: Implement hooks**

Write only `{}` to stdout on success. Write concise diagnostics to stderr.
Throttle heartbeats locally to one request per 30 seconds per activity. Verify
the `node` executable and hook path during setup and report actionable errors.

**Step 5: Verify and commit**

```bash
npm test --workspace @codechess/companion
npm run typecheck --workspace @codechess/companion
git add codechess/companion
git commit -m "feat: connect Codex hooks to room presence"
```

## Task 9: Finish companion execution and diagnostics

**Owner:** Companion lane

**Files:**
- Create: `codechess/companion/src/commands/play.ts`
- Create: `codechess/companion/src/commands/doctor.ts`
- Create: `codechess/companion/test/play.test.ts`
- Create: `codechess/companion/test/doctor.test.ts`
- Modify: `codechess/companion/src/cli.ts`
- Modify: `codechess/companion/package.json`

**Step 1: Write failing command tests**

`host` and `join` must save configuration and call the injected `RunTerminal`.
`play` must reuse the active room. `doctor` checks Node version, config mode,
hook installation, server health, room token, and terminal capability without
printing secrets.

**Step 2: Implement and verify**

Keep terminal execution injected until integration. Ensure SIGINT restores the
terminal through the existing client cleanup path.

```bash
npm test --workspace @codechess/companion
npm run typecheck --workspace @codechess/companion
git add codechess/companion
git commit -m "feat: complete installable CodeChess companion"
```

## Task 10: Add authenticated reconnecting terminal transport

**Owner:** Terminal lane

**Files:**
- Modify: `codechess/client/src/transport/websocket-game-transport.ts`
- Modify: `codechess/client/test/websocket-game-transport.test.ts`
- Create: `codechess/client/src/public-api.ts`
- Modify: `codechess/client/package.json`

**Step 1: Write failing transport tests**

Test `room_hello` authentication, rejected tokens, handshake timeout, server
ping/pong, unexpected close, capped backoff (`250ms`, `500ms`, `1s`, up to
`5s`), explicit disconnect cancellation, reauthentication, and current-state
replay. Inject sockets, clock, random jitter, and sleep.

**Step 2: Confirm RED**

```bash
npm test --workspace @codechess/client -- --run --testNamePattern="room|reconnect"
```

**Step 3: Implement the public API**

Export:

```ts
export async function runTerminalSession(options: {
  websocketUrl: string;
  playerToken: string;
}): Promise<void>;
```

Do not import companion code. Preserve the existing mock and legacy URL/user-ID
CLI for regression coverage.

**Step 4: Verify and commit**

```bash
npm test --workspace @codechess/client
npm run typecheck --workspace @codechess/client
git add codechess/client
git commit -m "feat: reconnect public terminal sessions"
```

## Task 11: Render room waiting, pause, resume, and rematch states

**Owner:** Terminal lane

**Files:**
- Modify: `codechess/client/src/types.ts`
- Modify: `codechess/client/src/terminal-ui.ts`
- Modify: `codechess/client/src/renderer.ts`
- Modify: `codechess/client/test/terminal-ui.test.ts`
- Modify: `codechess/client/test/renderer.test.ts`

**Step 1: Write failing rendering tests**

Cover these exact user states:

```text
Waiting for your teammate to join room BLUE-CAT7
Both agents must be working before the game starts
Opponent's agent finished — game paused
Connection lost — reconnecting…
Game restored from the latest position
Game complete — start new prompts for a rematch
```

Moves remain disabled while waiting, paused, reconnecting, or completed.

**Step 2: Implement, verify, and commit**

```bash
npm test --workspace @codechess/client
npm run typecheck --workspace @codechess/client
git add codechess/client
git commit -m "feat: render public room lifecycle"
```

## Task 12: Integrate the three lanes

**Owner:** Primary agent

**Step 1: Review worker results before merging**

Inspect every commit and verify ownership. Reject unrelated edits, placeholder
tests, hard-coded URLs, secret logging, arbitrary sleeps, and changes to the
root lockfile.

**Step 2: Merge the three branches**

```bash
git merge --no-ff codex/hackathon-server
git merge --no-ff codex/hackathon-companion
git merge --no-ff codex/hackathon-client
```

Resolve only genuine contract mismatches. Preserve user changes.

**Step 3: Wire the companion to the client**

Import `runTerminalSession` through the client package's public export and
adapt it to `RunTerminal`. Remove all temporary mocks from production paths.

**Step 4: Regenerate dependency metadata once**

```bash
npm install
npm run check
git diff --check
```

Commit:

```bash
git add package.json package-lock.json codechess
git commit -m "feat: integrate public CodeChess companion"
```

## Task 13: Add public-flow end-to-end coverage

**Owner:** Primary agent

**Files:**
- Create: `codechess/server/test/public-room-flow.test.ts`
- Create: `codechess/companion/test/packaged-flow.test.ts`

**Step 1: Write the failing real-process test**

Start the HTTP/WebSocket server on port `0`, create Alice's room over HTTP,
join Bob, connect two real terminal transports, send two activity starts, and
assert both receive opposite colors. Play `e2-e4`, stop Bob, assert both pause,
start Bob again, and assert both resume the same FEN.

Also expire Alice's activity without `stop` and assert the game pauses. Complete
Fool's Mate, start two new activities, and assert a fresh game begins.

**Step 2: Run and confirm RED, then fix integration defects**

Do not weaken package-level tests to make the flow pass.

**Step 3: Add a packaged install test**

Run `npm pack` into a temporary directory, install the tarball into an isolated
prefix, invoke `codechess --help`, install hooks into a temporary home, run
`doctor` against the test server, and uninstall hooks. Never touch the real
user home directory.

**Step 4: Verify and commit**

```bash
npm run check
git diff --check
git add codechess/server/test codechess/companion/test
git commit -m "test: cover packaged public room flow"
```

## Task 14: Add Render deployment and release instructions

**Owner:** Primary agent

**Files:**
- Create: `render.yaml`
- Create: `codechess/docs/PUBLIC_DEMO.md`
- Modify: `README.md`
- Modify: `codechess/README.md`
- Modify: `codechess/server/README.md`

**Step 1: Add deployment configuration**

Configure one Node web service, `npm ci` build, `npm run server` start, Node
22.13+, `/healthz`, and one instance. State explicitly that scaling above one
instance breaks in-memory rooms.

**Step 2: Document installation and recovery**

Document tagged GitHub installation first:

```bash
npm install --global github:jduron24/cat-games#codechess-v0.1.0
codechess setup --server https://<service-host>
codechess host --name Alice
codechess join BLUE-CAT7 --name Bob
```

Add npm publication only after verifying an available package name and team
registry access. Document server restart recovery, hook removal, config path,
firewall/proxy errors, and `codechess doctor`.

**Step 3: Verify docs and commit**

```bash
npm run check
git diff --check
git add render.yaml README.md codechess/README.md codechess/server/README.md codechess/docs/PUBLIC_DEMO.md
git commit -m "docs: add public hackathon deployment"
```

## Task 15: Security review and final verification

**Owner:** Primary agent plus independent review agent

**Step 1: Request focused review**

Ask the reviewer to inspect token handling, hook safety, command/path quoting,
config permissions, HTTP limits, rate limits, WebSocket authentication,
reconnect cleanup, timer cleanup, terminal restoration, secret logging, and
the one-instance deployment assumption.

**Step 2: Fix findings with TDD**

For each accepted finding, write a failing regression test, confirm RED,
implement the smallest fix, and confirm GREEN. Commit review fixes separately.

**Step 3: Run clean verification**

```bash
npm ci
npm run check
npm pack --dry-run
git diff --check
git status --short
```

Expected: all tests and typechecks pass, the package contains only intended
runtime files, no tracked changes remain, and the known Cursor SDK transitive
audit finding is reported separately rather than hidden.

**Step 4: Rehearse on two machines**

Deploy one Render instance. Install the tagged package on two machines, run
setup, host/join one room, overlap two normal Codex prompts, play a move, pause,
reconnect one terminal, resume the same FEN, finish a game, and start a rematch.

Record the service URL, tag, exact commands, observed FEN, and any platform
limitations in `codechess/docs/PUBLIC_DEMO.md` before declaring the branch
ready.
