# CodeChess Three-Track Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the terminal UI, multiplayer server, and agent lifecycle package install, start, and complete the documented match → move → pause → resume flow from one repository checkout.

**Architecture:** Keep the TUI and agent runner as separate processes. Both identify the same `userId`, but each opens a role-specific WebSocket (`ui` or `agent`); the server stores both sockets on one user record, accepts moves from the UI socket, accepts lifecycle events from the agent socket, and sends game state to the UI socket. Put protocol types and runtime validators in a shared workspace package so all three tracks compile against one contract.

**Tech Stack:** TypeScript, npm workspaces, Node.js 20+, `ws`, `chess.js`, Node test runner/Vitest, Codex TypeScript SDK (`@cursor/sdk`) for the final agent adapter.

---

## Current State (2026-08-23)

The branch is clean and contains all three tracks:

- Client contribution: `codechess/client`
- Server contribution: `codechess/server`
- Agent contribution: `codechess/agent`

Verified results:

- Root client tests: 8 files and 31 tests pass.
- Root client TypeScript build passes.
- Server tests run from `codechess/package.json`: 8 tests pass.
- Server typecheck run from `codechess/package.json` passes.
- Agent test and typecheck fail in the current checkout because `openai` is not installed by the root workspace.
- `codechess/server`'s advertised `test` script exits successfully without running tests.
- `codechess/server`'s advertised `dev` script runs `src/server.ts`, which defines the server and exits without listening. The actual entry point is `src/index.ts`.

The components do not currently work end to end:

1. The UI sends `hello` and `move`, but never sends `waiting`.
2. The agent sends `waiting` and `done`, but never sends `hello` or a `userId`.
3. The server rejects every pre-`hello` message.
4. A naive agent `hello` fix would still fail because `users` stores one socket per `userId`; the agent connection would replace the UI connection.
5. The server sends undocumented `hello_ack` and `error` messages. The UI parser rejects both, so every successful UI connection currently produces “Server sent an invalid protocol message.”
6. A live smoke test with two real UI transports registered two users, left both `waitingForAgent` flags false, created zero games, published zero game states, and emitted the invalid-protocol notice in both clients.
7. A live smoke test with the current agent WebSocket transport sent `waiting`, registered zero users, and created zero games.

Repository setup also drifted during the merge:

- The root npm workspace includes only `codechess/client`.
- Server dependencies and real server tests live in `codechess/package.json`.
- `codechess/server/package.json` contains placeholder scripts.
- Agent, server, and the nested `codechess` project each have separate lockfiles.
- The docs use port 3000 and a `--port` flag, while the real server entry point defaults to port 8080 and reads `PORT`.

## Recommended Integration Decision

Use two role-specific sockets per user:

```ts
type PeerRole = "ui" | "agent";

type HelloMessage = {
  type: "hello";
  userId: string;
  role: PeerRole;
};

type ConnectedUser = {
  id: string;
  uiSocket: WebSocket | null;
  agentSocket: WebSocket | null;
  waitingForAgent: boolean;
  currentGameId: string | null;
};
```

This keeps all three contributions intact. The alternatives require either merging the TUI and agent into one process or adding local IPC between them, both of which touch more code and make the demo harder to operate.

## Task 1: Consolidate the npm Workspace

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `codechess/client/package.json`
- Modify: `codechess/server/package.json`
- Modify: `codechess/agent/package.json`
- Create: `codechess/shared/package.json`
- Create: `codechess/shared/tsconfig.json`
- Delete after migration: `codechess/package.json`
- Delete after migration: `codechess/package-lock.json`
- Delete after migration: `codechess/server/package-lock.json`
- Delete after migration: `codechess/agent/package-lock.json`
- Delete after migration: `codechess/tsconfig.json`

**Step 1: Expand the root workspace**

Set the root workspace list to the four executable/shared packages:

```json
"workspaces": [
  "codechess/client",
  "codechess/server",
  "codechess/agent",
  "codechess/shared"
]
```

**Step 2: Move the real server scripts into the server package**

