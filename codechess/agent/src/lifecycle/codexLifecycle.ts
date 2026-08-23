import OpenAI from "openai";
import type { LifecycleEventSink } from "../types.js";

export interface CodexLifecycleOptions {
  prompt: string;
  sink: LifecycleEventSink;
}

export async function runCodexLifecycle({ prompt, sink }: CodexLifecycleOptions) {
  sink.onTurnStarted();

  try {
    const client = new OpenAI();
    const stream = await client.responses.create({
      model: "gpt-5.6",
      input: prompt,
      stream: true
    });

    let finalOutput = "";
    for await (const event of stream) {
      const typedEvent = event as { type?: string; delta?: unknown };
      if (typedEvent.type === "response.output_text.delta" && typeof typedEvent.delta === "string") {
        finalOutput += typedEvent.delta;
        sink.onActivity("Codex: generating");
      }
      if (typedEvent.type === "response.completed") {
        sink.onActivity("Codex: completed");
      }
    }

    sink.onTurnCompleted(finalOutput.trim());
  } catch (error) {
    sink.onError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
