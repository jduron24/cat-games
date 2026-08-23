export type AgentTransportMessage =
  | { type: "waiting" }
  | { type: "done" };

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
