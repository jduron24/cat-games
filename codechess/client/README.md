# CodeChess Terminal Client

The client renders chess state, handles keyboard and mouse input, and proposes moves through a transport interface. The production server remains authoritative for legality. The standalone mock uses `chess.js` only to provide a useful local game.

## Quick start

From the repository root:

```bash
npm install
npm run ui:mock
```

The mock starts from the normal opening position, assigns White, accepts legal moves, and makes a Black move after 700 ms.

## Controls

| Input | Action |
|---|---|
| Arrow keys | Move the keyboard cursor |
| Enter | Select a source, then a destination |
| Mouse click | Select a source, then a destination |
| Escape | Cancel the current selection |
| q | Quit and restore the terminal |

Mock mode also enables:

| Key | Action |
|---|---|
| p | Toggle paused/active |
| o | Make the opponent move immediately when it is Black's turn |
| r | Reset the game |
| f | Mark the opponent's agent finished and pause |

These development keys are not registered in WebSocket mode.

## Tests and type checking

From the repository root:

```bash
npm test
npm run build
```

The tests cover both board orientations, mouse hit testing and bounds, FEN display parsing, source/destination selection, Escape, mock play and controls, WebSocket messages, rendering states, keyboard/mouse controller flow, and cleanup.

## WebSocket mode

The adapter follows [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md). Start it against the backend with:

```bash
npm run ui -- --url ws://localhost:8080 --user-id alice
```

The same values can come from `CODECHESS_WS_URL` and `CODECHESS_USER_ID`.

The client sends `hello` after connecting, then emits moves as:

```json
{ "type": "move", "from": "e2", "to": "e4" }
```

The agent-integration track owns `waiting` and `done`; the terminal UI does not claim agent lifecycle state. The backend still owns matchmaking, accepted/rejected move decisions, state persistence, pause/resume coordination, and authoritative FEN updates. The current adapter expects the message shapes already committed in the shared protocol; it does not add authentication or reconnection policy.

## Architecture

- `coordinates.ts` owns visual index, algebraic square, orientation, and mouse coordinate conversion.
- `fen.ts` parses piece placement for display without implementing chess rules.
- `selection.ts` is the pure source/destination state transition.
- `renderer.ts` returns a terminal frame from `GameState`; `theme.ts` contains all ANSI styling.
- `terminal-ui.ts` connects input and rendering to any `GameTransport`.
- `MockGameTransport` runs a local `chess.js` game and development controls.
- `WebSocketGameTransport` translates the shared protocol into `GameState` updates.
- `index.ts` installs terminal cleanup for normal exit, `SIGINT`, `SIGTERM`, uncaught exceptions, and unhandled rejections.

## Terminal compatibility

- Requires Node.js 20 or newer, an interactive TTY, and at least 70×24 cells.
- Mouse input depends on xterm-style button reporting. It works in common terminals such as iTerm2, xterm, GNOME Terminal, Konsole, and compatible emulators, but may be unavailable in basic consoles or restricted remote sessions.
- Unicode chess glyph width depends on the terminal font. A monospace font that renders chess symbols as one cell gives the intended alignment.
- ANSI 256-color support gives the intended palette. Limited-color terminals remain usable because focus, selection, and last moves also use different punctuation.
- Drag-and-drop is not implemented; mouse interaction is click-to-move.
