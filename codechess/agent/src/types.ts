import type { ClientMessage } from "@codechess/shared";

export type AgentTransportMessage = Extract<ClientMessage, { type: "waiting" | "done" }>;

export interface AgentTransport {
  send(message: AgentTransportMessage): Promise<void>;
  close(): Promise<void>;
}

export interface LifecycleEventSink {
  onActivity(message: string): void;
  onTurnStarted(): void;
  onTurnCompleted(finalOutput: string): void;
  onError(error: Error): void;
}
