# Running and Analyzing Evals

How to run evaluations, manage sessions, and serve results for review.

## Quick Start

```bash
# Run evals headlessly (for CI/agents)
ezvals run evals/ --session my-experiment --run-name baseline

# Run evals AND open the UI in one command
ezvals serve evals/ --session my-experiment --run

# Or just open the UI to browse/run evals interactively
ezvals serve evals/ --session my-experiment
```

## Two Modes: Run vs Serve

| Command | Purpose | Output |
|---------|---------|--------|
| `ezvals run` | Headless execution for CI/agents | Status lines on stderr, saved run file (`--json` prints the full run to stdout) |
| `ezvals serve` | Interactive browser UI — can **both run AND view** evals | Web interface at localhost:8000 |

> In TypeScript projects, prefix commands with `npx` (`npx ezvals run evals/`). A directory can mix Python (`.py`) and TypeScript (`*.eval.ts`) evals; both run into one run.

> **Both commands can run evals.** `serve` is NOT view-only — users can click **Run** in the UI to execute evals, or pass `--run` to auto-run on startup. The only difference between `run` and `serve` is that `run` is headless while `serve` provides an interactive web UI.

### When to Use Each

**Use `run` when:**
- Running in CI/CD pipelines
- Agent needs to parse results programmatically
- Batch execution without human review

**Use `serve` when:**
- User wants to run evals and review results visually
- Debugging failures interactively
- Comparing runs side-by-side

## Session Management

Sessions group related runs together for comparison and tracking.

### Naming Conventions

**Session names** should describe the experiment or goal:
- `model-comparison` - Comparing different models
- `bug-fix-123` - Tracking a specific fix
- `prompt-experiment` - Testing prompt variations
- `release-v2.0` - Release validation

**Run names** should describe what's different in this run:
- `baseline` - Before changes
- `gpt4-turbo` - Which model
- `attempt-2` - Iteration number
- `with-caching` - What changed

### Examples

```bash
# Model comparison session
ezvals run evals/ --session model-comparison --run-name claude-sonnet
ezvals run evals/ --session model-comparison --run-name gpt-4o
ezvals run evals/ --session model-comparison --run-name gemini-pro

# Iterative debugging session
ezvals run evals/ --session bug-fix-auth --run-name initial
# Make changes...
ezvals run evals/ --session bug-fix-auth --run-name attempt-2
# More changes...
ezvals run evals/ --session bug-fix-auth --run-name fixed

# A/B testing prompts
ezvals run evals/ --session prompt-experiment --run-name prompt-v1
ezvals run evals/ --session prompt-experiment --run-name prompt-v2-concise
```

### Auto-Generated Names

If you don't specify names, friendly adjective-noun combinations are generated:
- `swift-falcon`
- `bright-flame`
- `gentle-whisper`

```bash
# Session "default", auto-generated run name
ezvals run evals/
# Creates: .ezvals/sessions/default/a1b2c3d4.jsonl  (run_name: swift-falcon)
```

### Rename an Existing Saved Run

Use run-id based rename mode when you want to update a run name from scripts or terminal workflows.

```bash
# Rename by run_id
ezvals run --rename a1b2c3d4 better-name
```

## Running Evals

### Basic Run

> **IMPORTANT:** EZVals does NOT use pytest's `-k` flag. Use `::` path selectors to target specific evals.

```bash
# Run all evals in a directory
ezvals run evals/

# Run a specific file
ezvals run evals/customer_service.py

# Run a specific function
ezvals run evals/customer_service.py::test_refund

# Run a specific list of evals (no label hacks)
ezvals run evals/customer_service.py::test_refund,test_escalation

# Run specific case IDs with intuitive selectors
ezvals run evals/customer_service.py::test_math@low,test_math@high
```

### Filtering

```bash
# By dataset
ezvals run evals/ --dataset customer_service

# By label
ezvals run evals/ --label production

# Limit number of evals
ezvals run evals/ --limit 10
```

### Execution Options

```bash
# Run 4 evals in parallel
ezvals run evals/ --concurrency 4

# Set timeout (overrides per-eval timeouts; timed-out evals stop at the deadline)
ezvals run evals/ --timeout 60.0

# Show eval output (prints, logs) and errors as they happen
ezvals run evals/ --verbose
```

### Output Options

Status lines (`Running …`, `Results saved to …`) go to stderr, so stdout is clean JSON when you ask for it.

```bash
# Save as usual AND print the full run JSON to stdout (includes saved_path)
ezvals run evals/ --json

# Print the run JSON to stdout, save nothing
ezvals run evals/ --no-save

# Write the run as one JSON file instead of the session store
ezvals run evals/ --output results.json
```

**Prefer `--json` when you need to analyze results**: it gives you totals and every result in one document without reading the run file.

## Temporary Ad-Hoc Runs (No Saved Files)

When you want a quick one-off eval (for example, testing an idea in a temp script) and do **not** want to persist run files, use the SDK `run(...)` with `no_save=True`. It returns the run as a dict (`run_id`, `session_name`, `run_name`, `total_*` fields, `results`, `saved_path`) and raises `ValueError` if the CLI fails.

