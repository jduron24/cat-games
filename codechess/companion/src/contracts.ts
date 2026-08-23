export type TerminalSession = {
  websocketUrl: string;
  playerToken: string;
};

export type RunTerminal = (session: TerminalSession) => Promise<void>;
