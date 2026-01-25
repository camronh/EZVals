# Running and Analyzing Evals

How to run evaluations, manage sessions, and serve results for review.

## Quick Start

```bash
# Run evals and save results
ezvals run evals/ --session my-experiment --run-name baseline

# Serve results for the user to review in the browser
ezvals serve evals/ --session my-experiment
```

## Two Modes: Run vs Serve

| Command | Purpose | Output |
|---------|---------|--------|
| `ezvals run` | Headless execution for CI/agents | Minimal stdout, JSON file |
| `ezvals serve` | Interactive browser UI | Web interface at localhost:8000 |

### When to Use Each

**Use `run` when:**
- Running in CI/CD pipelines
- Agent needs to parse results programmatically
- Batch execution without human review

**Use `serve` when:**
- User wants to review results visually
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
# Creates: .ezvals/runs/swift-falcon_2024-01-15T10-30-00Z.json
```

## Running Evals

### Basic Run

```bash
# Run all evals in a directory
ezvals run evals/

# Run a specific file
ezvals run evals/customer_service.py

# Run a specific function
ezvals run evals/customer_service.py::test_refund
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

# Rich visual output with progress table
ezvals run evals/ --visual
```

### Output Options

```bash
# Save to custom path
ezvals run evals/ --output results.json

# Output JSON to stdout (no file)
ezvals run evals/ --no-save
```

## Serving Results for Review

After running evals, serve them for the user to review in the browser.

### Basic Serve

```bash
# Serve with the same session to see results
ezvals serve evals/ --session my-experiment
```

This opens `http://localhost:8000` where the user can:
- View all eval results in a table
- Click into individual results for details
- Filter by dataset, label, or status
- Compare runs side-by-side
- Export to JSON, CSV, or Markdown

### Run on Startup

To run evals AND open the UI in one command:

```bash
ezvals serve evals/ --session my-experiment --run
```

The `--run` flag automatically runs all evals when the server starts.

### Loading Previous Results

```bash
# Load a specific run file
ezvals serve .ezvals/runs/baseline_2024-01-15T10-30-00Z.json

# Load latest results
ezvals serve .ezvals/runs/latest.json
```

### Custom Port

```bash
ezvals serve evals/ --port 3000
```

## Results Storage

Results are saved to `.ezvals/runs/` with the pattern `{run_name}_{timestamp}.json`:

```
.ezvals/runs/
├── baseline_2024-01-15T10-30-00Z.json
├── improved_2024-01-15T11-00-00Z.json
├── swift-falcon_2024-01-15T14-45-00Z.json
└── latest.json  # Copy of most recent
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

Click the download icon in the header to export:
- **JSON**: Raw results file
- **CSV**: Flat format for spreadsheets
- **Markdown**: ASCII charts + table (respects current filters)

## Configuration

Create `ezvals.json` in your project root for defaults:

```json
{
  "concurrency": 4,
  "results_dir": ".ezvals/runs",
  "port": 8000
}
```

CLI flags always override config values.

## Best Practices

1. **Always use sessions for related runs** - Makes comparison easy
2. **Use descriptive run names** - You'll thank yourself later
3. **Serve results for user review** - Don't just dump JSON
4. **Run with concurrency** - `--concurrency 4` speeds up large suites
5. **Use `--visual` during development** - Easier to see what's happening
6. **Commit the session name** - Include it in PR descriptions for traceability
