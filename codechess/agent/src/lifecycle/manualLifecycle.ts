import type { LifecycleEventSink } from "../types.js";

export async function runManualLifecycle(prompt: string, sink: LifecycleEventSink) {
  sink.onTurnStarted();
  sink.onActivity(`Codex: running local computer test for "${prompt}"`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  sink.onActivity("Codex: validating output");
  await new Promise((resolve) => setTimeout(resolve, 400));
  sink.onTurnCompleted(`Local computer test complete for: ${prompt}`);
}
