# Person 3: Codex Integration + Orchestration

This package is the standalone agent track.

## Install

```bash
cd agent
npm install
```

## Local computer test first

Run the manual lifecycle mode to verify event ordering and terminal behavior before connecting a WebSocket server:

```bash
npm run dev -- --mode manual --prompt "hello"
```

## Real Codex hookup

Use the default mode to run the real OpenAI SDK path:

```bash
npm run dev -- --prompt "build the feature"
```

Make sure `OPENAI_API_KEY` is set in your environment before running the real SDK path.

## WebSocket endpoint later

When the server URL is ready, add it with:

```bash
npm run dev -- --prompt "build the feature" --ws-url ws://localhost:3000
```

The agent sends only the protocol messages it owns:

- `waiting`
- `done`
