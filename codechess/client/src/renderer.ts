import {
  BOARD_CELL_WIDTH,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MIN_TERMINAL_HEIGHT,
  MIN_TERMINAL_WIDTH,
  boardIndexToSquare,
  calculateTerminalLayout,
  type TerminalLayout,
} from "./coordinates.js";
import { parseFenBoard, type BoardPiece, type FenBoard, type PieceType } from "./fen.js";
import { THEME, styleText } from "./theme.js";
import type { GameState, PlayerColor, Square } from "./types.js";

export type RenderTerminalViewOptions = {
  width: number;
  height: number;
  gameState: GameState | null;
  cursorSquare: Square | null;
  selectedSquare: Square | null;
  notice: string | null;
  mockMode: boolean;
};

export type RenderedTerminalView = {
  lines: string[];
  layout: TerminalLayout | null;
};

const PIECES: Record<PlayerColor, Record<PieceType, string>> = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

const INNER_WIDTH = FRAME_WIDTH - 2;
const BOARD_SIDE_GAP = (FRAME_WIDTH - 8 * BOARD_CELL_WIDTH) / 2 - 1;

export function renderTerminalView(options: RenderTerminalViewOptions): RenderedTerminalView {
  if (options.width < MIN_TERMINAL_WIDTH || options.height < MIN_TERMINAL_HEIGHT) {
    return {
      lines: [
        "Terminal too small for CodeChess.",
        `Resize to at least ${MIN_TERMINAL_WIDTH}x${MIN_TERMINAL_HEIGHT}.`,
        "Press q to quit.",
      ],
      layout: null,
    };
  }

  const layout = calculateTerminalLayout(options.width, options.height);
  const orientation = options.gameState?.playerColor ?? "white";
  const board = safelyParseBoard(options.gameState?.fen);
  const lines: string[] = [];

  lines.push(styleText(`╭${"─".repeat(INNER_WIDTH)}╮`, ...THEME.frame));
  lines.push(framed(centerStyled("CODECHESS", THEME.title)));
  lines.push(
    framed(
      centerStyled(
        options.gameState
          ? `YOU · ${orientation.toUpperCase()}    ${options.mockMode ? "● MOCK SESSION" : "● CONNECTED"}`
          : "● WAITING FOR GAME STATE",
        options.gameState ? THEME.primaryText : THEME.warningText,
      ),
    ),
  );
  lines.push(styleText(`├${"─".repeat(INNER_WIDTH)}┤`, ...THEME.frame));
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(framed(renderFileLabels(orientation)));
  lines.push(framed(" ".repeat(INNER_WIDTH)));

  for (let row = 0; row < 8; row += 1) {
    lines.push(
      renderBoardRow({
        row,
        orientation,
        board,
        cursorSquare: options.cursorSquare,
        selectedSquare: options.selectedSquare,
        lastMove: options.gameState?.lastMove,
      }),
    );
  }

  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(framed(centerStyled(turnMessage(options.gameState), turnStyle(options.gameState))));
  lines.push(
    framed(centerStyled(opponentMessage(options.gameState), THEME.mutedText)),
  );
  lines.push(
    framed(
      centerStyled(
        options.notice ?? "Select a piece, then choose its destination.",
        options.notice ? THEME.warningText : THEME.mutedText,
      ),
    ),
  );
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(
    framed(centerStyled("ARROWS move  ·  ENTER select  ·  ESC cancel  ·  q quit", THEME.primaryText)),
  );
  lines.push(
    framed(
      centerStyled(
        options.mockMode ? "MOCK  p pause  ·  o opponent move  ·  r reset  ·  f agent finished" : "",
        THEME.mutedText,
      ),
    ),
  );
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(styleText(`╰${"─".repeat(INNER_WIDTH)}╯`, ...THEME.frame));

  if (lines.length !== FRAME_HEIGHT) {
    throw new Error(`Renderer produced ${lines.length} lines; expected ${FRAME_HEIGHT}.`);
  }

  return { lines, layout };
}

function safelyParseBoard(fen: string | undefined): FenBoard {
  if (!fen) {
    return {};
  }
  try {
    return parseFenBoard(fen);
  } catch {
    return {};
  }
}

