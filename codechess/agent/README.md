# CodeChess Agent

This package maps an agent run to the CodeChess lifecycle: it sends `waiting`
before the run starts and `done` after every terminal result.

Run all commands from the repository root. The Cursor SDK requires Node.js
22.13 or later.

## Manual mode

Manual mode tests the lifecycle without an API key:

```bash
npm run agent -- --mode manual --prompt "hello"
```

## Cursor SDK mode

Set a Cursor API key, then run a local SDK agent against the current checkout:

```bash
export CURSOR_API_KEY="your-key"
npm run agent -- --prompt "build the feature"
```

The runner uses `@cursor/sdk` with `{ model: { id: "auto" } }` and an explicit
local working directory. It streams generic activity labels to stderr, prints
the final result locally, and never sends prompt or source text through the
CodeChess game server.

## Multiplayer lifecycle

Use the same URL and user ID as the matching terminal UI:

```bash
npm run agent -- \
  --mode manual \
  --prompt "demo turn" \
  --ws-url ws://localhost:8080 \
  --user-id alice
```

You can also set `CODECHESS_WS_URL` and `CODECHESS_USER_ID`.
