#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../client/src/theme.ts
function styleText(text, ...codes) {
  if (codes.length === 0) {
    return text;
  }
  return `\x1B[${codes.join(";")}m${text}${ANSI_RESET}`;
}
var ANSI_RESET, THEME;
var init_theme = __esm({
  "../client/src/theme.ts"() {
    "use strict";
    ANSI_RESET = "\x1B[0m";
    THEME = {
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
        emptySquare: "38;5;102"
      }
    };
  }
});

// ../client/src/terminal-kit-adapter.ts
import terminalKit from "terminal-kit";
function isMouseData(value) {
  return typeof value === "object" && value !== null && "x" in value && "y" in value && typeof value.x === "number" && typeof value.y === "number";
}
var terminal, TerminalKitAdapter;
var init_terminal_kit_adapter = __esm({
  "../client/src/terminal-kit-adapter.ts"() {
    "use strict";
    init_theme();
    ({ terminal } = terminalKit);
    TerminalKitAdapter = class {
      handlers = null;
      get width() {
        return terminal.width;
      }
      get height() {
        return terminal.height;
      }
      enterFullscreen() {
        terminal.fullscreen(true);
      }
      exitFullscreen() {
        process.stdout.write(ANSI_RESET);
        terminal.fullscreen(false);
      }
      hideCursor() {
        terminal.hideCursor();
      }
      showCursor() {
        terminal.hideCursor(false);
      }
      enableInput() {
        terminal.grabInput({ mouse: "button" });
      }
      disableInput() {
        terminal.grabInput(false);
      }
      setEventHandlers(handlers) {
        this.clearEventHandlers();
        this.handlers = handlers;
        terminal.on("key", this.keyListener);
        terminal.on("mouse", this.mouseListener);
        terminal.on("resize", this.resizeListener);
      }
      clearEventHandlers() {
        if (!this.handlers) {
          return;
        }
        terminal.removeListener("key", this.keyListener);
        terminal.removeListener("mouse", this.mouseListener);
        terminal.removeListener("resize", this.resizeListener);
        this.handlers = null;
      }
      draw(view) {
        let output = "\x1B[2J\x1B[H";
        if (view.layout) {
          view.lines.forEach((line, index) => {
            output += `\x1B[${view.layout.frameTop + index};${view.layout.frameLeft}H${line}`;
          });
        } else {
          view.lines.forEach((line, index) => {
            output += `\x1B[${2 + index};3H${line}`;
          });
        }
        process.stdout.write(`${output}${ANSI_RESET}`);
      }
      keyListener = (name) => {
        if (typeof name === "string") {
          this.handlers?.key(name);
        }
      };
      mouseListener = (name, data) => {
        if (typeof name !== "string" || !isMouseData(data)) {
          return;
        }
        this.handlers?.mouse(name, data);
      };
      resizeListener = (width, height) => {
        if (typeof width === "number" && typeof height === "number") {
          this.handlers?.resize(width, height);
        }
      };
    };
  }
});

// ../client/src/coordinates.ts
function assertBoardIndex(row, column) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
    throw new RangeError(`Board index must be between 0 and ${BOARD_SIZE - 1}.`);
  }
}
function boardIndexToSquare(row, column, orientation) {
  assertBoardIndex(row, column);
  const fileIndex = orientation === "white" ? column : BOARD_SIZE - 1 - column;
  const rank = orientation === "white" ? BOARD_SIZE - row : row + 1;
  return `${FILES[fileIndex]}${rank}`;
}
function squareToBoardIndex(square, orientation) {
  const fileIndex = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (fileIndex < 0 || (rank < 1 || rank > BOARD_SIZE)) {
    throw new RangeError(`Invalid chess square: ${square}`);
  }
  return orientation === "white" ? { row: BOARD_SIZE - rank, column: fileIndex } : { row: rank - 1, column: BOARD_SIZE - 1 - fileIndex };
}
function screenCoordinatesToSquare(x, y, layout, orientation) {
  const relativeX = x - layout.boardLeft;
  const relativeY = y - layout.boardTop;
  const boardWidth = BOARD_SIZE * BOARD_CELL_WIDTH;
  const boardHeight = BOARD_SIZE * BOARD_CELL_HEIGHT;
  if (relativeX < 0 || relativeY < 0 || relativeX >= boardWidth || relativeY >= boardHeight) {
    return null;
  }
  const column = Math.floor(relativeX / BOARD_CELL_WIDTH);
  const row = Math.floor(relativeY / BOARD_CELL_HEIGHT);
  return boardIndexToSquare(row, column, orientation);
}
function calculateTerminalLayout(width, height) {
  const frameLeft = Math.max(1, Math.floor((width - FRAME_WIDTH) / 2) + 1);
  const frameTop = Math.max(1, Math.floor((height - FRAME_HEIGHT) / 2) + 1);
  const boardWidth = BOARD_SIZE * BOARD_CELL_WIDTH;
  return {
    frameLeft,
    frameTop,
    boardLeft: frameLeft + Math.floor((FRAME_WIDTH - boardWidth) / 2),
    boardTop: frameTop + 7
  };
}
function moveBoardCursor(index, deltaRow, deltaColumn) {
  return {
    row: Math.max(0, Math.min(BOARD_SIZE - 1, index.row + deltaRow)),
    column: Math.max(0, Math.min(BOARD_SIZE - 1, index.column + deltaColumn))
  };
}
var BOARD_SIZE, BOARD_CELL_WIDTH, BOARD_CELL_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, MIN_TERMINAL_WIDTH, MIN_TERMINAL_HEIGHT, FILES;
var init_coordinates = __esm({
  "../client/src/coordinates.ts"() {
    "use strict";
    BOARD_SIZE = 8;
    BOARD_CELL_WIDTH = 5;
    BOARD_CELL_HEIGHT = 1;
    FRAME_WIDTH = 68;
    FRAME_HEIGHT = 24;
    MIN_TERMINAL_WIDTH = 70;
    MIN_TERMINAL_HEIGHT = 24;
    FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  }
});