Use `src/index.ts` as the entry point and the real test directory:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "test": "tsx --test test/**/*.test.ts",
  "typecheck": "tsc --noEmit"
}
```

**Step 3: Add root orchestration scripts**

Add `server`, `ui`, `ui:mock`, `agent`, `test`, `typecheck`, and `check` scripts that address packages by workspace name. `npm run check` must run every package's tests and typecheck.

**Step 4: Generate one lockfile**

Run:

```bash
npm install
```

Expected: npm installs all four workspaces and updates only the root `package-lock.json`.

**Step 5: Verify clean-clone behavior**

Run:

```bash
npm ci
npm run check
```

Expected: one install prepares the client, server, shared contract, and agent packages; no package relies on dependencies hoisted accidentally from the client.

**Step 6: Commit**

```bash
git add package.json package-lock.json codechess/client/package.json codechess/server/package.json codechess/agent/package.json codechess/shared/package.json codechess/shared/tsconfig.json
git add -u codechess
git commit -m "build: unify CodeChess workspaces"
```

## Task 2: Make the Shared Protocol Executable

**Files:**

- Create: `codechess/shared/src/protocol.ts`
- Create: `codechess/shared/test/protocol.test.ts`
- Modify: `codechess/shared/PROTOCOL.md`
- Modify: `codechess/client/package.json`
- Modify: `codechess/server/package.json`
- Modify: `codechess/agent/package.json`

**Step 1: Write failing protocol tests**

Cover these rules:

- `hello` requires a non-empty `userId` and role `ui` or `agent`.
- UI messages allow `move` and `disconnect`.
- Agent messages allow `waiting`, `done`, and `disconnect`.
- Invalid field types return a parse failure instead of reaching server handlers.
- Server messages include `hello_ack` and `error` as well as every documented game message.

Run:

```bash
npm test --workspace @codechess/shared
```

Expected: FAIL because the parser does not exist.

**Step 2: Add shared types and runtime parsers**

Export `PeerRole`, `ClientMessage`, `ServerMessage`, `parseClientMessage`, and `parseServerMessage`. Keep chess-square and FEN-specific validation in small named helpers.

**Step 3: Update the written protocol**

Document the role field, two sockets per logical user, acknowledgements, errors, and which role may send each message.

**Step 4: Replace local wire-type copies**

Make the client, server, and agent depend on `@codechess/shared`. Remove their private `ClientMessage` and `ServerMessage` unions as later tasks touch each package.

**Step 5: Verify and commit**

Run:

```bash
npm test --workspace @codechess/shared
npm run typecheck --workspace @codechess/shared
```

Expected: PASS.

```bash
git add codechess/shared codechess/client/package.json codechess/server/package.json codechess/agent/package.json package-lock.json
git commit -m "feat: define shared websocket contract"
```

## Task 3: Teach the Server About UI and Agent Sockets

**Files:**

- Modify: `codechess/server/src/server.ts`
- Modify: `codechess/server/test/server.test.ts`

**Step 1: Write a failing dual-socket registration test**

Connect a UI socket and an agent socket with the same `userId`. Assert that one user record retains both sockets and that closing either socket does not remove the other.

**Step 2: Run the focused test**

Run:

```bash
npm test --workspace @codechess/server -- --test-name-pattern="retains UI and agent sockets"
```

Expected: FAIL because the second `hello` replaces the first socket.

**Step 3: Replace the single socket field**

Store `uiSocket` and `agentSocket` separately. Preserve `waitingForAgent` and `currentGameId` when the second role connects. Associate each incoming connection with both `userId` and `role`.

**Step 4: Enforce message ownership**

- Accept `move` only from `ui`.
- Accept `waiting` and `done` only from `agent`.
- Send protocol errors for role violations.
- Send game-state and matchmaking messages only to open UI sockets.
- Treat a user as matchable only when the UI socket is open and `waitingForAgent` is true.
- If the agent becomes waiting before the UI connects, retry matchmaking when the UI connects.

**Step 5: Handle role-specific disconnects**

Clear only the socket that closed. Mark the user unavailable when its UI disconnects, preserve paused game state, and avoid letting an old socket's close event delete a replacement connection.

**Step 6: Validate malformed input**

Add tests that send a numeric `userId`, malformed move fields, and unknown message types. Assert that the server returns `error` and continues serving subsequent valid messages.

**Step 7: Verify and commit**

Run:

```bash
npm test --workspace @codechess/server
npm run typecheck --workspace @codechess/server
```

Expected: all server tests pass.

```bash
git add codechess/server/src/server.ts codechess/server/test/server.test.ts
git commit -m "feat: associate UI and agent sockets per user"
```

## Task 4: Complete the UI Handshake

**Files:**

- Modify: `codechess/client/src/transport/websocket-game-transport.ts`
- Modify: `codechess/client/test/websocket-game-transport.test.ts`

**Step 1: Write failing handshake tests**

Assert that the transport:

- Sends `{ type: "hello", userId, role: "ui" }` on open.
- Resolves `connect()` only after a matching `hello_ack`.
- Treats `hello_ack` as success, not an invalid-protocol notice.
- Displays the server's `error.reason` without discarding the connection.

**Step 2: Run the focused client tests**

Run:

```bash
npm test --workspace @codechess/client -- websocket-game-transport
```

Expected: FAIL on the new role and acknowledgement assertions.

**Step 3: Import the shared parser and implement the handshake**

Remove the client's private `ServerMessage` union and parser. Keep FEN-to-display validation either in the shared parser or as a client-side state guard, but do not define the wire message twice.

**Step 4: Verify and commit**

Run:

```bash
npm test --workspace @codechess/client
npm run typecheck --workspace @codechess/client
```

Expected: 31 existing tests plus the new handshake tests pass.

```bash
git add codechess/client/src/transport/websocket-game-transport.ts codechess/client/test/websocket-game-transport.test.ts
git commit -m "fix: complete client websocket handshake"
```

## Task 5: Identify the Agent and Test Its Lifecycle Transport

**Files:**

- Modify: `codechess/agent/src/cli.ts`
- Modify: `codechess/agent/src/transport/websocketTransport.ts`
- Modify: `codechess/agent/src/types.ts`
- Create: `codechess/agent/test/cli.test.ts`
- Create: `codechess/agent/test/websocketTransport.test.ts`
- Modify: `codechess/agent/package.json`

**Step 1: Write failing CLI and transport tests**

Cover `--user-id`, `CODECHESS_USER_ID`, `--ws-url`, handshake acknowledgement, `waiting`, `done`, server errors, and clean close. Network mode must reject a missing user ID with a useful message.

**Step 2: Run the tests**

Run:

```bash
npm test --workspace @codechess/agent
```

Expected: FAIL because the CLI does not parse a user ID and the transport sends no `hello`.

**Step 3: Add the agent handshake**

Change the transport constructor to accept `{ url, userId }`. On open, send `{ type: "hello", userId, role: "agent" }`, wait for `hello_ack`, then allow `waiting` and `done`.

**Step 4: Make CLI parsing importable**

Export a pure `parseCliOptions` function and keep process startup in a small `main` wrapper. Update help text to show the same URL and user ID used by the TUI.

**Step 5: Replace the placeholder test script**

Run the new test files rather than importing `cli.ts --help` as a substitute for tests.

**Step 6: Verify and commit**

Run:

```bash
npm test --workspace @codechess/agent
npm run typecheck --workspace @codechess/agent
```

Expected: PASS.

```bash
git add codechess/agent
git commit -m "feat: connect agent lifecycle to user sessions"
```

## Task 6: Add a Real Four-Socket End-to-End Test

**Files:**

- Create: `codechess/server/test/full-flow.test.ts`

**Step 1: Write the end-to-end test before further server changes**

Use the real server, two `WebSocketGameTransport` instances, and two agent `WebSocketTransport` instances. Do not mock the wire.

Test this sequence:

1. Alice UI and Alice agent connect with `userId=alice`.
2. Bob UI and Bob agent connect with `userId=bob`.
3. Both agents send `waiting`.
4. Both UIs receive `match_found` and an active game state with opposite colors.
5. White sends a legal move; both UIs receive the same FEN and next turn.
6. One agent sends `done`; both UIs pause and the opponent sees `opponent_agent_finished`.
7. Both agents send `waiting` again; both UIs resume the saved FEN.

**Step 2: Run the test and fix only integration defects**

Run:

```bash
npm test --workspace @codechess/server -- --test-name-pattern="full four-socket flow"
```

Expected before Tasks 3–5: FAIL. Expected after Tasks 3–5: PASS without test-only protocol exceptions.

**Step 3: Run the entire suite repeatedly**

Run:

```bash
npm run check
npm run check
npm run check
```

Expected: three consecutive passes; this catches socket cleanup and port-race flakiness.

**Step 4: Commit**

```bash
git add codechess/server/test/full-flow.test.ts
git commit -m "test: cover complete CodeChess multiplayer flow"
```

## Task 7: Fix Game-State Defects Exposed by Integration

**Files:**

- Modify: `codechess/server/src/server.ts`
- Modify: `codechess/server/test/server.test.ts`
- Modify if the contract changes: `codechess/shared/src/protocol.ts`
- Modify if the contract changes: `codechess/shared/PROTOCOL.md`

**Step 1: Add a multi-move PGN regression test**

Play `e2-e4`, `e7-e5`, and `g1-f3`. Assert that saved PGN contains all three moves. The current server rebuilds `Chess` from FEN and overwrites PGN, so this test should fail.

**Step 2: Preserve full chess history**

Keep one `Chess` instance per in-memory game or reload the saved PGN before applying a move. Continue exposing FEN and PGN snapshots through the existing `Game` record.

**Step 3: Add promotion and game-over tests**

Choose queen as the default promotion unless the protocol gains an explicit promotion field. Mark the game `COMPLETED` after checkmate, stalemate, insufficient material, or draw, and reject later moves.

**Step 4: Verify and commit**

Run:

```bash
npm test --workspace @codechess/server
npm run typecheck --workspace @codechess/server
```

Expected: PASS with full PGN retained.

```bash
git add codechess/server codechess/shared
git commit -m "fix: preserve complete server game state"
```

## Task 8: Replace the Agent Shim with the Codex SDK

**Files:**

- Modify: `codechess/agent/src/lifecycle/codexLifecycle.ts`
- Modify: `codechess/agent/package.json`
- Create: `codechess/agent/test/codexLifecycle.test.ts`
- Modify: `codechess/agent/README.md`

**Step 1: Isolate the SDK behind a testable interface**

Inject the agent/run factory so tests can drive started, streamed, finished, and failed results without network calls.

**Step 2: Write failing lifecycle tests**

Assert that CodeChess sends `waiting` immediately before `agent.send`, streams activity without leaking prompt or code through the game server, awaits `run.wait()`, sends `done` for every terminal result, distinguishes startup failures from run failures, and disposes the SDK agent.

**Step 3: Use the TypeScript Codex SDK**

Replace the direct `openai.responses.create` call with `@cursor/sdk`'s `Agent.create` → `agent.send` → `run.stream` → `run.wait` lifecycle. Use an explicit local `cwd`, select an available model or `auto`, and dispose the agent with `await using` or `finally`.

**Step 4: Verify without credentials**

Run:

```bash
npm test --workspace @codechess/agent
npm run typecheck --workspace @codechess/agent
```

Expected: all mocked lifecycle tests pass without a real API key.

**Step 5: Perform one credentialed smoke test**

Run the documented manual mode first, then one short real SDK prompt with the required Codex API key. Confirm `waiting` precedes the run and `done` follows its terminal result.

**Step 6: Commit**

```bash
git add codechess/agent
git commit -m "feat: drive waiting state from Codex SDK lifecycle"
```

## Task 9: Make the Demo Reproducible

**Files:**

- Modify: `README.md`
- Modify: `codechess/README.md`
- Modify: `codechess/client/README.md`
- Modify: `codechess/server/README.md`
- Modify: `codechess/agent/README.md`
- Modify: `codechess/docs/DEMO_SCRIPT.md`
- Modify: `codechess/docs/EXECUTION_PLAN.md`
- Modify: `codechess/agent/src/lifecycle/manualLifecycle.ts`
- Modify: `codechess/agent/src/cli.ts`
- Modify: `codechess/agent/test/cli.test.ts`

**Step 1: Pick one port**

Use `ws://localhost:8080` everywhere. Support `PORT` for the server and `CODECHESS_WS_URL` for both clients. Remove the dead `--port=3000` instructions unless the server explicitly implements that flag.

