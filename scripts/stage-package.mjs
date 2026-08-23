import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const companion = resolve(root, "codechess/companion");
const source = resolve(companion, "dist");
const destination = resolve(root, "dist");

await run(process.execPath, [resolve(root, "node_modules/tsup/dist/cli-default.js")], companion);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Companion build failed (${signal ?? code ?? "unknown"}).`));
    });
  });
}
