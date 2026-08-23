# Public CodeChess Hackathon Demo

This guide covers the installable two-person terminal demo. The public server
runs one instance and stores rooms and games in memory. A deployment, crash, or
restart clears all rooms; create and join a new room to recover.

## Deploy the server

Create a Render Blueprint from `render.yaml`, deploy one instance, and wait for
`GET /healthz` to return HTTP 200. Do not enable horizontal scaling: separate
instances cannot share in-memory rooms.

Convert the assigned HTTPS origin to WSS when diagnosing socket connections:

```text
https://codechess-hackathon.onrender.com
wss://codechess-hackathon.onrender.com
```

The CLI performs this conversion automatically.

## Install the hackathon companion

Install Node.js 22.13 or later, then install the release tag:

```bash
npm install --global "https://github.com/jduron24/cat-games/archive/refs/heads/codex/hackathon-public-terminal.tar.gz"
codechess --help
```

Use the archive URL rather than npm's `github:` Git dependency shorthand. npm
can leave global workspace Git installs linked to its temporary clone, which
breaks the executable after installation.

## Configure prompt hooks

Each player runs setup once with the same server:

```bash
codechess setup --server https://codechess-hackathon.onrender.com
codechess doctor
```

Setup adds CodeChess entries to the user's existing Codex hooks. It preserves
unrelated hooks. CodeChess hook failures do not block prompts.
Local configuration is stored in `~/.codechess/config.json` with mode `0600`.

## Start a room

Alice hosts and leaves the terminal open:

```bash
codechess host --name Alice
```

Alice sends the displayed room code to Bob. Bob joins and leaves his terminal
open:

```bash
codechess join BLUE-CAT7 --name Bob
```

Both players now submit normal Codex prompts. When both agents are active, the
same chess position appears in both terminals. A legal move updates both. When
either agent stops, the game pauses. The next pair of overlapping prompts
resumes the saved position.

## Recover and uninstall

If a terminal disconnects while the server remains alive, leave it open while
it reconnects or run:

```bash
codechess play
```

If the server restarted, Alice creates a new room and Bob joins the new code.

If `codechess doctor` cannot reach the server, verify the Render service is
awake and that the local network permits outbound HTTPS and WebSockets. A proxy
that blocks WebSocket upgrades will allow health checks but prevent the board
from connecting.

Remove only the CodeChess hooks with:

```bash
codechess uninstall-hooks
```

## Two-machine acceptance record

Before presenting, record:

- release tag and commit
- Render service URL
- Alice and Bob operating systems
- room code
- FEN after one accepted move
- pause and resume result
- reconnect result
- rematch result
