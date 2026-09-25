# Experience Specification: EZVals

This is the canonical source of truth for what EZVals enables users to do and how they do it. If someone deleted all the code but kept these documents, another developer should be able to rebuild the library with identical user-facing behavior.

---

## Related Documents

| Document | Covers |
|----------|--------|
| [EXPERIENCE_SPEC_PYTHON.md](./EXPERIENCE_SPEC_PYTHON.md) | Python API: `@eval`, `EvalContext`, `cases`, schemas. The reference for eval semantics in every language |
| [EXPERIENCE_SPEC_TYPESCRIPT.md](./EXPERIENCE_SPEC_TYPESCRIPT.md) | TypeScript API: `evaluate`, `EvalContext` |
| [EXPERIENCE_SPEC_SDK.md](./EXPERIENCE_SPEC_SDK.md) | What every language SDK must implement: the worker protocol and run format |
| [EXPERIENCE_SPEC_CLI.md](./EXPERIENCE_SPEC_CLI.md) | CLI: `ezvals run`, `ezvals serve`, flags, exit codes |
| [EXPERIENCE_SPEC_WEBUI.md](./EXPERIENCE_SPEC_WEBUI.md) | Web UI: table view, detail view, editing, export, REST API |

---

## Principles

### Core Philosophy

EZVals is a **pytest-inspired, code-first evaluation framework** for LLM applications and AI agents.

1. **Write evals like tests** - If you know pytest, you know EZVals. Use `assert`, `cases`, and decorators.

2. **Everything lives locally** - Datasets, code, and results are version-controlled together. No cloud dependencies.

3. **Agent-friendly first** - The CLI is designed for coding agents to run, analyze, and iterate programmatically.

4. **Minimal, not opinionated** - Flexible per-test-case logic, unlike rigid "one function per dataset" frameworks.

5. **Analysis over pass/fail** - Unlike pytest where tests are binary, evals are for analysis. All results matter.

6. **One tool, many languages** - Python and TypeScript evals share one CLI, one UI and one run format, and behave identically.

### Design Tradeoffs

| Optimized For | At The Expense Of |
|---------------|-------------------|
| Simplicity and minimal API | Advanced built-in evaluators |
| Local-first, version-controlled | Collaborative cloud features |
| Pytest familiarity | Novel paradigms |
| Agent/CLI-driven workflows | GUI-first workflows |
| Flexibility per test case | Opinionated structure |

---

## Capability Tiers

### Tier 1: Core (Must Never Break)

