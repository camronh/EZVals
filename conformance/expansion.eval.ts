import assert from "node:assert";
import { evaluate } from "../typescript/src/index.ts";

export const ezvalsDefaults = { labels: ["file"], metadata: { f: 1 } };

evaluate("inherits_defaults", (ctx) => {
  ctx.output = { labels: ctx.labels, metadata: ctx.metadata };
});

evaluate("overrides_defaults", { labels: ["own"], metadata: { g: 2 } }, (ctx) => {
  ctx.output = { labels: ctx.labels, metadata: ctx.metadata };
});

evaluate("add", {
  dataset: "math",
  labels: ["base"],
  metadata: { m: 1 },
  cases: [
    { id: "two", input: [1, 1], reference: 2, labels: ["extra"] },
    { input: [2, 2], reference: 5, dataset: "other", metadata: { n: 2 } },
    { input: [0, 0], reference: 0, labels: null },
  ],
}, (ctx) => {
  const [a, b] = ctx.input as number[];
  ctx.output = a + b;
  assert(ctx.output === ctx.reference, "sum mismatch");
});

evaluate("loaded", { inputLoader: () => [{ input: "a" }, { input: "b", labels: ["l"] }, { id: "obj", input: "c" }] }, (ctx) => {
  ctx.output = (ctx.input as string).toUpperCase();
});

evaluate("loader_fails", { inputLoader: () => { throw new Error("no data"); } }, () => {});
