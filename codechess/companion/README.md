# CodeChess companion

The `codechess` CLI stores private room credentials in `~/.codechess/config.json`
with mode `0600` and installs fail-open user hooks in `~/.cursor/hooks.json`.

Hook activity IDs are SHA-256 hashes. CodeChess prefers a Codex task, thread,
session, or conversation ID. If an older hook payload provides none of those,
it uses one stable fallback activity for the configured player. Hook requests
never include prompts, source code, or terminal content.
