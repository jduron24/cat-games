# Person 3: Codex Integration + Orchestration

Owner of everything connecting CodeChess to the AI agent lifecycle.

Protocol contract: [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md). Your job is to translate Codex lifecycle events into the two client messages the server actually cares about: `waiting` and `done`.

## Must have

- [ ] `codechess "<prompt>"` command that starts an AI task
- [ ] Run Codex against the given prompt
- [ ] Observe Codex lifecycle events (`turn.started`, item events, `turn.completed`)
- [ ] On `turn.started` → send `{ type: "waiting" }` to the game server
- [ ] On `turn.completed` → send `{ type: "done" }` to the game server
- [ ] Expose basic agent activity to the UI (e.g. `Codex: ● Running tests`)
- [ ] On completion: notify game server, pause/hide game, restore normal terminal behavior, show the Codex result

## Stretch

- [ ] Multiple/more granular agent activity descriptions (per item event, e.g. "Editing src/auth.ts")
- [ ] Better transition animations between chess ↔ AI result
- [ ] Error/retry states surfaced to the UI

## Lifecycle mapping

```
turn.started      → USER_WAITING = true   → send "waiting"
  (item events)    → optional: forward activity text to UI, no protocol message needed
turn.completed    → USER_WAITING = false  → send "done"
```

## Completion sequence (must happen in this order)

```
1. Codex turn.completed fires
2. send { type: "done" } to game server
3. pause/hide the chess board in the UI
4. restore normal terminal output
5. render the Codex result to the user
```

Order matters: don't show the AI result before the `done` message is sent — the whole point is the opponent's terminal transitions out of "active game" promptly.

## Interface

You call into Person 1's client layer to mount/unmount the board and into Person 2's server via the same WebSocket the client uses — in the MVP this can be a single process/socket shared with the terminal UI rather than a separate connection, whichever is simpler to wire in the time available.

## Standalone test target (before integrating with the server)

Fake `turn.started` / `turn.completed` with a manual trigger (keypress or timer) and confirm the `waiting`/`done` messages fire in the right order and the activity text renders, before wiring in real Codex SDK events.
