# CodeChess Agent

The agent process sends `waiting` before a run starts and `done` after every
terminal result. Use the same user ID as its matching terminal UI.

Run all commands from the repository root. The Cursor SDK requires Node.js
22.13 or later.

## Manual mode

Manual mode needs no API key. Use `--manual-delay-ms` to keep an agent waiting
long enough for a multiplayer rehearsal:

```bash
npm run agent -- \
  --mode manual \
  --prompt "demo turn" \
  --manual-delay-ms 20000 \
  --ws-url ws://localhost:8080 \
  --user-id alice
```

The delay defaults to 800 milliseconds and accepts any non-negative integer.

## Cursor SDK mode

Set a Cursor API key, then run a local SDK agent against the current checkout:

```bash
export CURSOR_API_KEY="your-key"
npm run agent -- \
  --prompt "build the feature" \
  --ws-url ws://localhost:8080 \
  --user-id alice
```

The runner uses `@cursor/sdk` with model `auto` and an explicit local working
directory. It reports generic activity labels to stderr, prints the final result
locally, and never sends prompt or source text through the game server.

`CODECHESS_WS_URL` and `CODECHESS_USER_ID` can replace their matching flags.
