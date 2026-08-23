# Cat Games

This repository contains CodeChess, a multiplayer terminal chess experiment for developers waiting on AI coding agents.

## Run the standalone terminal UI

Requires Node.js 20 or newer and an interactive terminal at least 70 columns by 24 rows.

```bash
npm install
npm run ui:mock
```

No server or agent integration is required in mock mode. See [`codechess/client/README.md`](codechess/client/README.md) for controls, tests, architecture, WebSocket setup, and compatibility notes.

```bash
npm test
npm run build
```
