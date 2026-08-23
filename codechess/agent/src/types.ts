import type { ClientMessage } from "@codechess/shared";

export type AgentTransportMessage = Extract<ClientMessage, { type: "waiting" | "done" }>;

export interface AgentTransport {
  send(message: AgentTransportMessage): Promise<void>;
  close(): Promise<void>;
}

export interface LifecycleEventSink {
  onActivity(message: string): void;
  onTurnStarted(): void | Promise<void>;
  onTurnCompleted(finalOutput: string): void | Promise<void>;
  onError(error: Error): void;
}