```python
from ezvals import eval, EvalResult, run


@eval()
def test_temp_behavior():
    return EvalResult(
        input="hello",
        output="hello",
        scores={"key": "pass", "passed": True},
    )


if __name__ == "__main__":
    result = run(
        __file__,        # run evals defined in this temp script
        no_save=True,    # do not write a run file
    )
    print(result["total_evaluations"], result["total_passed"])
```

`run()` accepts `path, dataset, labels, limit, output, concurrency, timeout, session, run_name, no_save, config`. For in-process execution returning `EvalResult` objects (no CLI, nothing saved), use `run_evals([fn_or_path, ...], concurrency=1, timeout=None, dataset=None, labels=None, limit=None)`.

From the shell (any language), `ezvals run path --no-save` does the same thing.

Use this pattern for scratch experiments, fast local checks, and agent-generated temp eval files.

## Serving Results for Review

After running evals, serve them for the user to review in the browser.

### Basic Serve

```bash
# Serve with the same session to see results
ezvals serve evals/ --session my-experiment
```

This opens `http://localhost:8000` by default (use `--no-open` to skip auto-opening a browser) where the user can:
- View all eval results in a table
- Click into individual results for details
- Filter by dataset, label, or status
- Compare runs side-by-side
- Export to JSON, CSV, Markdown, or PNG

### Run on Startup

To run evals AND open the UI in one command:

```bash
ezvals serve evals/ --session my-experiment --run
```

The `--run` flag automatically runs all evals when the server starts.

```bash
# Start server without opening browser
ezvals serve evals/ --session my-experiment --no-open
```

## Sharing Focused Views by URL

If the user already has the UI running, or if you want to show the user a specific view, construct and share a direct URL for exactly what you want them to review.

### Base URL

Use the user’s existing serve URL, e.g.:

- `http://127.0.0.1:8000`

### Query Parameters

- `run_id=<id>` active run to open for single-run views
- `compare_run_id=<id>` repeat to compare multiple runs (preferred for compare mode links)
- `search=<text>` search query
- `annotation=any|yes|no`
- `has_error=1|0`
- `has_url=1|0`
- `has_messages=1|0`
- `dataset_in=<value>` (repeatable)
- `dataset_out=<value>` (repeatable)
- `label_in=<value>` (repeatable)
- `label_out=<value>` (repeatable)
- `score_value=<key,op,value>` (repeatable, `op=gt|gte|lt|lte|eq|neq`)
- `score_passed=<key,true|false>` (repeatable)

### Practical Agent Examples

```text
You can see the two final runs side-by-side here:
http://127.0.0.1:8000/?compare_run_id=1826bc4c&compare_run_id=58741756
```

```text
You can see only results with errors in the active run here:
http://127.0.0.1:8000/?run_id=1826bc4c&has_error=1
```

```text
You can see passing pass-only results for QA labels here:
http://127.0.0.1:8000/?run_id=1826bc4c&score_passed=pass,true&label_in=qa
```

### Viewing Previous Results

Two ways to view a previous run:

```bash
# Option 1: Pass the run file directly
ezvals serve .ezvals/sessions/default/a1b2c3d4.jsonl

# Option 2: Load a session and pick runs from the dropdown
ezvals serve evals/ --session my-experiment
```

If the original eval source file still exists, you can rerun evaluations. If the source was moved or deleted, it works in view-only mode.

### Custom Port

```bash
ezvals serve evals/ --port 3000
```

## Results Storage

Each run is saved to `.ezvals/sessions/<session>/<run_id>.jsonl`, where `run_id` is 8 random hex characters:

```
.ezvals/sessions/
├── model-comparison/
│   ├── a1b2c3d4.jsonl    # run_name: baseline
│   └── e5f6a7b8.jsonl    # run_name: improved
└── default/
    └── c9d0e1f2.jsonl    # run_name: swift-falcon
```

A run file is an append-only event log (one JSON event per line), not a results document. Don't parse it by hand; get the materialized run as JSON instead:

```bash
ezvals run evals/ --json > run.json                                           # while running
ezvals export .ezvals/sessions/default/a1b2c3d4.jsonl -f json -o run.json     # a saved run
```

Old `.json` run files are migrated automatically on first use. Reusing a run name within a session replaces the earlier run.

### JSON Structure

```json
{
  "run_id": "a1b2c3d4",
  "session_name": "model-comparison",
  "run_name": "baseline",
  "total_evaluations": 50,
  "total_passed": 45,
  "total_errors": 2,
  "average_latency": 1.2,
  "results": [...]
}
```

### `results[*]` / `EvalResult` Output Schema

Each item in `results` has run metadata plus a `result` object that matches `EvalResult`:

```json
{
  "id": "evals/support.py::test_answer_quality",
  "function": "test_answer_quality",
  "dataset": "customer-service",
  "labels": ["prod", "regression"],
  "result": {
    "input": "User asks for refund policy",
    "output": "You can request a refund within 30 days.",
    "reference": "Refunds are allowed within 30 days",
    "scores": [
      {"key": "pass", "passed": true},
      {"key": "tone", "passed": true, "value": 0.9, "notes": "Professional"}
    ],
    "error": null,
    "latency": 0.42,
    "metadata": {"model": "gpt-4o-mini"},
    "trace_data": {"trace_url": "https://trace.example/run/123"},
    "status": "completed"
  }
}
```

