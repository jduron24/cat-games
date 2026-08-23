import WebSocket from "ws";
import type { AgentTransport, AgentTransportMessage } from "../types.js";

export class WebSocketTransport implements AgentTransport {
  private readonly socket: WebSocket;
  private readonly ready: Promise<void>;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  async send(message: AgentTransportMessage): Promise<void> {
    await this.ready;
    this.socket.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    this.socket.close();
  }
}
