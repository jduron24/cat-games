# Integrated Execution Status

The original client, server, and agent tracks now run as one npm workspace.
Development follows this dependency order:

1. One root install and one lockfile.
2. One runtime-validated shared protocol.
3. Paired UI and agent sockets per user.
4. Real UI and agent handshakes.
5. A four-socket integration test.
6. Complete PGN, promotion, and terminal chess state.
7. Cursor SDK lifecycle and deterministic manual mode.
8. Five-process demo rehearsal.

## Automated acceptance

Run from the repository root:

```bash
npm ci
npm run check
```

The server integration suite opens two real UI transports and two real agent
transports. It verifies match, move, pause, and saved-state resume without wire
mocks. Package tests also cover malformed messages, socket ownership, PGN
history, promotion, terminal chess states, CLI configuration, and SDK lifecycle
cleanup.

## Manual acceptance

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Stop feature work after the complete
five-process flow passes twice.

The demo does not require an API key because manual mode drives the same
`waiting` and `done` transport. A credentialed SDK check additionally requires
`CURSOR_API_KEY`.

## Deferred work

Authentication, reconnect persistence, databases, ratings, chat, spectators,
chess clocks, and additional game modes remain outside this integration.
