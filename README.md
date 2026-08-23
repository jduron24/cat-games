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

## Run the public two-player demo

Deploy the included `render.yaml` as one Render service, then install the tagged
companion on each player's machine:

```bash
npm install --global github:jduron24/cat-games#codechess-v0.1.0
codechess setup --server https://YOUR-SERVICE.onrender.com
```

The first player hosts and shares the generated room code:

```bash
codechess host --name Alice
```

The second player joins from another terminal or computer:

```bash
codechess join BLUE-CAT7 --name Bob
```

Both players leave CodeChess open and use Codex normally. When both submit
prompts, their boards activate at the same saved position. The game pauses when
either agent stops and resumes when their prompt activity overlaps again.

The public server intentionally uses in-memory state for the hackathon: run one
instance, and expect rooms to reset whenever that instance restarts.

## Run the repository demo

The full demo uses one server, two terminal UIs, and two agent processes. See
[the demo script](codechess/docs/DEMO_SCRIPT.md) for the five commands and the
match, move, pause, and resume rehearsal.

Package details live in the [CodeChess overview](codechess/README.md).
