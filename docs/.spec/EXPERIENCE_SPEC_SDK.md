# SDK Specification

What a language SDK must do so the `ezvals` host can run its evals. Python (`python/ezvals/worker.py`) and TypeScript (`typescript/src/worker.ts`) are the reference implementations. Eval semantics (scoring, cases, loaders, file defaults, errors) are defined in [EXPERIENCE_SPEC_PYTHON.md](./EXPERIENCE_SPEC_PYTHON.md) and must be identical in every SDK.

---

## Discovery

The host decides which files belong to which SDK and passes them explicitly:

| Language | Files | Worker command |
|----------|-------|----------------|
| Python | `*.py` not starting with `_` | `$EZVALS_PYTHON -m ezvals.worker FILE...` (default `python3`) |
| TypeScript / JavaScript | `*.eval.ts`, `*.eval.mts`, `*.eval.js`, `*.eval.mjs` | `node WORKER FILE...` |

Directories are walked recursively, skipping hidden directories, `__*`, `node_modules` and `venv`. `WORKER` is `$EZVALS_NODE_WORKER`, else the first `node_modules/ezvals/dist/worker.js` found walking up from the eval files. A directory containing several languages runs every language's evals in one run.

---

## Worker Protocol

JSON, one object per line. The worker writes to stdout and reads stdin; anything the user's code prints must go to stderr (shown with `--verbose`).

```gherkin
Scenario: Discovery
  Given the worker was started with eval files
  When it has imported them and expanded cases and loaders
  Then it writes {"type": "evals", "evals": [EVAL, ...]} in definition order

Scenario: Discovery fails
  Given an eval file fails to import
  Then the worker writes {"type": "error", "error": "<message and traceback>"} and exits non-zero
  And the host prints the error and exits 1

Scenario: Running evals
  When the host writes {"id": "<request id>", "run": "<eval id>"}
  Then the worker starts that eval without waiting for earlier ones to finish
  And writes {"type": "result", "id": "<request id>", "results": [RESULT, ...]} when it completes
  (The request id is the eval id, or "<eval id>~<n>" for trial n, so trials of one eval can run at once.)

Scenario: Regrading a stored result
  When the host writes {"id": ..., "run": ..., "grade": RESULT}
  Then the worker runs the eval without its target
  And the context starts with the stored input, output, latency, metadata and trace data
  And the eval body and evaluators score it again

Scenario: Shutdown
  When stdin closes
  Then the worker finishes in-flight evals, reports them, and exits
```

The environment variable `EZVALS_RUN` holds `{"run_id", "session_name", "run_name", "eval_path", "config", "timeout"}`. The first five are exposed on the eval context; `timeout`, when set, overrides every eval's own timeout.

The host owns concurrency (it never has more than `--concurrency` evals in flight), pausing (it stops sending ids) and stopping (it kills the worker). If a worker exits with evals in flight, those evals get an error result.

### EVAL

```json
{"id": "evals/support.py::test_refund[angry]", "function": "test_refund[angry]", "dataset": "support",
 "labels": ["prod"], "input": "...", "reference": "...", "metadata": {}, "trials": 3, "target": true}
```

`trials` is how many times the eval asks to run (the host expands it, unless `--trials` overrides it). `target` tells the host the eval can be regraded.

`id` is `<file as passed>::<function>`, where `function` is the eval name plus `[case id or index]` for cases and loader examples. Ids are stable across runs as long as the code is unchanged.

### RESULT

```json
{"input": "...", "output": "...", "reference": null, "scores": [{"key": "pass", "passed": true}],
 "error": null, "latency": 0.42, "metadata": {}, "trace_data": {"messages": [], "trace_url": "..."}}
```

An eval reports one result, or several when the function returns a list of results. Values that aren't JSON serializable are converted to strings, and NaN or infinite numbers to null. A score's `value` is usually a number but may be a string or boolean.

---

## Run Format

Each run is `.ezvals/sessions/<session>/<run_id>.jsonl`, an append-only log. `run_id` is 8 random hex characters. Every event has `type` and `at` (unix seconds):

| Event | Fields | Meaning |
|-------|--------|---------|
| `run` | `run_id`, `session_name`, `run_name`, `path`, `dataset`, `labels`, `function_name`, `config_name` | Header, always first |
| `evals` | `evals: [EVAL]` | The eval list; replaces any earlier one |
| `queued` | `ids` | These evals will run (or be regraded); their earlier output is hidden until they finish again |
| `started` | `id` | |
| `result` | `id`, `results: [RESULT]` | |
| `cancelled` | `ids` | Queued or running evals that were stopped |
| `edit` | `id`, `n`, `field` (`annotation` or `scores`), `value` | A human edit to result `n` of eval `id`. Score edits are discarded when the eval runs again; annotations survive reruns |
| `renamed` | `run_name` | |

Reading a run replays the log into the run JSON served by the API and written by `ezvals export -f json` (see [EXPERIENCE_SPEC_WEBUI.md](./EXPERIENCE_SPEC_WEBUI.md#json-schema)). Runs saved by older versions as `<run_name>_<run_id>.json` are converted automatically.

---

## Conformance

Every SDK must pass `conformance/`: each fixture exists once per language (`basics.py`, `basics.eval.ts`, ...) and all of them must produce the results in `<fixture>.expected.json`, including trial rows. `TestConformanceRegrade` checks that regrading keeps the stored output while re-scoring. A new SDK adds its fixtures and a worker command; `go test ./cmd/ezvals -run TestConformance` checks it.