function renderFileLabels(orientation: PlayerColor): string {
  const labels = Array.from({ length: 8 }, (_, column) =>
    boardIndexToSquare(0, column, orientation).charAt(0),
  );
  const content = labels.map((file) => center(file, BOARD_CELL_WIDTH)).join("");
  return `${" ".repeat(BOARD_SIDE_GAP)}${styleText(content, ...THEME.mutedText)}${" ".repeat(
    BOARD_SIDE_GAP,
  )}`;
}

type BoardRowOptions = {
  row: number;
  orientation: PlayerColor;
  board: FenBoard;
  cursorSquare: Square | null;
  selectedSquare: Square | null;
  lastMove: GameState["lastMove"] | undefined;
};

function renderBoardRow(options: BoardRowOptions): string {
  const rank = boardIndexToSquare(options.row, 0, options.orientation).charAt(1);
  const gap = center(rank, BOARD_SIDE_GAP);
  const cells = Array.from({ length: 8 }, (_, column) => {
    const square = boardIndexToSquare(options.row, column, options.orientation);
    return renderCell(
      options.board[square],
      (options.row + column) % 2 === 0,
      square === options.cursorSquare,
      square === options.selectedSquare,
      square === options.lastMove?.from || square === options.lastMove?.to,
    );
  }).join("");

  return `${styleText("│", ...THEME.frame)}${styleText(gap, ...THEME.mutedText)}${cells}${" ".repeat(
    BOARD_SIDE_GAP,
  )}${styleText("│", ...THEME.frame)}`;
}

function renderCell(
  piece: BoardPiece | undefined,
  lightSquare: boolean,
  cursor: boolean,
  selected: boolean,
  lastMove: boolean,
): string {
  const glyph = piece ? PIECES[piece.color][piece.type] : "·";
  let content = `  ${glyph}  `;
  let background: string = lightSquare ? THEME.board.light : THEME.board.dark;

  if (cursor && selected) {
    content = `{ ${glyph} }`;
    background = THEME.board.cursorSelected;
  } else if (selected) {
    content = `[ ${glyph} ]`;
    background = THEME.board.selected;
  } else if (cursor) {
    content = `▏ ${glyph} ▕`;
    background = THEME.board.cursor;
  } else if (lastMove) {
    content = `· ${glyph} ·`;
    background = THEME.board.lastMove;
  }

  const foreground =
    cursor || selected
      ? THEME.board.focusedPiece
      : piece?.color === "white"
        ? THEME.board.whitePiece
        : piece?.color === "black"
          ? THEME.board.blackPiece
          : THEME.board.emptySquare;

  return styleText(content, "1", foreground, background);
}

function turnMessage(state: GameState | null): string {
  if (!state) {
    return "WAITING FOR A MATCH";
  }
  if (state.status === "paused") {
    return "GAME PAUSED";
  }
  if (state.status === "completed") {
    return "GAME COMPLETED";
  }
  return state.turn === state.playerColor ? "YOUR TURN — choose a piece" : "OPPONENT'S TURN — waiting";
}

function turnStyle(state: GameState | null): readonly string[] {
  if (!state || state.status === "paused") {
    return THEME.warningText;
  }
  if (state.status === "completed") {
    return THEME.mutedText;
  }
  return state.turn === state.playerColor ? THEME.successText : THEME.primaryText;
}

function opponentMessage(state: GameState | null): string {
  switch (state?.opponentStatus) {
    case "agent_finished":
      return "OPPONENT AGENT FINISHED";
    case "waiting":
      return "OPPONENT · WAITING";
    case "playing":
      return "OPPONENT · PLAYING";
    default:
      return "SERVER · WAITING";
  }
}

function framed(content: string): string {
  return `${styleText("│", ...THEME.frame)}${content}${styleText("│", ...THEME.frame)}`;
}

function centerStyled(text: string, codes: readonly string[]): string {
  const left = Math.floor((INNER_WIDTH - text.length) / 2);
  const right = INNER_WIDTH - text.length - left;
  return `${" ".repeat(Math.max(0, left))}${styleText(text.slice(0, INNER_WIDTH), ...codes)}${" ".repeat(
    Math.max(0, right),
  )}`;
}

function center(text: string, width: number): string {
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
}
