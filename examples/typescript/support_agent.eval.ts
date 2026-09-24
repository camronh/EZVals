import assert from "node:assert";
import { evaluate, type EvalContext } from "ezvals";

async function supportAgent(prompt: string) {
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 300));
  const output = prompt.toLowerCase().includes("refund") ? "I'll help you process your refund request." : `Processing: ${prompt}`;
  return { output, messages: [{ role: "user", content: prompt }, { role: "assistant", content: output }] };
}

// A target runs the agent; the eval body only scores.
async function runAgent(ctx: EvalContext) {
  const { output, messages } = await supportAgent(String(ctx.input));
  ctx.store({ output, messages, traceUrl: "https://ezvals.com" });
}

evaluate("handles_refunds", {
  dataset: "customer_service",
  labels: ["production"],
  target: runAgent,
  cases: [
    { id: "direct", input: "I want a refund" },
    { id: "polite", input: "Could I get a refund please?" },
    { id: "indirect", input: "Money back please" },
  ],
}, (ctx) => {
  assert(String(ctx.output).includes("refund"), "Should acknowledge the refund");
});

evaluate("scores_tone", { input: "Where is my order?", target: runAgent }, (ctx) => {
  ctx.store({
    scores: [
      { key: "polite", passed: !String(ctx.output).includes("!") },
      { key: "brevity", value: Math.max(0, 1 - String(ctx.output).length / 200) },
    ],
    metadata: { model: "demo" },
  });
});
