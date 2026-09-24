// Worker process the ezvals host spawns to run TypeScript/JavaScript evals.
// Same protocol as every SDK: write {"type":"evals"} once discovery finishes, then answer each
// {"run": id} line on stdin with {"type":"result"}. User output goes to stderr.
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { discover, runEval, type Eval, type RunInfo } from "./index.ts";

const out = process.stdout;
const write = out.write.bind(out);
process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
const send = (message: object) =>
  write(JSON.stringify(message, (_, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");

const info: RunInfo = JSON.parse(process.env.EZVALS_RUN || "{}");
let evals: Map<string, Eval>;
try {
  const found = await discover(process.argv.slice(2), (file) => import(pathToFileURL(resolve(file)).href));
  evals = new Map(found.map((e) => [e.id, e]));
} catch (e) {
  send({ type: "error", error: e instanceof Error ? e.stack : String(e) });
  process.exit(1);
}
send({
  type: "evals",
  evals: [...evals.values()].map((e) => ({
    id: e.id, function: e.name, dataset: e.params.dataset, labels: e.params.labels,
    input: e.params.input ?? null, reference: e.params.reference ?? null, metadata: e.params.metadata ?? null,
  })),
});

const running: Promise<void>[] = [];
for await (const line of createInterface({ input: process.stdin })) {
  const id: string = JSON.parse(line).run;
  running.push(runEval(evals.get(id)!, info).then((results) => { send({ type: "result", id, results }); }));
}
await Promise.all(running);
write("", () => process.exit(0));