| Capability | What It Enables | Spec |
|------------|-----------------|------|
| `@eval` decorator | Mark functions as evaluations | [Python](./EXPERIENCE_SPEC_PYTHON.md#the-eval-decorator) |
| `EvalContext` injection | Build results declaratively | [Python](./EXPERIENCE_SPEC_PYTHON.md#evalcontext) |
| Assertion-based scoring | Pytest-like pass/fail | [Python](./EXPERIENCE_SPEC_PYTHON.md#assertion-based-scoring) |
| `ezvals run` command | Headless execution | [CLI](./EXPERIENCE_SPEC_CLI.md#ezvals-run) |
| Results saved per run | Persistence and analysis | [CLI](./EXPERIENCE_SPEC_CLI.md#output-options) |
| `ezvals serve` command | Web UI for review | [CLI](./EXPERIENCE_SPEC_CLI.md#ezvals-serve) |

### Tier 2: Important (Has Workarounds)

| Capability | What It Enables | Spec |
|------------|-----------------|------|
| `cases=` | Multiple test cases from one function | [Python](./EXPERIENCE_SPEC_PYTHON.md#cases) |
| `store()` | Set all context fields with explicit params | [Python](./EXPERIENCE_SPEC_PYTHON.md#the-store-method) |
| File-level defaults | Shared config across evals | [Python](./EXPERIENCE_SPEC_PYTHON.md#file-level-defaults) |
| Evaluators | Reusable post-processing | [Python](./EXPERIENCE_SPEC_PYTHON.md#evaluators) |
| Target hooks | Separated agent invocation | [Python](./EXPERIENCE_SPEC_PYTHON.md#target-hooks) |
| Filtering (`--dataset`, `--label`) | Selective runs | [CLI](./EXPERIENCE_SPEC_CLI.md#filtering-options) |
| Run/Stop in UI | Interactive execution | [WebUI](./EXPERIENCE_SPEC_WEBUI.md#running-evaluations) |
| Trials | Measure reliability of nondeterministic agents (pass@k, pass^k) | [Python](./EXPERIENCE_SPEC_PYTHON.md#trials) |
| Regrading | Iterate on graders without re-running agents | [Python](./EXPERIENCE_SPEC_PYTHON.md#regrading) |
| Tracing | OpenTelemetry spans saved with each result | [Python](./EXPERIENCE_SPEC_PYTHON.md#tracing) |
| `ezvals query` | SQL across all saved runs | [CLI](./EXPERIENCE_SPEC_CLI.md#ezvals-query) |

### Tier 3: Conveniences

| Capability | What It Enables | Spec |
|------------|-----------------|------|
| `--verbose` | Debug output | [CLI](./EXPERIENCE_SPEC_CLI.md#output-options) |
| `ezvals.json` config | Persistent defaults | [CLI](./EXPERIENCE_SPEC_CLI.md#configuration-file-ezvalsjson) |
| UI inline editing | Result annotation | [WebUI](./EXPERIENCE_SPEC_WEBUI.md#inline-editing) |
| CSV export | Spreadsheet analysis | [WebUI](./EXPERIENCE_SPEC_WEBUI.md#export) |
| Sessions/runs | Grouping for comparison | [CLI](./EXPERIENCE_SPEC_CLI.md#session-options) |

---

## Architecture

```
ezvals (one Go binary: CLI, web UI, storage)
   │  spawns one worker per language, per run
   ├── python -m ezvals.worker  files...     ◄── Python SDK
   └── node ezvals/dist/worker.js files...   ◄── TypeScript SDK
          │  JSON lines over stdin/stdout (see EXPERIENCE_SPEC_SDK.md)
          ▼
   .ezvals/sessions/<session>/<run_id>.jsonl  ◄── append-only event log per run
```

- SDKs only discover and execute user code. Filtering, concurrency, pause/stop, storage, stats, export and the UI live in the host, once.
- Every run starts fresh worker processes, so edited eval code is always picked up and a crashing eval can't take down the server.
- Within an SDK: the eval function builds a result via `EvalContext`, assertions become scores, evaluators add scores, and the SDK reports each eval's results back to the host.

---

## Invariants (Cross-Cutting)

### Scoring

1. Every score must have at least `value` or `passed`
2. Default score key is "pass" unless overridden
3. Failed assertions become **scores** (passed=False), not errors
4. No explicit scoring = auto-pass score added

### Data Preservation

1. Input and output are always preserved, even on errors
2. Partial data survives exceptions
3. Error field captures messages without replacing other fields

### Execution

1. Target runs before eval body (if specified)
2. Evaluators run after eval completes
3. Async functions are properly awaited
4. Timeout terminates with error, not failed score, and returns at the deadline without waiting for the eval
5. The same eval produces the same result in every language SDK (enforced by `conformance/`)

### CLI Exit Codes

1. Exit 0 = evaluations completed (regardless of pass/fail)
2. Exit non-zero = execution error only
3. Check JSON output for actual pass/fail status

---

## Known Gaps

| Spec Feature | Status |
|-------------|--------|
| Keyboard shortcuts `e` (export), `f` (filter), `r` (refresh) in the table view | Not implemented in the React UI |

---

## Common User Confusion States

These are mistakes new users commonly make.

### Silent Failures (No Error, Wrong Behavior)

| What User Does | What Happens | Fix |
|----------------|--------------|-----|
| `@eval` without `ctx: EvalContext` parameter | Works, but assertions don't create scores | Add `ctx: EvalContext` parameter |
| `@eval` used with `cases` in the wrong order | Discovery fails silently | Keep `@eval` as the only decorator and use `cases=` |

### Clear Errors

| What User Does | Error Message |
|----------------|---------------|
| Target without context param | `ValueError: target requires the evaluation function to accept a context parameter` |
| Unknown case key | `ValueError: Unknown case keys: prompt` |
| `store(scores=...)` without key and no default | `ValueError: Must specify score key or set default_score_key` |
| Score missing value and passed | `ValueError: Either 'value' or 'passed' must be provided in score` |
| Wrong return type | `ValueError: Evaluation function must return EvalResult, List[EvalResult], EvalContext, or None` |
| Path doesn't exist | `Error: Path nonexistent.py does not exist` (exit 1) |
| Invalid path type | `Error: Path some_file.txt is neither an eval file nor a directory` (exit 1) |
| Concurrency = 0 | `Error: concurrency must be at least 1, got 0` (exit 1) |
| Eval file fails to import | The import error and traceback, exit 1 |

---

## Tests

| Suite | Covers |
|-------|--------|
| `conformance/` (run by `go test`) | Every SDK produces identical results for the same fixture: scoring, assertions, errors, timeouts, cases, loaders, file defaults, targets, evaluators |
| `cmd/ezvals/*_test.go` | Event log folding, storage, filters, the HTTP API with real workers |
| `python/tests/`, `typescript/test/` | Language-specific API surface |
| `e2e/` | The web UI in a browser against a real server: running, stopping, detail view, annotations, filters, comparison, export |
| `ui/**/*.stories.tsx` (`npm test` in `ui/`) | Every UI component and page in its states, rendered in a browser; interaction stories assert behavior. Browse them with `make storybook` |

---

## Undocumented Capabilities

1. **Context Manager:** `with EvalContext() as ctx:`
2. **store() with spread:** `ctx.store(**agent_result, scores=True)` for clean agent integration
3. **Forward ref annotations:** `ctx: "EvalContext"` works
4. **call_async():** `await func.call_async()` for async functions
5. **Result status field:** "not_started", "pending", "running", "completed", "error", "cancelled"
6. **Annotation field:** Editable in UI, persists in the run's event log