// ../client/src/fen.ts
function parseFenBoard(fen) {
  const piecePlacement = fen.trim().split(/\s+/)[0];
  const ranks = piecePlacement?.split("/") ?? [];
  if (ranks.length !== 8) {
    throw new Error("FEN piece placement must contain eight ranks.");
  }
  const board = {};
  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    for (const symbol of rankText) {
      if (/^\d$/.test(symbol) && !/^[1-8]$/.test(symbol)) {
        throw new Error(`Invalid FEN rank ${8 - rankIndex}: ${symbol} is not a valid gap.`);
      }
      if (/^[1-8]$/.test(symbol)) {
        fileIndex += Number(symbol);
        continue;
      }
      const type = PIECE_TYPES[symbol.toLowerCase()];
      if (!type) {
        throw new Error(`Invalid FEN piece symbol: ${symbol}`);
      }
      if (fileIndex >= 8) {
        throw new Error(`FEN rank ${8 - rankIndex} is wider than eight files.`);
      }
      const square = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`;
      board[square] = {
        color: symbol === symbol.toUpperCase() ? "white" : "black",
        type
      };
      fileIndex += 1;
    }
    if (fileIndex !== 8) {
      throw new Error(`FEN rank ${8 - rankIndex} must contain eight files.`);
    }
  });
  return board;
}
var PIECE_TYPES;
var init_fen = __esm({
  "../client/src/fen.ts"() {
    "use strict";
    PIECE_TYPES = {
      p: "pawn",
      n: "knight",
      b: "bishop",
      r: "rook",
      q: "queen",
      k: "king"
    };
  }
});

// ../client/src/renderer.ts
function renderTerminalView(options) {
  if (options.width < MIN_TERMINAL_WIDTH || options.height < MIN_TERMINAL_HEIGHT) {
    return {
      lines: [
        "Terminal too small for CodeChess.",
        `Resize to at least ${MIN_TERMINAL_WIDTH}x${MIN_TERMINAL_HEIGHT}.`,
        "Press q to quit."
      ],
      layout: null
    };
  }
  const layout = calculateTerminalLayout(options.width, options.height);
  const orientation = options.gameState?.playerColor ?? "white";
  const board = safelyParseBoard(options.gameState?.fen);
  const lines = [];
  lines.push(styleText(`\u256D${"\u2500".repeat(INNER_WIDTH)}\u256E`, ...THEME.frame));
  lines.push(framed(centerStyled("CODECHESS", THEME.title)));
  lines.push(
    framed(
      centerStyled(
        options.gameState ? `YOU \xB7 ${orientation.toUpperCase()}    ${options.mockMode ? "\u25CF MOCK SESSION" : "\u25CF CONNECTED"}` : "\u25CF WAITING FOR GAME STATE",
        options.gameState ? THEME.primaryText : THEME.warningText
      )
    )
  );
  lines.push(styleText(`\u251C${"\u2500".repeat(INNER_WIDTH)}\u2524`, ...THEME.frame));
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
        lastMove: options.gameState?.lastMove
      })
    );
  }
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(framed(centerStyled(turnMessage(options.gameState), turnStyle(options.gameState))));
  lines.push(
    framed(centerStyled(opponentMessage(options.gameState), THEME.mutedText))
  );
  lines.push(
    framed(
      centerStyled(
        options.notice ?? "Select a piece, then choose its destination.",
        options.notice ? THEME.warningText : THEME.mutedText
      )
    )
  );
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(
    framed(centerStyled("ARROWS move  \xB7  ENTER select  \xB7  ESC cancel  \xB7  q quit", THEME.primaryText))
  );
  lines.push(
    framed(
      centerStyled(
        options.mockMode ? "MOCK  p pause  \xB7  o opponent move  \xB7  r reset  \xB7  f agent finished" : "",
        THEME.mutedText
      )
    )
  );
  lines.push(framed(" ".repeat(INNER_WIDTH)));
  lines.push(styleText(`\u2570${"\u2500".repeat(INNER_WIDTH)}\u256F`, ...THEME.frame));
  if (lines.length !== FRAME_HEIGHT) {
    throw new Error(`Renderer produced ${lines.length} lines; expected ${FRAME_HEIGHT}.`);
  }
  return { lines, layout };
}
function safelyParseBoard(fen) {
  if (!fen) {
    return {};
  }
  try {
    return parseFenBoard(fen);
  } catch {
    return {};
  }
}
function renderFileLabels(orientation) {
  const labels = Array.from(
    { length: 8 },
    (_, column) => boardIndexToSquare(0, column, orientation).charAt(0)
  );
  const content = labels.map((file) => center(file, BOARD_CELL_WIDTH)).join("");
  return `${" ".repeat(BOARD_SIDE_GAP)}${styleText(content, ...THEME.mutedText)}${" ".repeat(
    BOARD_SIDE_GAP
  )}`;
}
function renderBoardRow(options) {
  const rank = boardIndexToSquare(options.row, 0, options.orientation).charAt(1);
  const gap = center(rank, BOARD_SIDE_GAP);
  const cells = Array.from({ length: 8 }, (_, column) => {
    const square = boardIndexToSquare(options.row, column, options.orientation);
    return renderCell(
      options.board[square],
      (options.row + column) % 2 === 0,
      square === options.cursorSquare,
      square === options.selectedSquare,
      square === options.lastMove?.from || square === options.lastMove?.to
    );
  }).join("");
  return `${styleText("\u2502", ...THEME.frame)}${styleText(gap, ...THEME.mutedText)}${cells}${" ".repeat(
    BOARD_SIDE_GAP
  )}${styleText("\u2502", ...THEME.frame)}`;
}
function renderCell(piece, lightSquare, cursor, selected, lastMove) {
  const glyph = piece ? PIECES[piece.color][piece.type] : "\xB7";
  let content = `  ${glyph}  `;
  let background = lightSquare ? THEME.board.light : THEME.board.dark;
  if (cursor && selected) {
    content = `{ ${glyph} }`;
    background = THEME.board.cursorSelected;
  } else if (selected) {
    content = `[ ${glyph} ]`;
    background = THEME.board.selected;
  } else if (cursor) {
    content = `\u258F ${glyph} \u2595`;
    background = THEME.board.cursor;
  } else if (lastMove) {
    content = `\xB7 ${glyph} \xB7`;
    background = THEME.board.lastMove;
  }
  const foreground = cursor || selected ? THEME.board.focusedPiece : piece?.color === "white" ? THEME.board.whitePiece : piece?.color === "black" ? THEME.board.blackPiece : THEME.board.emptySquare;
  return styleText(content, "1", foreground, background);
}
function turnMessage(state) {
  if (!state) {
    return "WAITING FOR A MATCH";
  }
  if (state.status === "paused") {
    return "GAME PAUSED";
  }
  if (state.status === "completed") {
    return "GAME COMPLETED";
  }
  if (state.status === "reconnecting") {
    return "RECONNECTING \u2014 MOVES DISABLED";
  }
  return state.turn === state.playerColor ? "YOUR TURN \u2014 choose a piece" : "OPPONENT'S TURN \u2014 waiting";
}
function turnStyle(state) {
  if (!state || state.status === "paused" || state.status === "reconnecting") {
    return THEME.warningText;
  }
  if (state.status === "completed") {
    return THEME.mutedText;
  }
  return state.turn === state.playerColor ? THEME.successText : THEME.primaryText;
}
function opponentMessage(state) {
  switch (state?.opponentStatus) {
    case "agent_finished":
      return "OPPONENT AGENT FINISHED";
    case "waiting":
      return "OPPONENT \xB7 WAITING";
    case "playing":
      return "OPPONENT \xB7 PLAYING";
    default:
      return "SERVER \xB7 WAITING";
  }
}
function framed(content) {
  return `${styleText("\u2502", ...THEME.frame)}${content}${styleText("\u2502", ...THEME.frame)}`;
}
function centerStyled(text, codes) {
  const left = Math.floor((INNER_WIDTH - text.length) / 2);
  const right = INNER_WIDTH - text.length - left;
  return `${" ".repeat(Math.max(0, left))}${styleText(text.slice(0, INNER_WIDTH), ...codes)}${" ".repeat(
    Math.max(0, right)
  )}`;
}
function center(text, width) {
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
}
var PIECES, INNER_WIDTH, BOARD_SIDE_GAP;
var init_renderer = __esm({
  "../client/src/renderer.ts"() {
    "use strict";
    init_coordinates();
    init_fen();
    init_theme();
    PIECES = {
      white: {
        king: "\u2654",
        queen: "\u2655",
        rook: "\u2656",
        bishop: "\u2657",
        knight: "\u2658",
        pawn: "\u2659"
      },
      black: {
        king: "\u265A",
        queen: "\u265B",
        rook: "\u265C",
        bishop: "\u265D",
        knight: "\u265E",
        pawn: "\u265F"
      }
    };
    INNER_WIDTH = FRAME_WIDTH - 2;
    BOARD_SIDE_GAP = (FRAME_WIDTH - 8 * BOARD_CELL_WIDTH) / 2 - 1;
  }
});

// ../client/src/selection.ts
function activateSquare(state, square) {
  if (state.selectedSquare === null) {
    return {
      state: { selectedSquare: square },
      move: null
    };
  }
  if (state.selectedSquare === square) {
    return {
      state,
      move: null
    };
  }
  return {
    state: { selectedSquare: null },
    move: {
      from: state.selectedSquare,
      to: square
    }
  };
}
function cancelSelection(_state) {
  return { selectedSquare: null };
}
var init_selection = __esm({
  "../client/src/selection.ts"() {
    "use strict";
  }
});

// ../client/src/terminal-ui.ts
var TerminalChessUI;
var init_terminal_ui = __esm({
  "../client/src/terminal-ui.ts"() {
    "use strict";
    init_coordinates();
    init_fen();
    init_renderer();
    init_selection();
    TerminalChessUI = class {
      transport;
      terminal;
      mockControls;
      handlers;
      gameState = null;
      cursor = { row: 6, column: 4 };
      selection = { selectedSquare: null };
      notice = null;
      currentView = null;
      viewportWidth;
      viewportHeight;
      started = false;
      stopped = false;
      resolveRun = null;
      constructor(options) {
        this.transport = options.transport;
        this.terminal = options.terminal;
        this.mockControls = options.mockControls;
        this.viewportWidth = options.terminal.width;
        this.viewportHeight = options.terminal.height;
        this.handlers = {
          key: (name) => this.handleKey(name),
          mouse: (name, data) => this.handleMouse(name, data),
          resize: (width, height) => this.handleResize(width, height)
        };
        this.transport.onGameState((state) => this.handleGameState(state));
        this.transport.onNotice((notice) => {
          this.notice = notice.message;
          this.redraw();
        });
      }
      run() {
        if (this.started) {
          throw new Error("Terminal UI is already running.");
        }
        this.started = true;
        this.stopped = false;
        const running = new Promise((resolve) => {
          this.resolveRun = resolve;
        });
        try {
          this.terminal.enterFullscreen();
          this.terminal.hideCursor();
          this.terminal.setEventHandlers(this.handlers);
          this.terminal.enableInput();
          this.redraw();
        } catch (error) {
          this.stop();
          throw error;
        }
        return running;
      }
      stop() {
        if (!this.started || this.stopped) {
          return;
        }
        this.stopped = true;
        const cleanupSteps = [
          () => this.terminal.clearEventHandlers(),
          () => this.terminal.disableInput(),
          () => this.terminal.showCursor(),
          () => this.terminal.exitFullscreen()
        ];
        for (const cleanupStep of cleanupSteps) {
          try {
            cleanupStep();
          } catch {
          }
        }
        this.resolveRun?.();
        this.resolveRun = null;
      }
      handleGameState(state) {
        const orientationChanged = this.gameState?.playerColor !== state.playerColor;
        this.gameState = { ...state };
        if (orientationChanged) {
          const homeSquare = state.playerColor === "white" ? "e2" : "e7";
          this.cursor = squareToBoardIndex(homeSquare, state.playerColor);
        }
        if (state.status !== "active") {
          this.selection = cancelSelection(this.selection);
        }
        this.redraw();
      }
      handleKey(name) {
        switch (name) {
          case "q":
          case "Q":
          case "CTRL_C":
            this.stop();
            return;
          case "UP":
            this.cursor = moveBoardCursor(this.cursor, -1, 0);
            break;
          case "DOWN":
            this.cursor = moveBoardCursor(this.cursor, 1, 0);
            break;
          case "LEFT":
            this.cursor = moveBoardCursor(this.cursor, 0, -1);
            break;
          case "RIGHT":
            this.cursor = moveBoardCursor(this.cursor, 0, 1);
            break;
          case "ENTER":
          case "KP_ENTER":
            this.activateCurrentSquare();
            return;
          case "ESCAPE":
            this.selection = cancelSelection(this.selection);
            this.notice = "Selection canceled.";
            break;
          case "p":
            if (this.mockControls) {
              this.mockControls.togglePaused();
              return;
            }
            break;
          case "o":
            if (this.mockControls) {
              this.mockControls.simulateOpponentMove();
              return;
            }
            break;
          case "r":
            if (this.mockControls) {
              this.selection = cancelSelection(this.selection);
              this.mockControls.reset();
              return;
            }
            break;
          case "f":
            if (this.mockControls) {
              this.mockControls.simulateOpponentAgentFinished();
              return;
            }
            break;
          default:
            return;
        }
        this.redraw();
      }
      handleMouse(name, data) {
        if (name !== "MOUSE_LEFT_BUTTON_PRESSED" || !this.gameState || !this.currentView?.layout) {
          return;
        }
        const square = screenCoordinatesToSquare(
          data.x,
          data.y,
          this.currentView.layout,
          this.gameState.playerColor
        );
        if (!square) {
          return;
        }
        this.cursor = squareToBoardIndex(square, this.gameState.playerColor);
        this.activateCurrentSquare();
      }
      handleResize(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.redraw();
      }
      activateCurrentSquare() {
        if (!this.gameState) {
          this.notice = "Waiting for a game state.";
          this.redraw();
          return;
        }
        if (this.gameState.status !== "active") {
          this.notice = this.gameState.status === "paused" ? "Game is paused." : this.gameState.status === "reconnecting" ? "Reconnecting. Moves are disabled." : "Game is completed.";
          this.redraw();
          return;
        }
        if (this.gameState.turn !== this.gameState.playerColor) {
          this.notice = "Wait for your turn.";
          this.redraw();
          return;
        }
        const square = this.cursorSquare();
        if (this.selection.selectedSquare === null) {
          const board = parseFenBoard(this.gameState.fen);
          const piece = board[square];
          if (!piece || piece.color !== this.gameState.playerColor) {
            this.notice = "Choose one of your pieces.";
            this.redraw();
            return;
          }
        }
        const result = activateSquare(this.selection, square);
        this.selection = result.state;
        this.notice = result.move ? `${result.move.from} \u2192 ${result.move.to}` : `${square} selected`;
        if (result.move) {
          this.transport.sendMove(result.move.from, result.move.to);
        }
        this.redraw();
      }
      cursorSquare() {
        if (!this.gameState) {
          return "e2";
        }
        return boardIndexToSquare(this.cursor.row, this.cursor.column, this.gameState.playerColor);
      }
      redraw() {
        if (!this.started || this.stopped) {
          return;
        }
        this.currentView = renderTerminalView({
          width: this.viewportWidth,
          height: this.viewportHeight,
          gameState: this.gameState,
          cursorSquare: this.gameState ? this.cursorSquare() : null,
          selectedSquare: this.selection.selectedSquare,
          notice: this.notice,
          mockMode: Boolean(this.mockControls)
        });
        this.terminal.draw(this.currentView);
      }
    };
  }
});

// ../shared/src/protocol.ts
function parseServerMessage(value) {
  if (!isObject(value) || typeof value.type !== "string") {
    return null;
  }
  switch (value.type) {
    case "hello_ack":
      return typeof value.userId === "string" && Boolean(value.userId.trim()) && isPeerRole(value.role) ? { type: "hello_ack", userId: value.userId.trim(), role: value.role } : null;
    case "room_hello_ack":
      return isRoomCode(value.roomCode) && isBoundedString(value.playerId, 1, 128) ? {
        type: "room_hello_ack",
        roomCode: value.roomCode,
        playerId: value.playerId
      } : null;
    case "error":
    case "move_rejected":
      return typeof value.reason === "string" ? { type: value.type, reason: value.reason } : null;
    case "waiting_for_player":
    case "game_paused":
    case "opponent_agent_finished":
      return { type: value.type };
    case "match_found":
      return typeof value.gameId === "string" && Boolean(value.gameId) && isPlayerColor(value.color) && isFen(value.fen) ? {
        type: "match_found",
        gameId: value.gameId,
        color: value.color,
        fen: value.fen
      } : null;
    case "game_state":
    case "move_accepted":
      return isFen(value.fen) && isPlayerColor(value.turn) ? { type: value.type, fen: value.fen, turn: value.turn } : null;
    case "game_completed":
      return isFen(value.fen) && typeof value.pgn === "string" ? { type: "game_completed", fen: value.fen, pgn: value.pgn } : null;
    case "game_resumed":
      return isFen(value.fen) && typeof value.pgn === "string" ? { type: "game_resumed", fen: value.fen, pgn: value.pgn } : null;
    default:
      return null;
  }
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPeerRole(value) {
  return value === "ui" || value === "agent";
}
function isPlayerColor(value) {
  return value === "white" || value === "black";
}
function isFen(value) {
  if (typeof value !== "string") {
    return false;
  }
  const fields = value.trim().split(/\s+/);
  const ranks = fields[0]?.split("/");
  return fields.length === 6 && ranks?.length === 8 && (fields[1] === "w" || fields[1] === "b");
}
function isRoomCode(value) {
  return typeof value === "string" && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}
function isBoundedString(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}
var init_protocol = __esm({
  "../shared/src/protocol.ts"() {
    "use strict";
  }
});

// ../client/src/transport/websocket-game-transport.ts
import WebSocket from "ws";
function turnFromFen(fen) {
  return fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
}
function isFen2(value) {
  if (typeof value !== "string") return false;
  const turn = value.trim().split(/\s+/)[1];
  if (turn !== "w" && turn !== "b") return false;
  try {
    parseFenBoard(value);
    return true;
  } catch {
    return false;
  }
}
var DEFAULT_RECONNECT_SCHEDULER, WebSocketGameTransport;
var init_websocket_game_transport = __esm({
  "../client/src/transport/websocket-game-transport.ts"() {
    "use strict";
    init_protocol();
    init_fen();
    DEFAULT_RECONNECT_SCHEDULER = {
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancel: (handle) => clearTimeout(handle)
    };
    WebSocketGameTransport = class {
      url;
      userId;
      playerToken;
      socketFactory;
      handshakeTimeoutMs;
      reconnectScheduler;
      reconnectJitter;
      stateHandlers = /* @__PURE__ */ new Set();
      noticeHandlers = /* @__PURE__ */ new Set();
      socket = null;
      connection = null;
      currentState = null;
      roomIdentity = null;
      retryHandle = null;
      retryAttempt = 0;
      explicitlyDisconnected = false;
      cancelPendingConnection = null;
      constructor(options) {
        this.url = options.url;
        this.userId = "userId" in options && options.userId !== void 0 ? options.userId.trim() : null;
        this.playerToken = "playerToken" in options && options.playerToken !== void 0 ? options.playerToken : null;
        if (this.userId !== null && !this.userId) {
          throw new Error("WebSocket UI transport requires a non-empty user ID.");
        }
        if (this.playerToken !== null && !this.playerToken) {
          throw new Error("WebSocket UI transport requires a player token.");
        }
        this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
        this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5e3;
        this.reconnectScheduler = options.reconnectScheduler ?? DEFAULT_RECONNECT_SCHEDULER;
        this.reconnectJitter = options.reconnectJitter ?? ((baseDelayMs) => Math.floor(Math.random() * baseDelayMs * 0.2));
      }
      connect() {
        if (this.connection) return this.connection;
        this.explicitlyDisconnected = false;
        this.connection = this.openSocket(false);
        return this.connection;
      }
      sendMove(from, to) {
        if (this.currentState && this.currentState.status !== "active") {
          this.emitNotice("info", "Moves are disabled until the game is active.");
          return;
        }
        this.send({ type: "move", from, to });
      }
      onGameState(handler) {
        this.stateHandlers.add(handler);
      }
      onNotice(handler) {
        this.noticeHandlers.add(handler);
      }
      disconnect() {
        this.explicitlyDisconnected = true;
        if (this.retryHandle !== null) {
          this.reconnectScheduler.cancel(this.retryHandle);
          this.retryHandle = null;
        }
        const cancelPendingConnection = this.cancelPendingConnection;
        this.cancelPendingConnection = null;
        cancelPendingConnection?.();
        const socket = this.socket;
        this.socket = null;
        this.connection = null;
        if (!socket) return;
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "disconnect" }));
        socket.close();
      }
      openSocket(reconnecting) {
        const socket = this.socketFactory(this.url);
        this.socket = socket;
        return new Promise((resolve, reject) => {
          let acknowledged = false;
          let settled = false;
          let handshakeTimeout;
          const removeSocketListeners = () => {
            socket.off?.("open", handleOpen);
            socket.off?.("message", handleMessage);
            socket.off?.("error", handleError);
            socket.off?.("close", handleClose);
          };
          const finishHandshake = () => {
            clearTimeout(handshakeTimeout);
            if (this.cancelPendingConnection === cancelPendingConnection) {
              this.cancelPendingConnection = null;
            }
          };
          const rejectHandshake = (error, removeListeners = false) => {
            if (settled) return;
            settled = true;
            finishHandshake();
            if (removeListeners) removeSocketListeners();
            reject(error);
          };
          const cancelPendingConnection = () => {
            rejectHandshake(new Error("WebSocket connection disconnected before the handshake completed."), true);
          };
          const handleOpen = () => {
            socket.send(
              JSON.stringify(
                this.playerToken !== null ? { type: "room_hello", playerToken: this.playerToken } : { type: "hello", userId: this.userId, role: "ui" }
              )
            );
          };
          const handleMessage = (data) => {
            const message = this.handleMessage(data);
            if (!message || acknowledged) return;
            if (this.playerToken !== null && message.type === "room_hello_ack") {
              const identity = { roomCode: message.roomCode, playerId: message.playerId };
              if (this.roomIdentity && (identity.roomCode !== this.roomIdentity.roomCode || identity.playerId !== this.roomIdentity.playerId)) {
                rejectHandshake(new Error("Server acknowledgement identity did not match this room session."));
                socket.close();
                return;
              }
              this.roomIdentity = identity;
              acknowledged = true;
              settled = true;
              finishHandshake();
              this.retryAttempt = 0;
              this.emitNotice("info", `Connected to room ${identity.roomCode}.`);
              resolve();
              return;
            }
            if (this.userId !== null && message.type === "hello_ack" && message.userId === this.userId && message.role === "ui") {
              acknowledged = true;
              settled = true;
              finishHandshake();
              resolve();
              return;
            }
            if (message.type === "error") {
              rejectHandshake(new Error(this.redact(message.reason)));
              return;
            }
            if (message.type === "hello_ack" || message.type === "room_hello_ack") {
              rejectHandshake(new Error("Server acknowledgement identity did not match this UI."));
              socket.close();
            }
          };
          const handleError = (error) => {
            const detail = this.redact(error instanceof Error ? error.message : String(error));
            this.emitNotice("error", `WebSocket error: ${detail}`);
            if (!acknowledged) rejectHandshake(new Error(detail));
          };
          const handleClose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            this.connection = null;
            if (!acknowledged) {
              rejectHandshake(new Error("WebSocket closed before the handshake was acknowledged."));
              if (reconnecting) this.scheduleReconnect();
              return;
            }
            if (this.playerToken !== null && !this.explicitlyDisconnected) {
              this.markReconnecting();
              this.scheduleReconnect();
            } else if (!this.explicitlyDisconnected) {
              this.emitNotice("info", "Disconnected from the CodeChess server.");
            }
          };
          handshakeTimeout = setTimeout(() => {
            if (!acknowledged) {
              rejectHandshake(new Error("WebSocket UI handshake timed out."));
              socket.close();
            }
          }, this.handshakeTimeoutMs);
          this.cancelPendingConnection = cancelPendingConnection;
          socket.on("open", handleOpen);
          socket.on("message", handleMessage);
          socket.on("error", handleError);
          socket.on("close", handleClose);
        });
      }
      scheduleReconnect() {
        if (this.explicitlyDisconnected || this.retryHandle !== null) return;
        const attempt = this.retryAttempt;
        const baseDelayMs = Math.min(250 * 2 ** attempt, 5e3);
        const delayMs = Math.min(5e3, Math.max(0, baseDelayMs + this.reconnectJitter(baseDelayMs, attempt)));
        this.retryAttempt += 1;
        this.retryHandle = this.reconnectScheduler.schedule(() => {
          this.retryHandle = null;
          if (this.explicitlyDisconnected) return;
          this.connection = this.openSocket(true);
          void this.connection.catch(() => {
            if (!this.explicitlyDisconnected && this.retryHandle === null) this.scheduleReconnect();
          });
        }, delayMs);
      }
      markReconnecting() {
        if (this.currentState) this.updateState({ status: "reconnecting" });
        this.emitNotice("info", "Connection lost. Reconnecting\u2026");
      }
      send(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
          this.emitNotice("error", "Cannot send: the WebSocket is not connected.");
          return;
        }
        this.socket.send(JSON.stringify(message));
      }
      handleMessage(data) {
        let parsed;
        try {
          const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
          parsed = JSON.parse(text);
        } catch {
          this.emitNotice("error", "Server sent an unreadable message.");
          return null;
        }
        const message = parseServerMessage(parsed);
        if (!message || "fen" in message && !isFen2(message.fen)) {
          this.emitNotice("error", "Server sent an invalid protocol message.");
          return null;
        }
        switch (message.type) {
          case "hello_ack":
          case "room_hello_ack":
            break;
          case "error":
            this.emitNotice("error", `Server error: ${this.redact(message.reason)}`);
            break;
          case "waiting_for_player":
            this.emitNotice("info", "Waiting for your teammate and both coding agents\u2026");
            break;
          case "match_found":
            this.publishState({ fen: message.fen, playerColor: message.color, turn: turnFromFen(message.fen), status: "active", opponentStatus: "playing" });
            this.emitNotice("info", `Match found. You are ${message.color}.`);
            break;
          case "game_state":
          case "move_accepted":
            this.updateState({ fen: message.fen, turn: message.turn, status: "active" });
            break;
          case "game_completed":
            this.updateState({ fen: message.fen, turn: turnFromFen(message.fen), status: "completed" });
            this.emitNotice("info", "Game completed. Start a rematch when both agents are active again.");
            break;
          case "move_rejected":
            this.emitNotice("error", `Move rejected: ${this.redact(message.reason)}`);
            break;
          case "game_paused":
            this.updateState({ status: "paused", opponentStatus: "waiting" });
            this.emitNotice("info", "Game paused while waiting for both agents.");
            break;
          case "opponent_agent_finished":
            this.updateState({ status: "paused", opponentStatus: "agent_finished" });
            this.emitNotice("info", "Opponent's agent finished. Game paused.");
            break;
          case "game_resumed":
            this.updateState({ fen: message.fen, turn: turnFromFen(message.fen), status: "active", opponentStatus: "playing" });
            this.emitNotice("info", "Saved game restored and resumed.");
            break;
        }
        return message;
      }
      updateState(update) {
        if (!this.currentState) {
          this.emitNotice("error", "Received game state before a match was established.");
          return;
        }
        this.publishState({ ...this.currentState, ...update });
      }
      publishState(state) {
        this.currentState = { ...state };
        for (const handler of this.stateHandlers) handler({ ...state });
      }
      emitNotice(level, message) {
        for (const handler of this.noticeHandlers) handler({ level, message: this.redact(message) });
      }
      redact(message) {
        return this.playerToken ? message.split(this.playerToken).join("[redacted]") : message;
      }
    };
  }
});

// ../client/src/public-api.ts
async function runTerminalSession(options) {
  const transport = new WebSocketGameTransport({
    url: options.websocketUrl,
    playerToken: options.playerToken
  });
  const ui = new TerminalChessUI({ transport, terminal: new TerminalKitAdapter() });
  const stop = () => {
    ui.stop();
    transport.disconnect();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await transport.connect();
    await ui.run();
  } finally {
    ui.stop();
    transport.disconnect();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
var init_public_api = __esm({
  "../client/src/public-api.ts"() {
    "use strict";
    init_terminal_kit_adapter();
    init_terminal_ui();
    init_websocket_game_transport();
  }
});

// ../shared/src/http-contract.ts
function parseCreateRoomResponse(value) {
  if (!isObject2(value)) {
    return null;
  }
  const roomCode = normalizeRoomCode(value.roomCode);
  if (!roomCode || !isBoundedString2(value.playerId, 1, HTTP_CONTRACT_LIMITS.playerId) || !isBoundedString2(value.playerToken, 32, HTTP_CONTRACT_LIMITS.playerToken)) {
    return null;
  }
  return { roomCode, playerId: value.playerId, playerToken: value.playerToken };
}
function normalizeRoomCode(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}
function isObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isBoundedString2(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}
var HTTP_CONTRACT_LIMITS;
var init_http_contract = __esm({
  "../shared/src/http-contract.ts"() {
    "use strict";
    HTTP_CONTRACT_LIMITS = {
      activityId: 128,
      displayName: 40,
      playerId: 128,
      playerToken: 256
    };
  }
});

// src/api-client.ts
function toWebSocketUrl(serverUrl) {
  const url = new URL(serverUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw new Error("CodeChess server URL must use HTTP or HTTPS.");
  return url.toString().replace(/\/$/, "");
}
var CodeChessApiClient;
var init_api_client = __esm({
  "src/api-client.ts"() {
    "use strict";
    init_http_contract();
    CodeChessApiClient = class {
      constructor(serverUrl, fetchImpl = fetch, timeoutMs = 5e3) {
        this.serverUrl = serverUrl;
        this.fetchImpl = fetchImpl;
        this.timeoutMs = timeoutMs;
      }
      serverUrl;
      fetchImpl;
      timeoutMs;
      async host(displayName) {
        return this.roomRequest("/v1/rooms", { displayName });
      }
      async join(roomCode, displayName) {
        return this.roomRequest(`/v1/rooms/${encodeURIComponent(roomCode)}/join`, {
          roomCode,
          displayName
        });
      }
      async activity(playerToken, activityId, action) {
        const response = await this.request("/v1/activity", {
          method: "POST",
          headers: {
            authorization: `Bearer ${playerToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ activityId, action })
        });
        if (response.status !== 204) throw new Error(`CodeChess activity request failed (${response.status}).`);
      }
      async health() {
        const response = await this.request("/healthz", { method: "GET" });
        return response.ok;
      }
      async roomRequest(path, body) {
        const response = await this.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`CodeChess room request failed (${response.status}).`);
        const parsed = parseCreateRoomResponse(await response.json());
        if (!parsed) throw new Error("CodeChess server returned an invalid room response.");
        return parsed;
      }
      request(path, init) {
        const url = new URL(path, `${this.serverUrl}/`);
        return this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      }
    };
  }
});

