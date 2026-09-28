#!/usr/bin/env node
// Runs the ezvals host binary from this platform's package (ezvals-<os>-<cpu>, an optional dependency npm
// installs only on matching machines), pointing it at this package's worker.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const platform = `${process.platform}-${process.arch}`;
let dir;
try {
  dir = dirname(createRequire(import.meta.url).resolve(`ezvals-${platform}/package.json`));
} catch {
  console.error(`ezvals has no host binary installed for ${platform}. It supports darwin-arm64, darwin-x64, linux-x64, linux-arm64 and win32-x64; on one of those, reinstall without --omit=optional.`);
  process.exit(1);
}
const binary = join(dir, process.platform === "win32" ? "ezvals.exe" : "ezvals");
const worker = fileURLToPath(new URL("../dist/worker.js", import.meta.url));
const { status, error } = spawnSync(binary, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, EZVALS_NODE_WORKER: worker } });
if (error) throw error;
process.exit(status ?? 1);