**Step 2: Add a configurable manual delay**

Add `--manual-delay-ms` so two manual agents remain in `waiting` long enough to match and play during a rehearsal. Keep the default short for unit tests; use 15–30 seconds in the demo script.

**Step 3: Document the five-process local demo**

Use these logical processes:

1. Server
2. Alice TUI (`userId=alice`)
3. Bob TUI (`userId=bob`)
4. Alice agent (`userId=alice`)
5. Bob agent (`userId=bob`)

Document exact root-level npm commands so nobody changes directories or runs a nested install.

**Step 4: Rehearse the acceptance flow**

Verify:

```text
both agents waiting
→ both TUIs matched
→ legal move appears in both TUIs
→ one agent finishes
→ both TUIs pause
→ both agents wait again
→ saved board resumes
```

**Step 5: Final verification**

Run:

```bash
npm ci
npm run check
git status --short
```

Expected: install succeeds, every test/typecheck passes, and only intentional documentation or code changes appear.

**Step 6: Commit**

```bash
git add README.md codechess
git commit -m "docs: document reproducible CodeChess demo"
```

## Priority and Stop Conditions

Implement Tasks 1–6 first. They produce the smallest complete vertical slice and prove that the teammates' components work together. Task 7 repairs chess-state correctness. Task 8 makes the implementation match the PRD's Codex SDK promise. Task 9 packages the flow for the team and demo.

Stop feature work when the real four-socket test and the five-process manual demo both pass. Reconnection persistence, authentication, databases, ratings, and extra game modes remain out of scope.
