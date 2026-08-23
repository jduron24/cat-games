# Hackathon Demo Script

Use two terminals side-by-side. Rehearse this exact sequence before presenting.

## Step 1

Both terminals idle. No chess.

## Step 2

Alice runs:

```bash
codechess "inspect this repository and run the test suite"
```

Show:

```text
Codex working...
Waiting for another developer...
```

No chess yet.

## Step 3

Bob runs:

```bash
codechess "find a bug and propose a fix"
```

Now: Alice waiting, Bob waiting. Chess automatically appears in both terminals.

## Step 4

Alice clicks `e2` then `e4`. Bob's board instantly updates.

## Step 5

Bob plays `e7 → e5`. Alice instantly sees it.

## Step 6

Continue playing while the terminals display agent activity, e.g. `Codex: ● Running tests`.

## Step 7

Bob's agent finishes first.

Bob immediately gets:

```text
✓ Codex completed
```

Alice gets:

```text
Opponent's agent finished.
Game paused.
```

## Step 8

Later, both run another prompt. CodeChess detects their previous game. Instead of starting over:

```text
Game resumed
```

with `1. e4 e5` still on the board.

---

## Rehearsal checklist

- [ ] Run the full sequence at least twice before presenting.
- [ ] Confirm timing: don't let "waiting for another developer" hang too long on stage — pre-arrange prompts so both agents start within a few seconds of each other.
- [ ] Have a fallback prompt ready for each developer in case the first one resolves too fast (Codex finishing before the match happens ruins the demo).
- [ ] Confirm the pause message is unmistakable on stage — this is the "aha" moment, don't let it be subtle.
- [ ] Confirm resume actually loads the prior FEN/PGN and doesn't silently start a fresh board.
