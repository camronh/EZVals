import assert from "node:assert";
import { createRequire } from "node:module";
import { evaluate } from "../typescript/src/index.ts";

// This directory has no node_modules; borrow the SDK's @opentelemetry/api (it shares one global registry).
const { trace } = createRequire(import.meta.url)("../typescript/node_modules/@opentelemetry/api");

const tracer = trace.getTracer("conformance");

const callModel = () => tracer.startActiveSpan("chat", (span: { end(): void }) => {
  span.end();
  return process.env.TARGET_OUTPUT ?? "a";
});

evaluate("graded", { input: "q", target: callModel }, (ctx) => {
  assert(ctx.output === (process.env.EXPECTED ?? "a"), "unexpected output");
});

evaluate("repeated", { trials: 2 }, (ctx) => {
  ctx.output = "same";
});

evaluate("repeated_case", { trials: 2, cases: [{ id: "x", input: 1 }] }, (ctx) => {
  ctx.output = ctx.input;
});
