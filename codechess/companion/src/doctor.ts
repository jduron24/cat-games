import { stat } from "node:fs/promises";
import { homedir } from "node:os";

import { CodeChessApiClient } from "./api-client.js";
import { configPath, readConfig } from "./config.js";
import { areHooksInstalled } from "./hooks/installer.js";

export type DoctorOptions = {
  home?: string;
  nodeVersion?: string;
  terminal?: boolean;
  apiFactory?: (url: string) => Pick<CodeChessApiClient, "health">;
};

export async function runDoctor(options: DoctorOptions = {}): Promise<string> {
  const home = options.home ?? homedir();
  const path = configPath(home);
  const config = await readConfig(path);
  const checks: Array<[string, boolean]> = [];
  checks.push(["Node 22.13+", isSupportedNode(options.nodeVersion ?? process.versions.node)]);
  let secure = false;
  try {
    secure = ((await stat(path)).mode & 0o777) === 0o600;
  } catch {}
  checks.push(["config permissions (0600)", secure]);
  checks.push(["Codex hooks installed", await areHooksInstalled(home)]);
  checks.push(["active room credentials", Boolean(config?.roomCode && config.playerId && config.playerToken)]);
  checks.push(["interactive terminal", options.terminal ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)]);
  let healthy = false;
  if (config) {
    try {
      healthy = await (options.apiFactory?.(config.serverUrl) ?? new CodeChessApiClient(config.serverUrl)).health();
    } catch {}
  }
  checks.push(["server health", healthy]);
  return checks.map(([label, ok]) => `${ok ? "PASS" : "FAIL"} ${label}`).join("\n") + "\n";
}

function isSupportedNode(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}
