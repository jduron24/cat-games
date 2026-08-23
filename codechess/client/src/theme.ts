export const ANSI_RESET = "\u001b[0m";

export const THEME = {
  frame: ["38;5;67"],
  title: ["1", "38;5;51"],
  primaryText: ["38;5;255"],
  mutedText: ["38;5;109"],
  successText: ["1", "38;5;84"],
  warningText: ["1", "38;5;221"],
  errorText: ["1", "38;5;203"],
  board: {
    light: "48;5;238",
    dark: "48;5;234",
    cursor: "48;5;38",
    selected: "48;5;178",
    cursorSelected: "48;5;208",
    lastMove: "48;5;65",
    whitePiece: "38;5;255",
    blackPiece: "38;5;250",
    focusedPiece: "38;5;16",
    emptySquare: "38;5;102",
  },
} as const;

export function styleText(text: string, ...codes: readonly string[]): string {
  if (codes.length === 0) {
    return text;
  }
  return `\u001b[${codes.join(";")}m${text}${ANSI_RESET}`;
}
