# CodeChess Terminal UI Design

## Scope

The client renders and controls one chess game in a terminal. It proposes moves but does not decide production move legality. A local mock uses `chess.js` so the client can be demonstrated without the multiplayer server. Matchmaking, authentication, persistence, and Codex lifecycle integration remain outside this package.

## Chosen approach

Use Terminal Kit for raw keyboard input, mouse reporting, resize events, alternate-screen handling, and terminal cleanup. Render a fixed, centered board with small ANSI primitives. This keeps square geometry explicit and makes mouse hit testing share the same layout object as rendering.

Two alternatives were considered. Ink would provide a component model but adds React and makes precise mouse hit testing less direct. A hand-rolled stdin parser would reduce dependencies but would duplicate terminal compatibility and cleanup work. Terminal Kit gives the smallest reliable input layer for this scope.

The visual system uses a dark slate frame, alternating board cells, cyan keyboard focus, amber source selection, and green last-move marks. Focus and selection also use distinct cell punctuation so the UI does not rely on color alone. The board flips by changing one pure index-to-square mapping; rendering and mouse input both call that function.

## Components and data flow

`GameTransport` exposes connection lifecycle, move submission, state subscriptions, and short UI notices. `MockGameTransport` owns a `chess.js` instance, applies submitted moves, emits FEN snapshots, and schedules a deterministic opponent response. `WebSocketGameTransport` translates the shared wire protocol into the same `GameState` shape and sends the agreed `{ type, from, to }` message.

The terminal controller subscribes to transport state, parses only FEN piece placement for display, and redraws. Keyboard and mouse input resolve to a visual board index and then to an algebraic square. The selection reducer returns either a new selection or a completed move; the controller forwards completed moves to the transport. Mock-only keys call an injected development-controls object and never exist in production mode.

## Failure handling and cleanup

Small terminals show a resize message instead of a partial board. Resize events redraw in either state. Cleanup is idempotent: it removes listeners, disables mouse/raw input, restores the cursor, resets ANSI styles, and exits the alternate screen. The entry point invokes cleanup from `finally`, `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection` paths.

WebSocket parse failures and rejected moves become non-fatal notices. A disconnected or unavailable production server reports an error and still restores the terminal.

## Tests

Vitest covers white and black board mapping, reverse square mapping, mouse hit testing and outside coordinates, the select/select move transition, Escape cancellation, FEN parsing, mock move/state behavior, and WebSocket protocol translation where practical. A TypeScript build catches transport and Terminal Kit API drift. A PTY smoke run starts mock mode, renders the board, accepts `q`, and confirms cleanup.
