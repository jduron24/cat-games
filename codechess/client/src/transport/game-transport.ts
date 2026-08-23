import type { GameState, Square } from "../types.js";

export type TransportNotice = {
  level: "info" | "error";
  message: string;
};

export interface GameTransport {
  connect(): Promise<void>;
  sendMove(from: Square, to: Square): void;
  onGameState(handler: (state: GameState) => void): void;
  onNotice(handler: (notice: TransportNotice) => void): void;
  disconnect(): void;
}
