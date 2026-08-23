import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CodeChessApiClient } from "../api-client.js";
import { configPath, readConfig, writeSecureJson } from "../config.js";

export type HookAction = "start" | "heartbeat" | "stop";

export type HookActivityDependencies = {
  configFile?: string;
  now?: () => number;
  postActivity?: (serverUrl: string, token: string, activityId: string, action: HookAction) => Promise<void>;
};

/**
 * Hooks prefer task, thread, or session IDs supplied by Codex. Older hook
 * payloads fall back to one stable activity per configured player/session.
 */
export async function handleHookActivity(
  action: HookAction,
  input: string,
  dependencies: HookActivityDependencies = {},
): Promise<string | null> {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    return "CodeChess hook ignored invalid input.";
  }
  if (!isObject(payload)) return "CodeChess hook ignored invalid input.";
  try {
    const path = dependencies.configFile ?? configPath();
    const config = await readConfig(path);
    if (!config?.playerToken || !config.playerId) return "CodeChess hook is not configured for a room.";
    const activityId = deriveActivityId(payload, config.playerId);
    const now = (dependencies.now ?? Date.now)();

    if (action === "heartbeat") {
      const last = await readHeartbeat(path, activityId);
      if (last !== null && now - last < 30_000) return null;
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

export function deriveActivityId(payload: Record<string, unknown>, playerId: string): string {
  const candidates = [
    ["task", payload.task_id ?? payload.taskId],
    ["thread", payload.thread_id ?? payload.threadId],
    ["session", payload.session_id ?? payload.sessionId],
    ["conversation", payload.conversation_id ?? payload.conversationId],
  ] as const;
  const candidate = candidates.find(([, value]) => typeof value === "string" && value.length > 0);
  const source = candidate ? `${candidate[0]}:${candidate[1] as string}` : `single-session:${playerId}`;
  return createHash("sha256").update(source).digest("hex");
}

async function postActivity(
  serverUrl: string,
  token: string,
  activityId: string,
  action: HookAction,
): Promise<void> {
  await new CodeChessApiClient(serverUrl, fetch, 900).activity(token, activityId, action);
}

function heartbeatPath(configurationPath: string): string {
  return join(dirname(configurationPath), "heartbeat.json");
}

async function readHeartbeat(configurationPath: string, activityId: string): Promise<number | null> {
  try {
    const value: unknown = JSON.parse(await readFile(heartbeatPath(configurationPath), "utf8"));
    if (!isObject(value) || typeof value[activityId] !== "number") return null;
    return value[activityId];
  } catch {
    return null;
  }
}

async function writeHeartbeat(configurationPath: string, activityId: string, now: number): Promise<void> {
  const path = heartbeatPath(configurationPath);
  let state: Record<string, number> = {};
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (isObject(value)) {
      state = Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
      );
    }
  } catch {
    // Missing or corrupt throttle state is safe: send the heartbeat.
  }
  await writeSecureJson({ ...state, [activityId]: now }, path);
}

async function removeHeartbeat(configurationPath: string, activityId: string): Promise<void> {
  const path = heartbeatPath(configurationPath);
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(value)) return;
    delete value[activityId];
    await writeSecureJson(value, path);
  } catch {
    // Throttle cleanup must never make a stop hook fail.
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
