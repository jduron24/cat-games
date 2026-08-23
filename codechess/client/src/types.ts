export type PlayerColor = "white" | "black";

export type GameStatus = "active" | "paused" | "completed";

export type OpponentStatus = "waiting" | "playing" | "agent_finished";

export type Square = `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"}`;

export type GameState = {
  fen: string;
  playerColor: PlayerColor;
  turn: PlayerColor;
  status: GameStatus;
  opponentStatus?: OpponentStatus;
  lastMove?: {
    from: Square;
    to: Square;
  };
};

export type Move = {
  from: Square;
  to: Square;
};
