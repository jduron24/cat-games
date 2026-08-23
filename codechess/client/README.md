# Person 1: Terminal Chess UI

Owner of everything the developer sees and interacts with inside the terminal.

Protocol contract: [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md). You do **not** own chess move validation — you send proposed moves and render whatever the server confirms.

## Must have

- [ ] Render chessboard (8x8 grid, coordinate labels a–h / 1–8)
- [ ] Render chess pieces (Unicode glyphs, per PRD example)
- [ ] Show player color (white/black, from `match_found.color`)
- [ ] Show current turn (from `game_state.turn` / `move_accepted.turn`)
- [ ] Keyboard cursor movement (arrow keys)
- [ ] Select piece with `Enter`
- [ ] Select destination with `Enter` → send `{ type: "move", from, to }`
- [ ] Receive updated board state (`game_state`, `move_accepted`) and redraw

## Next priority

- [ ] Mouse capture (terminal mouse reporting)
- [ ] Convert terminal x/y → board row/column → chess square
- [ ] Click piece to select, click destination to attempt move
- [ ] Highlight selected square
- [ ] Highlight legal destination squares (only if server exposes them cheaply — otherwise skip, don't compute legality client-side)

## Stretch

- [ ] Drag-and-drop (mouse down → drag → release)
- [ ] Animations
- [ ] Better Unicode styling / board theming
- [ ] Board resizing on terminal resize

## Interface you consume from the server

```json
{ "type": "match_found", "gameId": "...", "color": "white", "fen": "..." }
{ "type": "game_state", "fen": "...", "turn": "white" }
{ "type": "move_accepted", "fen": "...", "turn": "black" }
{ "type": "move_rejected", "reason": "..." }
{ "type": "game_paused" }
{ "type": "opponent_agent_finished" }
{ "type": "game_resumed", "fen": "...", "pgn": "..." }
```

## What you send

```json
{ "type": "move", "from": "e2", "to": "e4" }
```

## UX states to handle

1. **Idle** — no game, agent not waiting. Normal terminal.
2. **Waiting for player** — your agent is waiting, no opponent yet. Show "Waiting for another developer..."
3. **Active** — board rendered, moves flow both ways.
4. **Paused** — either agent finished. Freeze the board, show why (`game_paused` / `opponent_agent_finished`), and get out of the way so the AI result is visible.
5. **Resumed** — same two players waiting again; load the resumed FEN/PGN instead of a fresh board.

## Suggested libraries

Terminal rendering: Terminal Kit, Ink, or hand-rolled ANSI. WebSocket client: `ws` (Node) or the browser-native `WebSocket` if the client ever runs outside Node.

## Standalone test target (before integrating with Person 2)

You can build and demo the board + keyboard/mouse interaction against a stub/mock server that just echoes moves back as accepted, so you're not blocked waiting on the real server.
