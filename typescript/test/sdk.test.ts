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
