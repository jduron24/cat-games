import terminalKit from "terminal-kit";

import { ANSI_RESET } from "./theme.js";
import type {
  TerminalAdapter,
  TerminalEventHandlers,
  TerminalMouseData,
} from "./terminal-ui.js";
import type { RenderedTerminalView } from "./renderer.js";

const { terminal } = terminalKit;

export class TerminalKitAdapter implements TerminalAdapter {
  private handlers: TerminalEventHandlers | null = null;

  get width(): number {
    return terminal.width;
  }

  get height(): number {
    return terminal.height;
  }

  enterFullscreen(): void {
    terminal.fullscreen(true);
  }

  exitFullscreen(): void {
    process.stdout.write(ANSI_RESET);
    terminal.fullscreen(false);
  }

  hideCursor(): void {
    terminal.hideCursor();
  }

  showCursor(): void {
    terminal.hideCursor(false);
  }

  enableInput(): void {
    terminal.grabInput({ mouse: "button" });
  }

  disableInput(): void {
    terminal.grabInput(false);
  }

  setEventHandlers(handlers: TerminalEventHandlers): void {
    this.clearEventHandlers();
    this.handlers = handlers;
    terminal.on("key", this.keyListener);
    terminal.on("mouse", this.mouseListener);
    terminal.on("resize", this.resizeListener);
  }

  clearEventHandlers(): void {
    if (!this.handlers) {
      return;
    }
    terminal.removeListener("key", this.keyListener);
    terminal.removeListener("mouse", this.mouseListener);
    terminal.removeListener("resize", this.resizeListener);
    this.handlers = null;
  }

  draw(view: RenderedTerminalView): void {
    let output = "\u001b[2J\u001b[H";

    if (view.layout) {
      view.lines.forEach((line, index) => {
        output += `\u001b[${view.layout!.frameTop + index};${view.layout!.frameLeft}H${line}`;
      });
    } else {
      view.lines.forEach((line, index) => {
        output += `\u001b[${2 + index};3H${line}`;
      });
    }

    process.stdout.write(`${output}${ANSI_RESET}`);
  }

  private readonly keyListener = (name: unknown): void => {
    if (typeof name === "string") {
      this.handlers?.key(name);
    }
  };

  private readonly mouseListener = (name: unknown, data: unknown): void => {
    if (typeof name !== "string" || !isMouseData(data)) {
      return;
    }
    this.handlers?.mouse(name, data);
  };

  private readonly resizeListener = (width: unknown, height: unknown): void => {
    if (typeof width === "number" && typeof height === "number") {
      this.handlers?.resize(width, height);
    }
  };
}

function isMouseData(value: unknown): value is TerminalMouseData {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}
