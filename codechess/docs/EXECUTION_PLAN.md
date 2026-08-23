# 4-Hour Execution Plan

## 0:00–0:20 — All three together

- Set up repository (`/client`, `/server`, `/agent`, `/shared` — already scaffolded here).
- Install dependencies.
- Agree on the WebSocket protocol: [`../shared/PROTOCOL.md`](../shared/PROTOCOL.md). Lock it before splitting up.
- Make sure everyone can run the project.

## 0:20–1:30 — Work independently

**Person 1 (client)** — target: terminal board + keyboard movement + select/move. See [`../client/README.md`](../client/README.md).

**Person 2 (server)** — target: two terminals + WebSocket server + matchmaking + move syncing. See [`../server/README.md`](../server/README.md).

**Person 3 (agent)** — target: Codex task + detect agent start + detect agent completion. See [`../agent/README.md`](../agent/README.md).

## 1:30–2:15 — Integrate Person 1 + Person 2

Forget Codex temporarily. Open two terminals. Both should see the same game.

Verify:

```
A moves → B updates
B moves → A updates
```

**This is the most important milestone.** If this isn't solid, don't move on.

## 2:15–3:00 — Integrate Person 3

Target full flow:

```
Alice prompts agent → Alice waiting
Bob prompts agent   → Bob waiting
Both matched        → chess appears
They play
Bob's agent finishes → chess pauses → Bob gets AI response
```

## 3:00–3:30 — Polish

Priorities, in order:

1. Mouse click support
2. Agent activity text
3. Better chessboard rendering
4. Clear waiting / matched / paused states

Do not add new infrastructure during this window.

## 3:30–4:00 — Demo prep

Stop feature development. Prepare the demo. Rehearse the exact sequence in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) multiple times.
