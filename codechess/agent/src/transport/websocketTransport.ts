import { parseServerMessage } from "@codechess/shared";
import WebSocket from "ws";

import type { AgentTransport, AgentTransportMessage } from "../types.js";

export type WebSocketTransportOptions = {
  url: string;
  userId: string;
  onError?: (error: Error) => void;
  handshakeTimeoutMs?: number;
};

export class WebSocketTransport implements AgentTransport {
  private readonly socket: WebSocket;
  private readonly ready: Promise<void>;
  private readonly onError: (error: Error) => void;

  constructor(options: WebSocketTransportOptions) {
    const userId = options.userId.trim();
    if (!userId) {
      throw new Error("WebSocket agent transport requires a non-empty user ID.");
    }
    this.socket = new WebSocket(options.url);
    this.onError = options.onError ?? (() => undefined);
    this.ready = new Promise((resolve, reject) => {
      let acknowledged = false;
      const handshakeTimeout = setTimeout(() => {
        if (acknowledged) {
          return;
        }

        const error = new Error("WebSocket agent handshake timed out.");
        this.onError(error);
        reject(error);
        this.socket.close();
      }, options.handshakeTimeoutMs ?? 5_000);

      this.socket.on("open", () => {
        this.socket.send(JSON.stringify({
          type: "hello",
          userId,
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
        if (message.type === "hello_ack") {
          if (message.userId === userId && message.role === "agent") {
            acknowledged = true;
            clearTimeout(handshakeTimeout);
            resolve();
          } else if (!acknowledged) {
            clearTimeout(handshakeTimeout);
            const error = new Error(
              "Server acknowledgement identity did not match this agent.",
            );
            this.onError(error);
            reject(error);
            this.socket.close();
          }
          return;
        }
        if (message.type === "error") {
          const error = new Error(message.reason);
          this.onError(error);
          if (!acknowledged) {
            clearTimeout(handshakeTimeout);
            reject(error);
          }
        }
      });
      this.socket.on("error", (cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.onError(error);
        if (!acknowledged) {
          clearTimeout(handshakeTimeout);
          reject(error);
        }
      });
      this.socket.on("close", () => {
        if (!acknowledged) {
          clearTimeout(handshakeTimeout);
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
