import { parseServerMessage } from "@codechess/shared";
import WebSocket from "ws";

import type { AgentTransport, AgentTransportMessage } from "../types.js";

export type WebSocketTransportOptions = {
  url: string;
  userId: string;
  onError?: (error: Error) => void;
};

export class WebSocketTransport implements AgentTransport {
  private readonly socket: WebSocket;
  private readonly ready: Promise<void>;
  private readonly onError: (error: Error) => void;

  constructor(options: WebSocketTransportOptions) {
    this.socket = new WebSocket(options.url);
    this.onError = options.onError ?? (() => undefined);
    this.ready = new Promise((resolve, reject) => {
      let acknowledged = false;

      this.socket.on("open", () => {
        this.socket.send(JSON.stringify({
          type: "hello",
          userId: options.userId,
          role: "agent",
        }));
      });
      this.socket.on("message", (data) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          const error = new Error("Server sent an unreadable message to the agent transport.");
          this.onError(error);
          return;
        }

        const message = parseServerMessage(parsed);
        if (!message) {
          this.onError(new Error("Server sent an invalid agent protocol message."));
          return;
        }
        if (
          message.type === "hello_ack" &&
          message.userId === options.userId &&
          message.role === "agent"
        ) {
          acknowledged = true;
          resolve();
          return;
        }
        if (message.type === "error") {
          const error = new Error(message.reason);
          this.onError(error);
          if (!acknowledged) {
            reject(error);
          }
        }
      });
      this.socket.on("error", (cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.onError(error);
        if (!acknowledged) {
          reject(error);
        }
      });
      this.socket.on("close", () => {
        if (!acknowledged) {
          reject(new Error("Agent WebSocket closed before handshake acknowledgement."));
        }
      });
    });
  }

  async send(message: AgentTransportMessage): Promise<void> {
    await this.ready;
    this.socket.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "disconnect" }));
    }
    this.socket.close();
  }
}
