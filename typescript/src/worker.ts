// Worker process the ezvals host spawns to run TypeScript/JavaScript evals.
// Same protocol as every SDK: write {"type":"evals"} once discovery finishes, then answer each
// {"id", "run", "grade"?} line on stdin with {"type":"result","id"}. User output goes to stderr.
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { discover, runEval, type Eval, type RunInfo, type WireResult } from "./index.ts";

const out = process.stdout;
const write = out.write.bind(out);
process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
const send = (message: object) =>
  write(JSON.stringify(message, (_, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");

const info: RunInfo & { traces_endpoint?: string } = JSON.parse(process.env.EZVALS_RUN || "{}");
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
    trials: e.params.trials ?? null, target: Boolean(e.params.target),
  })),
});

const currentEval = new AsyncLocalStorage<string>();
const tracing = info.traces_endpoint ? await traceTo(info.traces_endpoint) : undefined;
const { run_id, session_name, run_name, eval_path, config, timeout } = info;
const runInfo: RunInfo = { run_id, session_name, run_name, eval_path, config, timeout };

interface Request { id: string; run: string; grade?: WireResult }

async function run(request: Request) {
  const e = evals.get(request.run)!;
  const results = await currentEval.run(request.id, () =>
    tracing
      ? tracing.tracer.startActiveSpan(`${request.grade ? "grade" : "eval"} ${e.name}`, async (span: { end(): void }) => {
          try {
            return await runEval(e, runInfo, request.grade);
          } finally {
            span.end();
          }
        })
      : runEval(e, runInfo, request.grade));
  await tracing?.provider.forceFlush();
  send({ type: "result", id: request.id, results });
}

const running: Promise<void>[] = [];
for await (const line of createInterface({ input: process.stdin })) running.push(run(JSON.parse(line)));
await Promise.all(running);
write("", () => process.exit(0));

/**
 * Send OpenTelemetry spans recorded during each eval to the host, tagged with the eval's id. Only active when
 * the project has @opentelemetry/sdk-trace-node and @opentelemetry/exporter-trace-otlp-proto installed and
 * hasn't registered its own tracer provider.
 */
async function traceTo(endpoint: string) {
  let node, exporter;
  try {
    node = await import("@opentelemetry/sdk-trace-node");
    exporter = await import("@opentelemetry/exporter-trace-otlp-proto");
  } catch {
    return undefined;
  }
  const tagWithEval = {
    onStart(span: { setAttribute(key: string, value: string): void }) {
      const id = currentEval.getStore();
      if (id) span.setAttribute("ezvals.eval_id", id);
    },
    onEnd() {},
    forceFlush: async () => {},
    shutdown: async () => {},
  };
  const provider = new node.NodeTracerProvider({
    spanProcessors: [tagWithEval, new node.BatchSpanProcessor(new exporter.OTLPTraceExporter({ url: endpoint }))],
  });
  provider.register();
  return { provider, tracer: provider.getTracer("ezvals") };
}
