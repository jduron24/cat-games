import assert from "node:assert/strict";
import { test } from "node:test";

import { runManualLifecycle } from "../src/lifecycle/manualLifecycle.js";
import type { LifecycleEventSink } from "../src/types.js";

test("keeps the manual lifecycle waiting for the configured total delay", async () => {
  const events: string[] = [];
  const delays: number[] = [];
  const sink: LifecycleEventSink = {
    onActivity(message) {
      events.push(message);
    },
    async onTurnStarted() {
      events.push("waiting");
    },
    async onTurnCompleted(output) {
      events.push(`done:${output}`);
    },
    onError(error) {
      assert.fail(error.message);
    },
  };

  await runManualLifecycle("demo turn", sink, {
    delayMs: 15_000,
    async sleep(delayMs) {
      delays.push(delayMs);
    },
  });

  assert.equal(delays.reduce((total, delay) => total + delay, 0), 15_000);
  assert.equal(events[0], "waiting");
  assert.equal(events.at(-1), "done:Local computer test complete for: demo turn");
});
