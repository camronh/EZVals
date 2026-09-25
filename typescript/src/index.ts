import { basename } from "node:path";

export interface Score {
  key: string;
  value?: number;
  passed?: boolean;
  notes?: string;
}

/** A score: `true`/`false` (pass/fail), a number (value), or an object with a key. */
export type ScoreInput = boolean | number | Partial<Score>;

/** Trace/debug data. `messages` and `trace_url` get special treatment in the UI; any other keys are shown as-is. */
export interface TraceData {
  messages?: unknown[];
  trace_url?: string;
  [key: string]: unknown;
}

export interface EvalResult {
  input: unknown;
  output: unknown;
  reference?: unknown;
  scores?: ScoreInput | ScoreInput[];
  error?: string | null;
  latency?: number | null;
  metadata?: Record<string, unknown>;
  traceData?: TraceData;
}

export type Target = (ctx: EvalContext) => unknown;
export type Evaluator = (result: EvalResult) => unknown;

export interface EvalOptions {
  input?: unknown;
  reference?: unknown;
  /** Defaults to the file name without `.eval.ts`. */
  dataset?: string | null;
  labels?: string[] | null;
  metadata?: Record<string, unknown> | null;
  /** Key for scores given without one, including the automatic pass score. Defaults to "pass". */
  defaultScoreKey?: string;
  /** Seconds. */
  timeout?: number;
  /** How many times `ezvals run` runs the eval (each run is a separate result). */
  trials?: number;
  /** Runs before the eval body; a returned value becomes `ctx.output`. */
  target?: Target;
  /** Run on each result; returned scores are added. */
  evaluators?: Evaluator[];
  /** Expand into one eval per case. Case fields override these options; labels and metadata merge. */
  cases?: EvalCase[];
  /** Like `cases`, but loaded when evals are discovered. */
  inputLoader?: () => EvalCase[] | Promise<EvalCase[]>;
}

export type EvalCase = { id?: string } & Omit<EvalOptions, "cases" | "inputLoader">;

export type EvalFn = (ctx: EvalContext) => unknown;

export interface RunInfo {
  run_id?: string;
  session_name?: string;
  run_name?: string;
  eval_path?: string;
  config?: Record<string, unknown>;
  timeout?: number;
}

export class EvalContext {
  input: unknown;
  output: unknown;
  reference: unknown;
  metadata: Record<string, unknown>;
  traceData: TraceData = {};
  latency: number | null = null;
  scores: Score[] = [];
  error: string | null = null;
  defaultScoreKey: string;
  readonly functionName: string;
  readonly dataset: string | null;
  readonly labels: string[];
  readonly runId?: string;
  readonly sessionName?: string;
  readonly runName?: string;
  readonly evalPath?: string;
  readonly config: Record<string, unknown>;

  constructor(params: Params, functionName: string, info: RunInfo) {
    this.input = params.input;
    this.reference = params.reference;
    this.metadata = { ...params.metadata };
    this.defaultScoreKey = params.defaultScoreKey;
    this.functionName = functionName;
    this.dataset = params.dataset;
    this.labels = params.labels;
    this.runId = info.run_id;
    this.sessionName = info.session_name;
    this.runName = info.run_name;
    this.evalPath = info.eval_path;
    this.config = info.config ?? {};
  }

  /** Set any fields passed. Scores with an existing key overwrite it; metadata and traceData merge. */
  store(fields: {
    input?: unknown;
    output?: unknown;
    reference?: unknown;
    latency?: number;
    scores?: ScoreInput | ScoreInput[];
    messages?: unknown[];
    traceUrl?: string;
    metadata?: Record<string, unknown>;
    traceData?: TraceData;
  }): this {
    if (fields.input !== undefined) this.input = fields.input;
    if (fields.output !== undefined) this.output = fields.output;
    if (fields.reference !== undefined) this.reference = fields.reference;
    if (fields.latency !== undefined) this.latency = fields.latency;
    if (fields.traceData) Object.assign(this.traceData, fields.traceData);
    if (fields.messages) this.traceData.messages = fields.messages;
    if (fields.traceUrl) this.traceData.trace_url = fields.traceUrl;
    if (fields.metadata) Object.assign(this.metadata, fields.metadata);
    for (const score of normalizeScores(fields.scores, this.defaultScoreKey)) {
      const i = this.scores.findIndex((s) => s.key === score.key);
      if (i >= 0) this.scores[i] = score;
      else this.scores.push(score);
    }
    return this;
  }

  build(): EvalResult {
    return {
      input: this.input,
      output: this.output,
      reference: this.reference,
      scores: this.scores.length || this.error ? this.scores : [{ key: this.defaultScoreKey, passed: true }],
      error: this.error,
      latency: this.latency,
      metadata: this.metadata,
      traceData: this.traceData,
    };
  }
}

function toArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** A score, a list of scores, or nothing, as a list of keyed scores. */
function normalizeScores(scores: ScoreInput | ScoreInput[] | undefined, defaultKey: string): Score[] {
  const list = toArray(scores);
  const normalized = list.map((score) => {
    const s = typeof score === "boolean" ? { passed: score } : typeof score === "number" ? { value: score } : score;
    if (typeof s !== "object" || s === null || (s.value == null && s.passed == null)) {
      throw new Error(`Invalid score ${JSON.stringify(score)}: use true/false, a number, or { key, passed/value, notes }`);
    }
    return { key: defaultKey, ...s } as Score;
  });
  if (list.filter((s) => typeof s !== "object" || !("key" in s)).length > 1) {
    throw new Error(`Scores ${JSON.stringify(list)} would share the key '${defaultKey}': give each a key`);
  }
  return normalized;
}

/** Levenshtein distance, for suggesting the option a typo meant. */
function distance(a: string, b: string): number {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

interface Definition {
  name: string;
  file: string;
  options: EvalOptions;
  fn: EvalFn;
}

interface Params {
  input?: unknown;
  reference?: unknown;
  dataset: string | null;
  labels: string[];
  metadata?: Record<string, unknown> | null;
  defaultScoreKey: string;
  timeout?: number;
  trials?: number;
  target?: Target;
  evaluators?: Evaluator[];
}

// Shared across copies of this module, so evals register with the worker even if the user's
// project resolves `ezvals` to a different copy than the worker's.
const registry: { file: string; definitions: Definition[] } = ((globalThis as any).__ezvals ??= { file: "", definitions: [] });

/** Define an eval. The function receives an EvalContext; set `ctx.output`, store scores, or throw an AssertionError to fail. */
export function evaluate(name: string, fn: EvalFn): void;
export function evaluate(name: string, options: EvalOptions, fn: EvalFn): void;
export function evaluate(name: string, optionsOrFn: EvalOptions | EvalFn, fn?: EvalFn): void {
  const [options, body] = typeof optionsOrFn === "function" ? [{}, optionsOrFn] : [optionsOrFn, fn!];
  const known = [...PARAMS, "cases", "inputLoader"];
  for (const key of Object.keys(options).filter((k) => !known.includes(k))) {
    const closest = known.reduce((best, k) => (distance(key, k) < distance(key, best) ? k : best));
    throw new Error(`Unknown option ${key}.${distance(key, closest) <= Math.max(2, key.length / 3) ? ` Did you mean ${closest}?` : ""}`);
  }
  if (options.inputLoader && ("input" in options || "reference" in options || options.cases)) {
    throw new Error("inputLoader cannot be used with input, reference or cases");
  }
  registry.definitions.push({ name, file: registry.file, options, fn: body });
}

/** A runnable eval: a definition resolved against file defaults and one case. */
export interface Eval {
  id: string;
  name: string;
  params: Params;
  fn: EvalFn;
  error?: string;
}

const PARAMS = ["input", "reference", "dataset", "labels", "metadata", "defaultScoreKey", "timeout", "trials", "target", "evaluators"];

function pick(options: Record<string, unknown>): Partial<Params> {
  return Object.fromEntries(Object.entries(options).filter(([k]) => PARAMS.includes(k)));
}

/** Overlay params. Metadata merges (null clears); case labels merge with base labels (null/[] clears). */
function layer(base: Params, over: Partial<Params>, mergeLabels: boolean): Params {
  const out = { ...base, ...over };
  if (over.metadata) out.metadata = { ...base.metadata, ...over.metadata };
  if (mergeLabels && "labels" in over) {
    out.labels = over.labels?.length ? [...base.labels, ...over.labels.filter((l) => !base.labels.includes(l))] : [];
  }
  return out;
}

/** Import eval files and resolve their evals in definition order. */
export async function discover(files: string[], importFile: (file: string) => Promise<Record<string, unknown>>): Promise<Eval[]> {
  const evals: Eval[] = [];
  for (const file of files) {
    registry.file = file;
    const start = registry.definitions.length;
    const module = await importFile(file);
    const fileDefaults = (module.ezvalsDefaults ?? {}) as Record<string, unknown>;
    const unknown = Object.keys(fileDefaults).filter((k) => !PARAMS.includes(k));
    if (unknown.length) throw new Error(`Unknown keys in ezvalsDefaults: ${unknown.join(", ")}`);
    const builtins: Params = { dataset: basename(file).replace(/\.eval\.[mc]?[jt]s$/, ""), labels: [], metadata: {}, defaultScoreKey: "pass" };
    for (const def of registry.definitions.slice(start)) {
      const base = layer(layer(builtins, fileDefaults, false), pick(def.options as Record<string, unknown>), false);
      const make = (name: string, params: Params, error?: string): Eval => ({ id: `${file}::${name}`, name, params, fn: def.fn, error });
      let cases = def.options.cases;
      if (def.options.inputLoader) {
        try {
          cases = await def.options.inputLoader();
        } catch (e) {
          evals.push(make(def.name, base, `Input loader failed: ${e instanceof Error ? e.message : e}\n${describe(e)}`));
          continue;
        }
      }
      if (!cases) {
        evals.push(make(def.name, base));
        continue;
      }
      cases.forEach((c, i) => {
        const unknownKeys = Object.keys(c).filter((k) => k !== "id" && !PARAMS.includes(k));
        if (unknownKeys.length) throw new Error(`Unknown case keys: ${unknownKeys.join(", ")}`);
        evals.push(make(`${def.name}[${c.id ?? i}]`, layer(base, pick(c), true)));
      });
    }
  }
  return evals;
}

class Timeout extends Error {}

function describe(e: unknown): string {
  return e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`) : String(e);
}

/** The wire format shared with every SDK. */
export interface WireResult {
  input: unknown;
  output: unknown;
  reference: unknown;
  scores: Score[];
  error: string | null;
  latency: number | null;
  metadata: Record<string, unknown>;
  trace_data: TraceData;
}

/** Run an eval. With `grade` (a stored result), skip the target and score that result's output again. */
export async function runEval(e: Eval, info: RunInfo = {}, grade?: WireResult): Promise<WireResult[]> {
  const p = e.params;
  if (e.error) return [toWire({ input: null, output: null, error: e.error }, p.defaultScoreKey)];
  const ctx = new EvalContext(p, e.name, info);
  if (grade) {
    ctx.store({ input: grade.input, output: grade.output, metadata: grade.metadata, traceData: grade.trace_data });
    ctx.latency = grade.latency;
  }
  const timeout = info.timeout || p.timeout;
  const start = performance.now();
  let results: EvalResult[];
  try {
    const body = async () => {
      if (p.target && !grade) {
        const out = await p.target(ctx);
        if (out !== undefined && !(out instanceof EvalContext)) ctx.store({ output: out });
      }
      return e.fn(ctx);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const returned = await (timeout
      ? Promise.race([body(), new Promise((_, reject) => (timer = setTimeout(() => reject(new Timeout()), timeout * 1000)))])
      : body()
    ).finally(() => clearTimeout(timer));
    // Code that blocks the event loop can't be interrupted, but running past the deadline is still a timeout.
    if (timeout && performance.now() - start > timeout * 1000) throw new Timeout();
    results = returned === undefined || returned instanceof EvalContext ? [ctx.build()] : toArray(returned as EvalResult | EvalResult[]);
    if (!results.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) {
      throw new Error(`Evaluation function must return an EvalResult, an array of them, the EvalContext, or nothing, got ${Array.isArray(returned) ? "array" : typeof returned}`);
    }
  } catch (err) {
    if (err instanceof Timeout) {
      ctx.error = `TimeoutError: Evaluation timed out after ${Number.isInteger(timeout) ? timeout!.toFixed(1) : timeout}s`;
    } else if (err instanceof Error && err.name === "AssertionError") {
      ctx.store({ scores: { passed: false, notes: err.message || "Assertion failed" } });
    } else {
      ctx.error = describe(err);
    }
    results = [ctx.build()];
  }
  if (typeof (ctx.output as PromiseLike<unknown> | null)?.then === "function") {
    Promise.resolve(ctx.output).catch(() => {});
    ctx.output = null;
    ctx.error = "TypeError: ctx.output was never awaited. Did you forget await?";
    results = [ctx.build()];
  }
  const elapsed = (performance.now() - start) / 1000;
  try {
    // Evaluators score every finished result, including ones a failed assertion scored.
    for (let i = 0; i < results.length; i++) {
      for (const evaluator of results[i].error ? [] : (p.evaluators ?? [])) {
        const scored = await evaluator(results[i]);
        if (scored && typeof scored === "object" && "output" in scored) results[i] = scored as EvalResult;
        else if (scored != null) results[i].scores = [...toArray(results[i].scores), ...normalizeScores(scored as ScoreInput, "pass")];
      }
    }
    return results.map((r) => ({ ...toWire(r, p.defaultScoreKey), latency: r.latency ?? elapsed / results.length }));
  } catch (err) {
    ctx.error = describe(err);
    return [{ ...toWire(ctx.build(), p.defaultScoreKey), latency: ctx.latency ?? elapsed }];
  }
}

function toWire(r: EvalResult, defaultScoreKey: string): WireResult {
  const scores = normalizeScores(r.scores, "pass");
  return {
    input: r.input,
    output: r.output,
    reference: r.reference ?? null,
    scores: scores.length || r.error ? scores : [{ key: defaultScoreKey, passed: true }],
    error: r.error ?? null,
    latency: r.latency ?? null,
    metadata: r.metadata ?? {},
    trace_data: r.traceData ?? {},
  };
}
