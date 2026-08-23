# Cat Games

This repository contains CodeChess, a multiplayer terminal chess game for
developers waiting on coding agents. Two terminal UIs share a server-authoritative
game while two role-specific agent processes control matchmaking and pause state.

## Requirements

- Node.js 22.13 or later
- npm
- An interactive terminal at least 70 columns by 24 rows for each UI

Install and verify every workspace from the repository root:

```bash
npm ci
npm run check
```

## Run the standalone UI

Mock mode needs no server or agent:

```bash
npm run ui:mock
```

## Run the multiplayer demo

The full demo uses one server, two terminal UIs, and two agent processes. See
[the demo script](codechess/docs/DEMO_SCRIPT.md) for the five commands and the
match, move, pause, and resume rehearsal.

Package details live in the [CodeChess overview](codechess/README.md).
