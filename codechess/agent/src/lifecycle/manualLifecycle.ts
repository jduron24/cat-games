import type { LifecycleEventSink } from "../types.js";

export type ManualLifecycleOptions = {
  delayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export async function runManualLifecycle(
  prompt: string,
  sink: LifecycleEventSink,
  options: ManualLifecycleOptions = {},
): Promise<void> {
  const delayMs = options.delayMs ?? 800;
  const sleep = options.sleep ?? defaultSleep;
  const firstDelayMs = Math.floor(delayMs / 2);

  await sink.onTurnStarted();
  sink.onActivity(`Codex: running local computer test for "${prompt}"`);
  await sleep(firstDelayMs);
  sink.onActivity("Codex: validating output");
  await sleep(delayMs - firstDelayMs);
  await sink.onTurnCompleted(`Local computer test complete for: ${prompt}`);
}
