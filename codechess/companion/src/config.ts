import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CompanionConfig = {
  serverUrl: string;
  roomCode?: string;
  playerId?: string;
  playerToken?: string;
  displayName?: string;
};

export function configPath(home = homedir()): string {
  return join(home, ".codechess", "config.json");
}

export async function readConfig(path = configPath()): Promise<CompanionConfig | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(value) || typeof value.serverUrl !== "string") {
      throw new Error("CodeChess configuration is invalid.");
    }
    return {
      serverUrl: value.serverUrl,
      ...optionalString(value, "roomCode"),
      ...optionalString(value, "playerId"),
      ...optionalString(value, "playerToken"),
      ...optionalString(value, "displayName"),
    };
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function writeConfig(config: CompanionConfig, path = configPath()): Promise<void> {
  await writeSecureJson(config, path);
}

export async function writeSecureJson(value: unknown, path: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.config-${process.pid}-${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    // A failed atomic write leaves the previous configuration intact.
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function optionalString<K extends "roomCode" | "playerId" | "playerToken" | "displayName">(
  value: Record<string, unknown>,
  key: K,
): Partial<Pick<CompanionConfig, K>> {
  return typeof value[key] === "string" ? ({ [key]: value[key] } as Pick<CompanionConfig, K>) : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === "ENOENT";
}
