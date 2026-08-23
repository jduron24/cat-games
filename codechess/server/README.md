# Person 2: Multiplayer + Game Server

This folder now includes a temporary WebSocket endpoint so Person 3 can connect while the full server is being built.

## Start the endpoint

```bash
cd server
npm install
npm run dev -- --port=3000
```

The temporary endpoint listens on:

```bash
ws://localhost:3000
```

## What it handles

- `hello`
- `waiting`
- `done`
- `move`

It is intentionally minimal and in-memory only. It exists so the agent track can be wired and tested before the full chess server is finished.
