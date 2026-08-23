import type { AgentTransport, AgentTransportMessage } from "../types.js";

export class ConsoleTransport implements AgentTransport {
  async send(message: AgentTransportMessage): Promise<void> {
    console.log(JSON.stringify(message));
  }

  async close(): Promise<void> {
    return;
  }
}
