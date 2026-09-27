# TypeScript Library Experience Specification

The TypeScript SDK (npm package `ezvals`) has the same semantics as the Python SDK — scoring, assertions, cases, loaders, file defaults, targets, evaluators, errors and timeouts all behave as specified in [EXPERIENCE_SPEC_PYTHON.md](./EXPERIENCE_SPEC_PYTHON.md). This document covers only the TypeScript surface.

---

## Setup

```gherkin
Scenario: Install and run
  Given `npm install --save-dev ezvals` and Node >= 22.18
  When the user runs `npx ezvals run evals/`
  Then every *.eval.ts (and .mts/.js/.mjs) file under evals/ is discovered and run
  And no build step is needed: Node runs the TypeScript directly
```

---

## `evaluate`

```ts
import assert from "node:assert";
import { evaluate } from "ezvals";

evaluate("refund", { input: "I want a refund", dataset: "support" }, async (ctx) => {
  ctx.output = await agent(ctx.input);
  assert(String(ctx.output).includes("refund"), "Should acknowledge refund");
});

evaluate("minimal", (ctx) => { ctx.output = "options are optional"; });
```

| Option | Python equivalent |
|--------|-------------------|
| `input`, `reference`, `dataset`, `labels`, `metadata`, `timeout` (seconds), `trials`, `target`, `evaluators`, `cases` | Same names |
| `defaultScoreKey` | `default_score_key` |
| `inputLoader` | `input_loader` |

```gherkin
Scenario: Assertions become scores
  Given an eval throws an error whose name is "AssertionError" (node:assert, chai, ...)
  Then a failing score is recorded with the error message as notes

Scenario: Unknown option
  Given evaluate(name, { datset: "qa" }, body)
  Then evaluate throws "Unknown option datset. Did you mean dataset?"
  (options of cases are checked the same way: "Unknown case keys: ...")

Scenario: Forgotten await
  Given an eval sets ctx.output = agent(ctx.input) where agent is async
  Then the result is the error "TypeError: ctx.output was never awaited. Did you forget await?" with output null

Scenario: Invalid scores
  Given ctx.store({ scores: { accuracy: 0.9 } })
  Then Error "Invalid score {"accuracy":0.9}: use true/false, a number, or { key, passed/value, notes }"
  Given ctx.store({ scores: [true, 0.5] })
  Then Error "Scores [true,0.5] would share the key 'pass': give each a key"

Scenario: Loader exclusivity
  Given evaluate(name, { input: "x", inputLoader: fn }, body)
  Then evaluate throws "inputLoader cannot be used with input, reference or cases"

Scenario: Default dataset
  Given evals/support.eval.ts defines an eval without a dataset
  Then its dataset is "support"

Scenario: Timeout of code that blocks the event loop
  Given an eval with timeout 5 runs synchronous code for 10 seconds
  Then it can't be interrupted, so its result is reported after 10 seconds
  But it is still the error "TimeoutError: Evaluation timed out after 5.0s"

Scenario: Wrong return type
  Given an eval returns something other than nothing, the context, a result object or an array of them
  Then the result is an error "Evaluation function must return ..."
```

The function receives an `EvalContext` and may be async. Returning nothing uses the context; returning an array of `{ input, output, scores, ... }` records each as a separate result.

---

## `EvalContext`

| Python | TypeScript |
|--------|------------|
| `ctx.input`, `ctx.output`, `ctx.reference`, `ctx.metadata`, `ctx.scores`, `ctx.latency` | Same |
| `ctx.trace_data` | `ctx.traceData` (a plain object; `messages` and `trace_url` keys are shown specially in the UI) |
| `ctx.store(..., trace_url=, trace_data=)` | `ctx.store({ ..., traceUrl, traceData })` |
| `ctx.run_id`, `session_name`, `run_name`, `eval_path`, `config`, `function_name`, `dataset`, `labels` | `ctx.runId`, `sessionName`, `runName`, `evalPath`, `config`, `functionName`, `dataset`, `labels` |

---

## File Defaults

```ts
export const ezvalsDefaults = { dataset: "support", labels: ["prod"], metadata: { model: "gpt-5" } };
```

Same keys (in camelCase) and precedence as Python's `ezvals_defaults`.