// src/config.ts
import { randomBytes } from "crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
function configPath(home = homedir()) {
  return join(home, ".codechess", "config.json");
}
async function readConfig(path = configPath()) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!isObject3(value) || typeof value.serverUrl !== "string") {
      throw new Error("CodeChess configuration is invalid.");
    }
    return {
      serverUrl: value.serverUrl,
      ...optionalString(value, "roomCode"),
      ...optionalString(value, "playerId"),
      ...optionalString(value, "playerToken"),
      ...optionalString(value, "displayName")
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
async function writeConfig(config, path = configPath()) {
  await writeSecureJson(config, path);
}
async function writeSecureJson(value, path) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 448 });
  const temporary = join(directory, `.config-${process.pid}-${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf8",
      flag: "wx",
      mode: 384
    });
    await chmod(temporary, 384);
    await rename(temporary, path);
    await chmod(path, 384);
  } catch (error) {
    await unlink(temporary).catch(() => void 0);
    throw error;
  }
}
function optionalString(value, key) {
  return typeof value[key] === "string" ? { [key]: value[key] } : {};
}
function isObject3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNotFound(error) {
  return isObject3(error) && error.code === "ENOENT";
}
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
  }
});

// src/hooks/installer.ts
import { access, mkdir as mkdir2, readFile as readFile2 } from "fs/promises";
import { constants } from "fs";
import { dirname as dirname2, isAbsolute, join as join2 } from "path";
function hooksPath(home) {
  return join2(home, ".cursor", "hooks.json");
}
async function installHooks(options) {
  await verifyExecutable(options.nodePath, "Node executable");
  await verifyFile(options.cliPath, "CodeChess executable");
  const path = hooksPath(options.home);
  const document = await readHooks(path);
  const hooks = document.hooks ??= {};
  for (const [event, action] of Object.entries(EVENTS)) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = [
      ...current.filter((entry) => !isManaged(entry)),
      {
        type: "command",
        command: `${shellQuote(options.nodePath)} ${shellQuote(options.cliPath)} hook ${action} # ${MARKER}`,
        timeout: 2,
        failClosed: false
      }
    ];
  }
  document.version ??= 1;
  await mkdir2(dirname2(path), { recursive: true });
  await writeSecureJson(document, path);
}
async function uninstallHooks(home) {
  const path = hooksPath(home);
  const document = await readHooks(path);
  if (!document.hooks) return;
  for (const [event, entries] of Object.entries(document.hooks)) {
    document.hooks[event] = entries.filter((entry) => !isManaged(entry));
  }
  await writeSecureJson(document, path);
}
async function areHooksInstalled(home) {
  const document = await readHooks(hooksPath(home));
  return Object.keys(EVENTS).every(
    (event) => document.hooks?.[event]?.some(isManaged)
  );
}
async function readHooks(path) {
  try {
    const parsed = JSON.parse(await readFile2(path, "utf8"));
    if (!isObject4(parsed)) throw new Error("Existing Codex hooks configuration is invalid.");
    if (parsed.hooks !== void 0 && !isObject4(parsed.hooks)) {
      throw new Error("Existing Codex hooks configuration has an invalid hooks field.");
    }
    if (isObject4(parsed.hooks)) {
      for (const entries of Object.values(parsed.hooks)) {
        if (!Array.isArray(entries) || !entries.every(isObject4)) {
          throw new Error("Existing Codex hooks configuration has an invalid hook event.");
        }
      }
    }
    return parsed;
  } catch (error) {
    if (isObject4(error) && error.code === "ENOENT") return { version: 1, hooks: {} };
    throw error;
  }
}
async function verifyExecutable(path, label) {
  if (!isAbsolute(path)) throw new Error(`${label} path must be absolute.`);
  await access(path, constants.X_OK);
}
async function verifyFile(path, label) {
  if (!isAbsolute(path)) throw new Error(`${label} path must be absolute.`);
  await access(path, constants.R_OK);
}
function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
function isManaged(entry) {
  return typeof entry.command === "string" && entry.command.includes(`# ${MARKER}`);
}
function isObject4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var MARKER, EVENTS;
var init_installer = __esm({
  "src/hooks/installer.ts"() {
    "use strict";
    init_config();
    MARKER = "codechess-managed-v1";
    EVENTS = {
      beforeSubmitPrompt: "start",
      afterAgentThought: "heartbeat",
      stop: "stop"
    };
  }
});

