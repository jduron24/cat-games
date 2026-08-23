# shared/

The contract all three tracks code against.

- [`PROTOCOL.md`](PROTOCOL.md) — `ClientMessage` / `ServerMessage` shapes, `Game`/`User` records, and the sequence diagrams for match/move/pause/resume.

This is owned jointly, not by one person. Agree on changes here before writing client/server/agent code, and re-agree before changing it later — client and server drift out of sync fast if this file changes without both sides updating.
