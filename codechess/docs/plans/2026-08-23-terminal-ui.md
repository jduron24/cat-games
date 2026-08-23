# CodeChess Terminal UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a polished, independently runnable terminal chess client with keyboard, mouse, mock play, and a minimal WebSocket adapter.

**Architecture:** Pure modules own board geometry, FEN display parsing, and selection transitions. A Terminal Kit controller renders and handles input against a transport interface; mock and WebSocket transports provide interchangeable state sources.

**Tech Stack:** TypeScript, Node.js, Terminal Kit, chess.js, ws, Vitest, tsx

---

### Task 1: Workspace and board geometry

**Files:**
- Create: `package.json`
- Create: `codechess/client/package.json`
- Create: `codechess/client/tsconfig.json`
- Create: `codechess/client/src/types.ts`
- Create: `codechess/client/src/coordinates.ts`
- Test: `codechess/client/test/coordinates.test.ts`

1. Add failing tests for white orientation, black orientation, reverse mapping, mouse cells, and outside coordinates.
2. Run `npm test -- --run test/coordinates.test.ts` and confirm missing-module failure.
3. Add square types, centralized dimensions, layout calculation, and mapping functions.
4. Run the coordinate tests and confirm they pass.

### Task 2: FEN display and move selection

**Files:**
- Create: `codechess/client/src/fen.ts`
- Create: `codechess/client/src/selection.ts`
- Test: `codechess/client/test/fen.test.ts`
- Test: `codechess/client/test/selection.test.ts`

1. Add failing tests for initial FEN parsing, invalid placement, `e2` then `e4`, and Escape cancellation.
2. Run the targeted tests and confirm missing-module failures.
3. Implement a piece-placement parser and stateless selection transitions.
4. Run the targeted tests and confirm they pass.

### Task 3: Transport boundary and functional mock

**Files:**
- Create: `codechess/client/src/transport/game-transport.ts`
- Create: `codechess/client/src/transport/mock-game-transport.ts`
- Create: `codechess/client/src/transport/websocket-game-transport.ts`
- Test: `codechess/client/test/mock-game-transport.test.ts`
- Test: `codechess/client/test/websocket-game-transport.test.ts`

1. Add failing tests for initial state, move events, opponent response, pause/resume, reset, agent-finished state, and shared protocol translation.
2. Run the transport tests and confirm missing-module failures.
3. Implement the interface, mock chess state machine, and minimal WebSocket protocol adapter.
4. Run the transport tests and confirm they pass.

### Task 4: Terminal renderer and input controller

**Files:**
- Create: `codechess/client/src/theme.ts`
- Create: `codechess/client/src/renderer.ts`
- Create: `codechess/client/src/terminal-ui.ts`
- Create: `codechess/client/src/index.ts`

1. Add renderer assertions for required labels, orientation, focus and selection markers, small-terminal copy, and mock-control visibility.
2. Run the renderer tests and confirm missing-module failures.
3. Implement fixed layout rendering, keyboard navigation, click-to-move, resize redraws, notices, and idempotent cleanup.
4. Wire the CLI for `--mock` and optional `--url`/environment configuration.
5. Run renderer tests and the full suite.

### Task 5: Documentation and verification

**Files:**
- Modify: `codechess/client/README.md`
- Modify: `codechess/README.md`

1. Document root-level install, mock, test, build, and production WebSocket commands.
2. Run `npm test` and confirm zero failures.
3. Run `npm run build` and confirm TypeScript exits successfully.
4. Start `npm run ui:mock` in a PTY, confirm the board renders, send `q`, and confirm the normal shell cursor/input state returns.
5. Review the diff against every deliverable and non-goal before handoff.