// src/doctor.ts
import { stat } from "fs/promises";
import { homedir as homedir2 } from "os";
async function runDoctor(options = {}) {
  const home = options.home ?? homedir2();
  const path = configPath(home);
  const config = await readConfig(path);
  const checks = [];
  checks.push(["Node 22.13+", isSupportedNode(options.nodeVersion ?? process.versions.node)]);
  let secure = false;
  try {
    secure = ((await stat(path)).mode & 511) === 384;
  } catch {
  }
  checks.push(["config permissions (0600)", secure]);
  checks.push(["Codex hooks installed", await areHooksInstalled(home)]);
  checks.push(["active room credentials", Boolean(config?.roomCode && config.playerId && config.playerToken)]);
  checks.push(["interactive terminal", options.terminal ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)]);
  let healthy = false;
  if (config) {
    try {
      healthy = await (options.apiFactory?.(config.serverUrl) ?? new CodeChessApiClient(config.serverUrl)).health();
    } catch {
    }
  }
  checks.push(["server health", healthy]);
  return checks.map(([label, ok]) => `${ok ? "PASS" : "FAIL"} ${label}`).join("\n") + "\n";
}
function isSupportedNode(version) {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || major === 22 && minor >= 13;
}
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    init_api_client();
    init_config();
    init_installer();
  }
});

