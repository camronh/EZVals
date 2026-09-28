import assert from "node:assert";
import { evaluate } from "../typescript/src/index.ts";

const callModel = () => process.env.TARGET_OUTPUT ?? "a";

evaluate("graded", { input: "q", target: callModel }, (ctx) => {
  assert(ctx.output === (process.env.EXPECTED ?? "a"), "unexpected output");
});

evaluate("repeated", { trials: 2 }, (ctx) => {
  ctx.output = "same";
});

evaluate("repeated_case", { trials: 2, cases: [{ id: "x", input: 1 }] }, (ctx) => {
  ctx.output = ctx.input;
});
