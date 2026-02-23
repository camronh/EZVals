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
| `ezvals run` | Headless execution for CI/agents | Minimal stdout, JSON file |
| `ezvals serve` | Interactive browser UI — can **both run AND view** evals | Web interface at localhost:8000 |

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
# Auto-generated session and run names
ezvals run evals/
# Creates: .ezvals/sessions/default/swift-falcon_a1b2c3d4.json
```

### Rename an Existing Saved Run

Use run-id based rename mode when you want to update a run name from scripts or terminal workflows.

```bash
# Rename by run_id
ezvals run --rename run123 better-name

# Restrict lookup to one session
ezvals run --rename run123 better-name --session model-comparison
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

# Set timeout
ezvals run evals/ --timeout 60.0

# Show verbose output
ezvals run evals/ --verbose

# Save to a custom path
ezvals run evals/ --output results.json
```

### Output Options

```bash
# Save to custom path
ezvals run evals/ --output results.json

# Output JSON to stdout (no file)
ezvals run evals/ --no-save
```

## Temporary Ad-Hoc Runs (No Saved Files)

When you want a quick one-off eval (for example, testing an idea in a temp script) and do **not** want to persist run files, use the SDK `run(...)` with `no_save=True`.

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
        path=__file__,   # run evals defined in this temp script
        no_save=True,    # do not write a run JSON file
        verbose=True,
    )
    print(result["summary"]["total_evaluations"])
```

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
# Option 1: Pass the run JSON file directly
ezvals serve .ezvals/sessions/default/baseline_a1b2c3d4.json

# Option 2: Load a session and pick runs from the dropdown
ezvals serve evals/ --session my-experiment
```

If the original eval source file still exists, you can rerun evaluations. If the source was moved or deleted, it works in view-only mode.

### Custom Port

```bash
ezvals serve evals/ --port 3000
```

## Results Storage

Results are saved to `.ezvals/sessions/` organized by session, with the pattern `{run_name}_{run_id}.json`:

```
.ezvals/sessions/
├── model-comparison/
│   ├── baseline_a1b2c3d4.json
│   └── improved_e5f6g7h8.json
└── default/
    └── swift-falcon_i9j0k1l2.json
```

### JSON Structure

```json
{
  "session_name": "model-comparison",
  "run_name": "baseline",
  "run_id": "2024-01-15T10-30-00Z",
  "total_evaluations": 50,
  "total_passed": 45,
  "total_errors": 2,
  "results": [...]
}
```

### `results[*]` / `EvalResult` Output Schema

Each item in `results` has run metadata plus a `result` object that matches `EvalResult`:

```json
{
  "function": "test_answer_quality",
  "dataset": "customer-service",
  "labels": ["prod", "regression"],
  "result": {
    "input": "User asks for refund policy",
    "output": "You can request a refund within 30 days.",
    "reference": "Refunds are allowed within 30 days",
    "scores": [
      {"key": "pass", "passed": true, "value": 1.0, "notes": null},
      {"key": "tone", "passed": true, "value": 0.9, "notes": "Professional"}
    ],
    "error": null,
    "latency": 0.42,
    "metadata": {"model": "gpt-4o-mini"},
    "trace_data": {"trace_url": "https://trace.example/run/123"}
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
- `correction_history` (`list | null`) append-only manual edit history for score/note edits (`field`, `before`, `after`, `timestamp`)

`Score` shape:

- `key` (`string`) score name
- `value` (`number | null`) numeric score (optional)
- `passed` (`bool | null`) pass/fail flag (optional)
- `notes` (`string | null`) extra context

At least one of `value` or `passed` is always present on each score.

### Parsing Recipes (Python)

```python
import json

with open(".ezvals/sessions/default/swift-falcon_a1b2c3d4.json") as f:
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
ezvals export .ezvals/runs/baseline.json -f md -o report.md

# Export to CSV
ezvals export .ezvals/runs/baseline.json -f csv -o results.csv
```

### From Web UI

Open the overflow (three-dot) menu in the header, then hover **Download** to export:
- **JSON**: Raw results file
- **CSV**: Flat format for spreadsheets
- **Markdown**: ASCII charts + table (respects current filters)
- **PNG**: Chart image with stats bars, metrics, and branding

## Configuration

Create `ezvals.json` in your project root for defaults:

```json
{
  "concurrency": 4,
  "results_dir": ".ezvals/sessions",
  "port": 8000
}
```

CLI flags always override config values.

## Best Practices

1. **Always use sessions for related runs** - Makes comparison easy
2. **Use descriptive run names** - You'll thank yourself later
3. **Serve results for user review** - Don't just dump JSON
4. **Run with concurrency** - `--concurrency 4` speeds up large suites
5. **Use `--verbose` during development** - Surface eval stdout/logging quickly
6. **Commit the session name** - Include it in PR descriptions for traceability