// src/hooks/activity.ts
import { createHash } from "crypto";
import { readFile as readFile3 } from "fs/promises";
import { dirname as dirname3, join as join3 } from "path";
async function handleHookActivity(action, input, dependencies = {}) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return "CodeChess hook ignored invalid input.";
  }
  if (!isObject5(payload)) return "CodeChess hook ignored invalid input.";
  try {
    const path = dependencies.configFile ?? configPath();
    const config = await readConfig(path);
    if (!config?.playerToken || !config.playerId) return "CodeChess hook is not configured for a room.";
    const activityId = deriveActivityId(payload, config.playerId);
    const now = (dependencies.now ?? Date.now)();
    if (action === "heartbeat") {
      const last = await readHeartbeat(path, activityId);
      if (last !== null && now - last < 3e4) return null;
    }
    const post = dependencies.postActivity ?? postActivity;
    await post(config.serverUrl, config.playerToken, activityId, action);
    if (action === "heartbeat") await writeHeartbeat(path, activityId, now);
    if (action === "stop") await removeHeartbeat(path, activityId);
    return null;
  } catch {
    return "CodeChess hook could not update activity; continuing normally.";
  }
}
function deriveActivityId(payload, playerId) {
  const candidates = [
    ["task", payload.task_id ?? payload.taskId],
    ["thread", payload.thread_id ?? payload.threadId],
    ["session", payload.session_id ?? payload.sessionId],
    ["conversation", payload.conversation_id ?? payload.conversationId]
  ];
  const candidate = candidates.find(([, value]) => typeof value === "string" && value.length > 0);
  const source = candidate ? `${candidate[0]}:${candidate[1]}` : `single-session:${playerId}`;
  return createHash("sha256").update(source).digest("hex");
}
async function postActivity(serverUrl, token, activityId, action) {
  await new CodeChessApiClient(serverUrl, fetch, 900).activity(token, activityId, action);
}
function heartbeatPath(configurationPath) {
  return join3(dirname3(configurationPath), "heartbeat.json");
}
async function readHeartbeat(configurationPath, activityId) {
  try {
    const value = JSON.parse(await readFile3(heartbeatPath(configurationPath), "utf8"));
    if (!isObject5(value) || typeof value[activityId] !== "number") return null;
    return value[activityId];
  } catch {
    return null;
  }
}
async function writeHeartbeat(configurationPath, activityId, now) {
  const path = heartbeatPath(configurationPath);
  let state = {};
  try {
    const value = JSON.parse(await readFile3(path, "utf8"));
    if (isObject5(value)) {
      state = Object.fromEntries(
        Object.entries(value).filter((entry) => typeof entry[1] === "number")
      );
    }
  } catch {
  }
  await writeSecureJson({ ...state, [activityId]: now }, path);
}
async function removeHeartbeat(configurationPath, activityId) {
  const path = heartbeatPath(configurationPath);
  try {
    const value = JSON.parse(await readFile3(path, "utf8"));
    if (!isObject5(value)) return;
    delete value[activityId];
    await writeSecureJson(value, path);
  } catch {
  }
}
function isObject5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var init_activity = __esm({
  "src/hooks/activity.ts"() {
    "use strict";
    init_api_client();
    init_config();
  }
});