`result` field reference:

- `input` (`Any`) input used for evaluation
- `output` (`Any`) target/agent output
- `reference` (`Any | null`) expected output (if provided)
- `scores` (`Score[] | null`) list of score objects
- `error` (`string | null`) execution error, if one occurred
- `latency` (`number | null`) seconds for this eval
- `metadata` (`object | null`) user-defined structured metadata
- `trace_data` (`object | null`) trace payload (often `messages`, `trace_url`, and extras)
- `status` (`string`) `completed`, `error`, `pending`, `running`, `cancelled`, or `not_started`
- `annotation` (`string | null`) human note added in the UI
- `correction_history` (`list | null`) append-only manual edit history for score/annotation edits (`field`, `before`, `after`, `timestamp`)

`Score` shape:

- `key` (`string`) score name
- `value` (`number | null`) numeric score (optional)
- `passed` (`bool | null`) pass/fail flag (optional)
- `notes` (`string | null`) extra context

At least one of `value` or `passed` is always present on each score.

### Parsing Recipes (Python)

```python
import json

# From: ezvals run evals/ --json > run.json
#   or: ezvals export .ezvals/sessions/default/a1b2c3d4.jsonl -f json -o run.json
with open("run.json") as f:
    run = json.load(f)

results = run["results"]
```

Find failing evals (has any `passed == False`):

```python
failing = [
    row for row in results
    if any(score.get("passed") is False for score in (row["result"].get("scores") or []))
]
```

Find execution errors (`result.error` present):

```python
errors = [row for row in results if row["result"].get("error")]
```

Filter by error text:

```python
timeout_errors = [
    row for row in results
    if "timeout" in (row["result"].get("error") or "").lower()
]
```

Extract one score key across results:

```python
def score_for(row, key):
    for score in (row["result"].get("scores") or []):
        if score["key"] == key:
            return score
    return None

pass_values = [
    (row["function"], score_for(row, "pass"))
    for row in results
]
```

Average numeric score for a key:

```python
vals = []
for row in results:
    score = score_for(row, "pass")
    if score and score.get("value") is not None:
        vals.append(score["value"])

avg_pass = (sum(vals) / len(vals)) if vals else None
```

Find rows with manual corrections:

```python
corrected = [row for row in results if row["result"].get("correction_history")]
```

Inspect the latest correction per row:

```python
for row in corrected:
    latest = row["result"]["correction_history"][-1]
    print(row["function"], latest["field"], latest["before"], "->", latest["after"])
```

## Workflow: Agent Runs, User Reviews

A typical workflow when an agent runs evals for a user:

```bash
# 1. Agent runs evals headlessly
ezvals run evals/ --session feature-testing --run-name after-changes

# 2. Agent serves results for user to review
ezvals serve evals/ --session feature-testing
```

The agent should inform the user:
> "I've run the evaluations. Results are available at http://localhost:8000 for you to review."

### With Auto-Run

If the user wants fresh results in the UI:

```bash
ezvals serve evals/ --session feature-testing --run
```

This runs all evals and opens the UI with live results streaming in.

## Comparing Runs

In the web UI, when a session has multiple runs:

1. Click **+ Compare** in the stats bar
2. Select runs to compare (up to 4)
3. View grouped bar charts showing metrics across runs
4. Compare outputs in a table with per-run columns

This makes it easy to see:
- Which run performed best
- Where regressions occurred
- How changes affected specific test cases

## Exporting Results

### From CLI

```bash
# Export to Markdown (good for reports)
ezvals export .ezvals/sessions/default/a1b2c3d4.jsonl -f md -o report.md

# Export to CSV (includes an annotation column)
ezvals export .ezvals/sessions/default/a1b2c3d4.jsonl -f csv -o results.csv

# Full run as one JSON document (default output: <run_name>.json)
ezvals export .ezvals/sessions/default/a1b2c3d4.jsonl -f json
```

### From Web UI

Open the overflow (three-dot) menu in the header, then hover **Download** to export:
- **JSON**: The full run as one document
- **CSV**: Flat format for spreadsheets
- **Markdown**: ASCII charts + table (respects current filters)
- **PNG**: Chart image with stats bars, metrics, and branding

## Configuration

Optionally create `ezvals.json` in your project root for defaults (it's never created automatically, only when settings are saved from the UI):

```json
{
  "concurrency": 4,
  "timeout": 120,
  "port": 8000
}
```

CLI flags always override config values.

## Best Practices

1. **Always use sessions for related runs** - Makes comparison easy
2. **Use descriptive run names** - You'll thank yourself later
3. **Serve results for user review** - Don't just dump JSON
4. **Run with concurrency** - `--concurrency 4` speeds up large suites
5. **Use `--verbose` during development** - Surface eval stdout/logging and errors quickly
6. **Use `--json` to analyze results** - Parse stdout instead of reading run files
7. **Commit the session name** - Include it in PR descriptions for traceability
