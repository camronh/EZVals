#!/usr/bin/env node
// Runs the ezvals host binary bundled for this platform, pointing it at this package's worker.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(new URL(`./ezvals-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`, import.meta.url));
const worker = fileURLToPath(new URL("../dist/worker.js", import.meta.url));
const { status, error } = spawnSync(binary, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, EZVALS_NODE_WORKER: worker } });
if (error) throw error;
process.exit(status ?? 1);