// src/app.ts
var app_exports = {};
__export(app_exports, {
  executeCommand: () => executeCommand
});
import { fileURLToPath } from "url";
import { homedir as homedir3 } from "os";
async function executeCommand(command, dependencies = {}) {
  const home = dependencies.home ?? homedir3();
  const path = configPath(home);
  const runTerminal = dependencies.runTerminal ?? productionTerminalAdapter;
  const apiFactory = dependencies.apiFactory ?? ((url) => new CodeChessApiClient(url));
  switch (command.name) {
    case "help":
      return "";
    case "setup": {
      await writeConfig({ serverUrl: command.serverUrl }, path);
      await installHooks({
        home,
        nodePath: dependencies.nodePath ?? process.execPath,
        cliPath: dependencies.cliPath ?? fileURLToPath(new URL("./cli.js", import.meta.url))
      });
      return "CodeChess configured and Codex hooks installed.\n";
    }
    case "host": {
      const config = await requireConfig(path);
      const room = await apiFactory(config.serverUrl).host(command.displayName);
      const active = { ...config, ...room, displayName: command.displayName };
      await writeConfig(active, path);
      const terminal2 = runTerminal(toSession(active));
      (dependencies.writeOutput ?? ((value) => process.stdout.write(value)))(
        `Room ${room.roomCode} created. Share this code with your teammate.
`
      );
      await terminal2;
      return "";
    }
    case "join": {
      const config = await requireConfig(path);
      const room = await apiFactory(config.serverUrl).join(command.roomCode, command.displayName);
      const active = { ...config, ...room, displayName: command.displayName };
      await writeConfig(active, path);
      await runTerminal(toSession(active));
      return `Joined room ${room.roomCode}.
`;
    }
    case "play": {
      const config = await requireActiveConfig(path);
      await runTerminal(toSession(config));
      return "";
    }
    case "doctor":
      return runDoctor({ home, apiFactory });
    case "uninstall-hooks":
      await uninstallHooks(home);
      return "CodeChess hooks removed.\n";
    case "hook": {
      const input = await (dependencies.readStdin ?? readStandardInput)();
      const diagnostic = await handleHookActivity(command.action, input, { configFile: path });
      if (diagnostic) process.stderr.write(`${diagnostic}
`);
      return "{}\n";
    }
  }
}
async function requireConfig(path) {
  const config = await readConfig(path);
  if (!config) throw new Error("Run `codechess setup --server <url>` first.");
  return config;
}
async function requireActiveConfig(path) {
  const config = await requireConfig(path);
  if (!config.playerToken) throw new Error("Host or join a room before running play.");
  return config;
}
function toSession(config) {
  return { websocketUrl: toWebSocketUrl(config.serverUrl), playerToken: config.playerToken };
}
async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
async function productionTerminalAdapter(session) {
  await runTerminalSession(session);
}
var init_app = __esm({
  "src/app.ts"() {
    "use strict";
    init_public_api();
    init_api_client();
    init_config();
    init_doctor();
    init_activity();
    init_installer();
  }
});

