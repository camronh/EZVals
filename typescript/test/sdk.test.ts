import assert from "node:assert/strict";
import { test } from "node:test";
import { discover, evaluate, runEval } from "../src/index.ts";

const register = (file: string, define: () => void) =>
  discover([file], async () => {
    define();
    return {};
  });

test("dataset defaults to the file name and options are optional", async () => {
  const [e] = await register("evals/support.eval.mts", () => evaluate("greets", (ctx) => { ctx.output = "hi"; }));
  assert.equal(e.id, "evals/support.eval.mts::greets");
  assert.equal(e.params.dataset, "support");
  const [result] = await runEval(e);
  assert.deepEqual(result.scores, [{ key: "pass", passed: true }]);
});

test("inputLoader cannot be combined with input", () => {
  assert.throws(() => evaluate("bad", { input: 1, inputLoader: () => [] }, () => {}), /inputLoader cannot be used/);
});

test("run info is exposed on the context", async () => {
  const [e] = await register("x.eval.ts", () => evaluate("info", (ctx) => { ctx.output = [ctx.runId, ctx.config]; }));
  const [result] = await runEval(e, { run_id: "r1", config: { model: "m" } });
  assert.deepEqual(result.output, ["r1", { model: "m" }]);
});

test("errors that are not assertions keep partial output", async () => {
  const [e] = await register("x.eval.ts", () => evaluate("throws", (ctx) => {
    ctx.output = "partial";
    throw new TypeError("nope");
  }));
  const [result] = await runEval(e);
  assert.equal(result.output, "partial");
  assert.match(result.error!, /^TypeError: nope\n/);
  assert.deepEqual(result.scores, []);
});

test("return values that aren't results, and bad evaluator scores, are errors", async () => {
  const evals = await register("x.eval.ts", () => {
    evaluate("string", () => "nope");
    evaluate("numbers", () => [1, 2]);
    evaluate("bad_score", { evaluators: [() => ({ key: "bad" })] }, (ctx) => { ctx.output = "x"; });
  });
  const errors = await Promise.all(evals.map(async (e) => (await runEval(e))[0].error));
  assert.match(errors[0]!, /^Error: Evaluation function must return .* got string/);
  assert.match(errors[1]!, /got array/);
  assert.match(errors[2]!, /^Error: Invalid score \{"key":"bad"\}: use true\/false, a number/);
});

test("unknown options suggest the closest one", () => {
  assert.throws(() => evaluate("typo", { datset: "qa" } as never, () => {}), /^Error: Unknown option datset. Did you mean dataset\?$/);
});

test("unkeyed scores in one list would collide", async () => {
  const [e] = await register("x.eval.ts", () => evaluate("collide", (ctx) => { ctx.store({ scores: [true, 0.5] }); }));
  assert.match((await runEval(e))[0].error!, /^Error: Scores \[true,0.5\] would share the key 'pass': give each a key/);
});

test("an output that was never awaited is an error", async () => {
  const [e] = await register("x.eval.ts", () => evaluate("forgets", (ctx) => { ctx.output = Promise.resolve("hi"); }));
  const [result] = await runEval(e);
  assert.equal(result.error, "TypeError: ctx.output was never awaited. Did you forget await?");
  assert.equal(result.output, null);
});
