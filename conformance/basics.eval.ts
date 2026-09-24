import assert from "node:assert";
import { evaluate, type EvalResult } from "../typescript/src/index.ts";

class ValueError extends Error {
  name = "ValueError";
}

evaluate("passes", { input: "hi" }, (ctx) => {
  ctx.output = "hello";
});

evaluate("assertion_fails", { input: "x" }, (ctx) => {
  ctx.output = "y";
  assert(ctx.output === ctx.input, "wrong output");
});

evaluate("raises", (ctx) => {
  ctx.output = "partial";
  throw new ValueError("broke");
});

evaluate("stores_scores", (ctx) => {
  ctx.store({ scores: true });
  ctx.store({ scores: { key: "format", passed: false } });
  ctx.store({ scores: [{ key: "quality", value: 0.5 }, { key: "format", passed: true, notes: "fixed" }] });
});

evaluate("custom_score_key", { defaultScoreKey: "overall" }, (ctx) => {
  ctx.store({ output: 1, scores: 0.9 });
});

evaluate("metadata_and_trace", { metadata: { a: 1 } }, (ctx) => {
  ctx.store({ metadata: { b: 2 }, messages: [{ role: "user", content: "hi" }], traceUrl: "https://trace", traceData: { tokens: 3 } });
});

evaluate("run_info", { labels: ["x"] }, (ctx) => {
  ctx.output = { function: ctx.functionName, dataset: ctx.dataset, labels: ctx.labels, run_name: ctx.runName, config: ctx.config };
});

evaluate("returns_results", () => [{ input: 1, output: 2 }, { input: 3, output: 4, scores: { key: "custom", passed: false } }]);

evaluate("times_out", { timeout: 0.2 }, async (ctx) => {
  ctx.output = "started";
  await new Promise((resolve) => setTimeout(resolve, 5000));
});

evaluate("uses_target", { target: () => "from target" }, (ctx) => {
  assert(ctx.output === "from target", "target output missing");
});

const lengthCheck = (result: EvalResult) => ({ key: "long", passed: String(result.output).length > 3 });

evaluate("uses_evaluator", { evaluators: [lengthCheck] }, (ctx) => {
  ctx.output = "ok";
});
