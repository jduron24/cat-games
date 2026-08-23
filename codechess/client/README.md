# CodeChess Terminal Client

The client renders server state and proposes moves. The server remains
authoritative for turns, legality, game completion, pause, and resume.

## Start the client

Run the standalone mock from the repository root:

```bash
npm run ui:mock
```

Run a multiplayer UI against the default server:

```bash
npm run ui -- --url ws://localhost:8080 --user-id alice
```

`CODECHESS_WS_URL` and `CODECHESS_USER_ID` provide the same values. The URL
defaults to `ws://localhost:8080`.

## Controls

| Input | Action |
|---|---|
| Arrow keys | Move the keyboard cursor |
| Enter | Select a source, then a destination |
| Mouse click | Select a source, then a destination |
| Escape | Cancel the current selection |
| `q` | Quit and restore the terminal |

Mock mode adds development controls:

| Key | Action |
|---|---|
| `p` | Toggle paused or active |
| `o` | Make the opponent move when Black has the turn |
| `r` | Reset the game |
| `f` | Mark the opponent agent finished and pause |

## Runtime notes

- Use Node.js 22.13 or later and an interactive TTY of at least 70×24 cells.
- Mouse input requires xterm-style button reporting.
- A monospace font should render each Unicode chess piece in one cell.
- Drag-and-drop is unsupported; mouse interaction is click-to-move.

Run `npm run check` from the repository root to execute all tests and
typechecks.