// src/cli.ts
import { fileURLToPath as fileURLToPath2 } from "url";
import { realpathSync } from "fs";
function parseCli(args) {
  const [command, ...rest] = args;
  switch (command) {
    case void 0:
    case "help":
    case "--help":
    case "-h":
      return { name: "help" };
    case "setup":
      return { name: "setup", serverUrl: requirePublicServer(readOption(rest, "--server")) };
    case "host":
      return { name: "host", displayName: readOption(rest, "--name") };
    case "join": {
      const roomCode = rest[0];
      if (!roomCode || roomCode.startsWith("--")) {
        throw new Error("join requires a room code.");
      }
      return {
        name: "join",
        roomCode: roomCode.trim().toUpperCase(),
        displayName: readOption(rest.slice(1), "--name")
      };
    }
    case "play":
    case "doctor":
    case "uninstall-hooks":
      if (rest.length > 0) {
        throw new Error(`${command} does not accept arguments.`);
      }
      return { name: command };
    case "hook": {
      const action = rest[0];
      if (action !== "start" && action !== "heartbeat" && action !== "stop" || rest.length !== 1) {
        throw new Error("hook requires start, heartbeat, or stop.");
      }
      return { name: "hook", action };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
function readOption(args, option) {
  const index = args.indexOf(option);
  const value = index >= 0 ? args[index + 1] : void 0;
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value.trim();
}
function requirePublicServer(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("Public CodeChess servers must use HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}
var CLI_HELP = `CodeChess terminal companion

Usage:
  codechess setup --server https://play.codechess.dev
  codechess host --name Alice
  codechess join BLUE-CAT7 --name Bob
  codechess play
  codechess doctor
  codechess uninstall-hooks

Keep host, join, or play open while you work. Normal Codex prompts activate the board.
`;
async function main() {
  const command = parseCli(process.argv.slice(2));
  if (command.name === "help") {
    process.stdout.write(CLI_HELP);
    return;
  }
  const { executeCommand: executeCommand2 } = await Promise.resolve().then(() => (init_app(), app_exports));
  process.stdout.write(await executeCommand2(command));
}
if (process.argv[1] && realpathSync(fileURLToPath2(import.meta.url)) === realpathSync(process.argv[1])) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  });
}
export {
  CLI_HELP,
  parseCli
};
