import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { writeSecureJson } from "../config.js";

const MARKER = "codechess-managed-v1";
const EVENTS = {
  beforeSubmitPrompt: "start",
  afterAgentThought: "heartbeat",
  stop: "stop",
} as const;

type HookEntry = Record<string, unknown>;
type HooksDocument = { version?: number; hooks?: Record<string, HookEntry[]> } & Record<string, unknown>;

export function hooksPath(home: string): string {
  return join(home, ".cursor", "hooks.json");
}

export async function installHooks(options: {
  home: string;
  nodePath: string;
  cliPath: string;
}): Promise<void> {
  await verifyExecutable(options.nodePath, "Node executable");
  await verifyFile(options.cliPath, "CodeChess executable");
  const path = hooksPath(options.home);
  const document = await readHooks(path);
  const hooks = (document.hooks ??= {});
  for (const [event, action] of Object.entries(EVENTS)) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = [
      ...current.filter((entry) => !isManaged(entry)),
      {
        type: "command",
        command: `${shellQuote(options.nodePath)} ${shellQuote(options.cliPath)} hook ${action} # ${MARKER}`,
        timeout: 2,
        failClosed: false,
      },
    ];
  }
  document.version ??= 1;
  await mkdir(dirname(path), { recursive: true });
  await writeSecureJson(document, path);
}

export async function uninstallHooks(home: string): Promise<void> {
  const path = hooksPath(home);
  const document = await readHooks(path);
  if (!document.hooks) return;
  for (const [event, entries] of Object.entries(document.hooks)) {
    document.hooks[event] = entries.filter((entry) => !isManaged(entry));
  }
  await writeSecureJson(document, path);
}

export async function areHooksInstalled(home: string): Promise<boolean> {
  const document = await readHooks(hooksPath(home));
  return Object.keys(EVENTS).every((event) =>
    document.hooks?.[event]?.some(isManaged),
  );
}

async function readHooks(path: string): Promise<HooksDocument> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(parsed)) throw new Error("Existing Codex hooks configuration is invalid.");
    if (parsed.hooks !== undefined && !isObject(parsed.hooks)) {
      throw new Error("Existing Codex hooks configuration has an invalid hooks field.");
    }
    if (isObject(parsed.hooks)) {
      for (const entries of Object.values(parsed.hooks)) {
        if (!Array.isArray(entries) || !entries.every(isObject)) {
          throw new Error("Existing Codex hooks configuration has an invalid hook event.");
        }
      }
    }
    return parsed as HooksDocument;
  } catch (error: unknown) {
    if (isObject(error) && error.code === "ENOENT") return { version: 1, hooks: {} };
    throw error;
  }
}

async function verifyExecutable(path: string, label: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error(`${label} path must be absolute.`);
  await access(path, constants.X_OK);
}

async function verifyFile(path: string, label: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error(`${label} path must be absolute.`);
  await access(path, constants.R_OK);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function isManaged(entry: HookEntry): boolean {
  return typeof entry.command === "string" && entry.command.includes(`# ${MARKER}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
