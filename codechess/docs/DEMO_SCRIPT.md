# CodeChess Five-Process Demo

Run every command from the repository root. Use five terminals or terminal
panes. Keep the server running for the entire rehearsal so the paused game stays
in memory.

## 1. Start the server

```bash
npm run server
```

Wait for:

```text
CodeChess WebSocket server listening on ws://localhost:8080
```

## 2. Start Alice's UI

```bash
npm run ui -- --url ws://localhost:8080 --user-id alice
```

## 3. Start Bob's UI

```bash
npm run ui -- --url ws://localhost:8080 --user-id bob
```

## 4. Start Alice's manual agent

```bash
npm run agent -- \
  --mode manual \
  --prompt "Alice demo turn" \
  --manual-delay-ms 30000 \
  --ws-url ws://localhost:8080 \
  --user-id alice
```

## 5. Start Bob's manual agent

```bash
npm run agent -- \
  --mode manual \
  --prompt "Bob demo turn" \
  --manual-delay-ms 15000 \
  --ws-url ws://localhost:8080 \
  --user-id bob
```

Both UIs should match with opposite colors. The developer assigned White plays
`e2` to `e4`; both boards should show the same position and Black to move.

After 15 seconds, Bob's agent sends `done`. Both boards pause, and Alice sees
that the opponent's agent finished.

## Resume the saved game

After both manual agent commands exit, rerun the Alice and Bob agent commands.
You may use 30000 milliseconds for both. Both UIs should resume the same board
with the `e2-e4` move preserved.

## Acceptance checklist

- [ ] Both agent terminals print `{"type":"waiting"}` only in console mode;
      with WebSocket mode, the server records both users as waiting.
- [ ] Both UIs match and show opposite colors.
- [ ] One legal move updates both boards.
- [ ] Bob's completion pauses both boards.
- [ ] Alice sees the opponent-finished notice.
- [ ] Restarting both agent commands resumes the saved FEN.
- [ ] The server reports no protocol errors.

Rehearse the sequence twice before presenting. Mock mode remains the fallback:

```bash
npm run ui:mock
```
