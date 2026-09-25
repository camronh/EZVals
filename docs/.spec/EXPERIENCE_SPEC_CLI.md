# CLI Experience Specification

This document specifies the command-line interface experience for EZVals.

---

## Commands Overview

| Command | Purpose |
|---------|---------|
| `ezvals run` | Execute evaluations headlessly (for agents/CI) |
| `ezvals serve` | Start web UI for interactive use |
| `ezvals regrade` | Re-score a run's stored outputs without re-running targets |
| `ezvals query` | Query saved runs with SQL |
| `ezvals export` | Export a run to various formats (JSON, CSV, Markdown) |

---

## `ezvals run`

**Intent:** User wants to execute evaluations from the command line with minimal output optimized for agents.

### Path Specifications

```gherkin
Scenario: Run all evaluations in a directory
  When the user runs `ezvals run evals/`
  Then all evals in .py and *.eval.ts files under evals/ are discovered, in every language present
  And all evaluations within the evals/ path execute
  And results save to .ezvals/sessions/default/{run_id}.jsonl by default

Scenario: Run a specific file
  When the user runs `ezvals run evals/customer_service.py`
  Then only evaluations in that file run

Scenario: Run a specific function
  When the user runs `ezvals run evals.py::test_refund`
  Then only test_refund runs

Scenario: Run a specific list of functions
  When the user runs `ezvals run evals.py::test_refund,test_escalation`
  Then only test_refund and test_escalation run

Scenario: Run a case variant
  When the user runs `ezvals run evals.py::test_math[low]`
  Then only that specific variant runs

Scenario: Run specific case IDs with intuitive selectors
  When the user runs `ezvals run evals.py::test_math@low,test_math@high`
  Then only case variants `test_math[low]` and `test_math[high]` run
```

### Filtering Options

```gherkin
Scenario: Filter by dataset
  When the user runs `ezvals run evals/ --dataset customer_service`
  Then only evaluations with dataset="customer_service" run

Scenario: Filter by multiple datasets (comma-separated)
  When the user runs `ezvals run evals/ --dataset qa,customer_service`
  Then evaluations with dataset="qa" OR dataset="customer_service" run

Scenario: Filter by label
  When the user runs `ezvals run evals/ --label production`
  Then only evaluations containing "production" in labels run

Scenario: Multiple labels (OR logic)
  When the user runs `ezvals run evals/ --label a --label b`
  Then evaluations with label "a" OR "b" run

Scenario: Combined filtering (AND logic between types)
  When the user runs `ezvals run evals/ --dataset qa --label production`
  Then evaluations must match: (dataset=qa) AND (has label "production")

Scenario: Limit evaluation count
  When the user runs `ezvals run evals/ --limit 10`
  Then at most 10 evaluations run
```

### Execution Options

```gherkin
Scenario: Run with concurrency
  When the user runs `ezvals run evals/ --concurrency 4`
  Then up to 4 evaluations run in parallel

Scenario: Run with timeout
  When the user runs `ezvals run evals/ --timeout 30.0`
  Then evaluations exceeding 30 seconds terminate with timeout error

Scenario: Run every eval several times
  When the user runs `ezvals run evals/ --trials 5`
  Then every eval runs 5 times (overriding each eval's own trials)
  And the run reports pass@5 and pass^5 (see the Python spec's Trials section)
```

### Output Options

```gherkin
Scenario: Default output
  When the user runs `ezvals run evals/`
  Then stderr shows a header with the path, session and run name
  And one line per eval function as soon as all its results are in, grouped under its file
  And a failures section, then a summary (see Output Formats)
  And stdout is empty

Scenario: Colors
  Given stderr is a terminal and NO_COLOR is not set
  Then outcome marks are colored (✓ green, ✗ red, ◐ yellow, ! magenta) and metadata is dim
  Otherwise the output is plain text

Scenario: Quiet output
  When the user runs `ezvals run evals/ -q`
  Then stderr shows only the summary

Scenario: JSON output for agents and scripts
  When the user runs `ezvals run evals/ --json`
  Then the results are saved as usual
  And stdout is the run JSON (ids, names, totals, results) plus "saved_path"
  And the human output still goes to stderr, so stdout stays machine-readable

Scenario: Verbose output
  When the user runs `ezvals run evals/ --verbose`
  Then print statements from eval functions appear on stderr
  And the failures section shows each error's full traceback instead of its first line

Scenario: Custom output path
  When the user runs `ezvals run evals/ --output results.json`
  Then the run JSON saves only to results.json
  And nothing saves to .ezvals/sessions/

Scenario: No save (stdout JSON)
  When the user runs `ezvals run evals/ --no-save`
  Then the run JSON outputs to stdout
  And no file is written
```

### Session & Run Management

```gherkin
Scenario: Named session and run
  When the user runs `ezvals run evals/ --session model-upgrade --run-name baseline`
  Then results save to .ezvals/sessions/model-upgrade/{run_id}.jsonl with run_name "baseline"

Scenario: No session specified (CLI run)
  When the user runs `ezvals run evals/`
  Then session defaults to "default"
  And results save to .ezvals/sessions/default/{run_id}.jsonl

Scenario: No run name specified
  When the user runs `ezvals run evals/ --session emojis`
  Then run name auto-generates as friendly adjective-noun (e.g., "swift-falcon")

Scenario: Overwrite behavior (same session + run name)
  Given overwrite=true in ezvals.json (default)
  When the user runs `ezvals run evals/ --session upgrade --run-name gpt5` twice
  Then the second run REPLACES the first
  And only one run named gpt5 exists in the session

Scenario: No overwrite (when disabled)
  Given overwrite=false in ezvals.json
  When the user runs `ezvals run evals/ --session upgrade --run-name gpt5` twice
  Then both runs are kept

Scenario: Rename an existing run by ID
  Given run "run123" exists
  When the user runs `ezvals run --rename run123 better-name`
  Then the run's `run_name` becomes "better-name"
  (Run names are trimmed and may contain spaces and punctuation; session names keep only letters, digits, `-` and `_`)

Scenario: Rename run not found
  When the user runs `ezvals run --rename missing-id better-name`
  Then CLI exits non-zero with a clear "run not found" error
```

### Output Formats

**Default Example:**
```
ezvals run evals/  (session default · run vivid-dragon)

evals/basics.py
  ✓ capital_pass   0.2s
  ✗ capital_fail   0.3s
  ◐ capitals       0.5s  1/2 cases
  ! crashes        0.0s
  ◐ flaky          1.2s  1/4 trials  pass@4 ✓  pass^4 ✗
  ○ similarity     0.1s  sim 0.85

── failures ──
✗ capital_fail  evals/basics.py
  pass: assert ctx.output == ctx.reference
  input: "Capital of Spain?"  output: "I don't know"
✗ capitals[1]  evals/basics.py
  pass: wrong
  input: "b"  output: "b"
! crashes  evals/basics.py
  RuntimeError: upstream 500
  input: "x"  output: null
✗ flaky~2  evals/basics.py
  pass: failed
  input: "x"  output: "x"
...

3 passed  5 failed  1 error  1 scored  (10 results · 6 evals · 1.4s)
pass 38% · sim 0.85 · pass@4 100% · pass^4 0%
Saved to .ezvals/sessions/default/a1b2c3d4.jsonl · view: ezvals serve .ezvals/sessions/default/a1b2c3d4.jsonl
```

Each result is **passed** (finished, no error, at least one pass/fail score and none failed), **failed** (a pass/fail score failed), **error**, or **scored** (only numeric scores). A function line folds its cases and trials:

| Mark | Meaning |
|------|---------|
| ✓ | Every result passed |
| ✗ | None passed |
| ◐ | Some passed, some failed or errored |
| ! | Every result errored |
| ○ | Only numeric scores |

The line shows the total latency, then `passed/total cases` (or `trials`, or `results` for cases × trials; `N cases` when only numeric), pass@k/pass^k for trials of a single case, and score averages (pass/fail keys as a pass rate) when the eval has numeric or several keys. The failures section lists each failed or errored result (at most 20, then "… and N more") with its error's first line or each failing score as `key: notes` (`key: failed` without notes), then its input and output (truncated). The summary counts results by kind, then averages every score key; pass@k/pass^k appear for trials. The run JSON's `total_passed` and `total_failed` use the same definitions (as do pass@k/pass^k).

---

## `ezvals serve`

**Intent:** User wants an interactive web interface to view, run, and analyze evaluations.

```gherkin
Scenario: Start web UI
  When the user runs `ezvals serve evals/`
  Then server starts at http://127.0.0.1:8000
  And browser opens automatically by default
  And evaluations are discovered but NOT auto-run

Scenario: Start web UI without opening browser
  When the user runs `ezvals serve evals/ --no-open`
  Then server starts at http://127.0.0.1:8000
  And browser does not open automatically
  And evaluations are discovered but NOT auto-run

Scenario: Session auto-generation (serve command)
  When the user runs `ezvals serve evals/` without --session
  Then a session name auto-generates (e.g., "calm-dragon")
  And each serve command creates a new session
  Note: This differs from CLI run which defaults to "default"

Scenario: Named session
  When the user runs `ezvals serve evals/ --session emojis`
  Then the session is set to "emojis"
  And all runs in this UI session save to .ezvals/sessions/emojis/

Scenario: Custom port
  When the user runs `ezvals serve evals/ --port 3000`
  Then server starts at http://127.0.0.1:3000

Scenario: Filter in UI
  When the user runs `ezvals serve evals/ --dataset qa --label production`
  Then only matching evaluations appear in UI

Scenario: Auto-run evaluations on startup
  When the user runs `ezvals serve evals/ --run`
  Then server starts and browser opens by default
  And evaluations automatically start running (same as clicking Run)
  And results stream in real-time

Scenario: Auto-run with filters
  When the user runs `ezvals serve evals/ --dataset testing --run`
  Then only evaluations with dataset="testing" appear in UI
  And only those filtered evaluations auto-run

Scenario: Open an existing run by run name
  Given session "model-comparison" has a run named "baseline"
  When the user runs `ezvals serve evals.py --session model-comparison --run-name baseline`
  Then the UI opens with that existing run loaded as active
  And rerun settings (path/dataset/labels/function filter) come from the saved run metadata

Scenario: Pending run name when run does not exist
  Given session "model-comparison" does not have a run named "next-attempt"
  When the user runs `ezvals serve evals.py --session model-comparison --run-name next-attempt`
  Then the UI starts normally from discovered evals
  And the next run uses "next-attempt" as the pending run name

Scenario: Start in comparison mode from CLI
  Given session "model-comparison" has runs "baseline" and "improved"
  When the user runs `ezvals serve evals.py --session model-comparison --compare-runs baseline,improved`
  Then the UI starts in comparison mode with both runs preselected
  And the active run is the first resolved compare run unless --run-name resolves to one of them
  And the opened URL includes readable `compare_run_id` query params

Scenario: Start with search and filter presets
  When the user runs `ezvals serve evals.py --search auth --annotation yes --has-error`
  Then the UI opens with those filters and search already applied
  And the opened URL includes readable query params (`search`, `annotation`, `has_error`)

Scenario: compare-runs validation
  When the user runs `ezvals serve evals.py --session my-session --compare-runs baseline`
  Then CLI errors because at least two run names are required
  And no server starts

Scenario: compare-runs missing run name
  When the user runs `ezvals serve evals.py --session my-session --compare-runs baseline,missing`
  Then CLI errors because "missing" does not exist in that session
  And no server starts

Scenario: Load an existing run file
  When the user runs `ezvals serve .ezvals/sessions/default/a1b2c3d4.jsonl`
  Then server starts and browser opens by default
  And the UI displays results from that run
  And if source eval path exists, rerun is enabled
  And if source eval path is missing, UI shows "view-only mode" warning

Scenario: Continue previous session
  Given a run was saved with source path "evals/test.py"
  When the user runs `ezvals serve .ezvals/sessions/my-session/a1b2c3d4.jsonl`
  And "evals/test.py" still exists
  Then the Run button works normally
  And new runs save to the same session
```

---

## `ezvals regrade`

**Intent:** User changed a grader and wants new scores for an existing run without re-running the agent.

```gherkin
Scenario: Regrade a saved run
  When the user runs `ezvals regrade a1b2c3d4` (a run id or a run file)
  Then finished results of evals that have a target are scored again, without running the target
  And results of evals without a target are skipped, with a count printed to stderr
  And the new scores are saved to the same run

Scenario: Eval source is gone
  Given the run's eval path no longer exists
  Then the command fails: regrading runs the eval code again
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-c, --concurrency` | int | config | Results to regrade in parallel |
| `-v, --verbose` | flag | false | Show eval output and errors |
| `--json` | flag | false | Print the regraded run JSON |

---

## `ezvals query`

**Intent:** User (often a coding agent) wants to analyze results across runs.

```gherkin
Scenario: Query runs with SQL
  When the user runs `ezvals query "SELECT run_name, total_passed FROM runs"`
  Then every saved run is loaded into an in-memory SQLite database
  And the rows print as a table (or JSON with --json)

Scenario: See the tables
  When the user runs `ezvals query --schema`
  Then the tables (runs, results, scores, spans) and example queries are printed
```

---

## `ezvals export`

**Intent:** User wants to export a run file to various formats (for sharing, reporting, or further analysis). Run files from older versions (`.json`) are accepted too.

```gherkin
Scenario: Export to JSON
  When the user runs `ezvals export a1b2c3d4.jsonl -f json -o report.json`
  Then report.json holds the whole run as one JSON document (ids, names, totals, results)

Scenario: Export to CSV
  When the user runs `ezvals export a1b2c3d4.jsonl -f csv`
  Then a CSV file is created with all results
  And filename defaults to {run_name}.csv

Scenario: Export to Markdown
  When the user runs `ezvals export a1b2c3d4.jsonl -f md`
  Then a markdown file is created with:
    - Header with run name
    - ASCII bar chart for scores (e.g., "████████░░ 80%")
    - Stats summary
    - Markdown table of all results
  And filename defaults to {run_name}.md
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-f, --format` | choice | json | Export format: json, csv, md |
| `-o, --output` | path | auto | Output file path |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Evaluations completed (regardless of pass/fail) |
| 1 | Invalid arguments, path does not exist, or an eval file failed to import |
| 2 | Usage error: unknown command or flag (the usage is printed) |
| 4 | No evals matched the path, selector and filters (like pytest's "no tests collected") |

**Note:** Failed evaluations do NOT cause non-zero exit. Check JSON output for pass/fail status.

---

## Configuration File (`ezvals.json`)

```json
{
  "concurrency": 1,
  "timeout": null,
  "verbose": false,
  "results_dir": ".",
  "overwrite": true,
  "configs": {
    "gpt-4": {"model": "gpt-4", "temperature": 0.7},
    "claude": {"model": "claude-3-opus", "temperature": 0.5}
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `concurrency` | int | 1 | Parallel evaluations |
| `trials` | int | none | Run every eval this many times |
| `timeout` | float | null | Global timeout (seconds) |
| `verbose` | bool | false | Show eval stdout |
| `port` | int | 8000 | Default port for `ezvals serve` |
| `completion_notifications` | bool | false | Browser notification when a UI run finishes |
| `results_dir` | string | `.` | Base directory where runs are stored in `.ezvals/sessions` |
| `overwrite` | bool | true | Replace runs with same session + run name |
| `configs` | dict | `{}` | Named config profiles selectable via `--config` |

**Precedence:** CLI flags > Config file > Defaults

`ezvals.json` is only created when settings are saved from the UI.

### Run Configs

**Intent:** User wants to run the same evals against different configurations (models, temperatures, etc.) without changing code.

```gherkin
Scenario: Run with named config
  Given ezvals.json has configs.gpt-4 = {"model": "gpt-4", "temperature": 0.7}
  When the user runs `ezvals run evals/ --config gpt-4`
  Then ctx.config contains {"model": "gpt-4", "temperature": 0.7} in all eval functions
  And run_name defaults to "gpt-4" when --run-name is not specified
  And saved run JSON includes config_name: "gpt-4"

Scenario: Run with config and explicit run name
  When the user runs `ezvals run evals/ --config gpt-4 --run-name baseline`
  Then run_name is "baseline" (explicit --run-name wins)

Scenario: Invalid config name
  When the user runs `ezvals run evals/ --config nonexistent`
  Then error lists available config names from ezvals.json

Scenario: No config specified (backward compat)
  When the user runs `ezvals run evals/`
  Then ctx.config is {} in all eval functions
  And behavior is unchanged from before
```

---

## CLI Errors

```gherkin
Scenario: Path does not exist
  When `ezvals run nonexistent.py`
  Then output: "Error: Path nonexistent.py does not exist"
  And exit code: 1

Scenario: Invalid path type
  When `ezvals run some_file.txt`
  Then output: "Error: Path some_file.txt is neither an eval file nor a directory"
  And exit code: 1

Scenario: No evaluations found
  When running on a file with no @eval functions, or filters that match none
  Then output: "No evals found in {path}" (naming the filters when some were given)
  And with --json or --no-save, stdout is the run JSON with no results
  And exit code: 4

Scenario: Selector matches nothing
  When `ezvals run evals.py::tset_refund` and evals.py defines test_refund
  Then output: "No evals match 'tset_refund' in evals.py. Did you mean test_refund?"
  (the closest function name or case id, by edit distance or prefix)
  And exit code: 4

Scenario: Concurrency set to zero
  When `ezvals run evals/ --concurrency 0`
  Then error: "Error: concurrency must be at least 1, got 0"
  And exit code: 1

Scenario: Eval file fails to import
  When an eval file raises on import (syntax error, missing module, ...)
  Then the error and traceback are printed
  And exit code: 1

Scenario: Discovery fails with --json
  When `ezvals run evals/ --json` (or --no-save) and the path is missing or a file fails to import
  Then stdout is still JSON: {"error": "<message>", "results": []}
  And exit code: 1

Scenario: Help
  When the user runs `ezvals COMMAND -h`
  Then each flag prints once as `-s, --long VALUE  description`, with no bogus defaults
```

---

## Flags Reference

### `ezvals run`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-d, --dataset` | str | all | Filter by dataset(s), comma-separated |
| `-l, --label` | str (multiple) | all | Filter by label |
| `--limit` | int | none | Max evaluations to run |
| `-c, --concurrency` | int | 1 | Parallel evaluations |
| `--timeout` | float | none | Global timeout (seconds) |
| `--trials` | int | per eval | Run every eval this many times |
| `-v, --verbose` | flag | false | Show eval stdout and full error tracebacks |
| `-q, --quiet` | flag | false | Print only the summary |
| `-o, --output` | path | auto | Custom output path |
| `--no-save` | flag | false | JSON to stdout only |
| `--json` | flag | false | Also print the run JSON (with `saved_path`) to stdout |
| `--session` | str | default | Session name |
| `--run-name` | str | auto | Run name |
| `--rename` | str | none | `--rename RUN_ID NEW_NAME` renames a saved run |
| `--config` | str | none | Named config profile from ezvals.json |

### `ezvals serve`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-d, --dataset` | str | all | Filter by dataset |
| `-l, --label` | str (multiple) | all | Filter by label |
| `--port` | int | 8000 | Server port |
| `--session` | str | auto | Session name |
| `--run-name` | str | auto | Run name |
| `--compare-runs` | str | none | Comma-separated run names for startup comparison mode (2-4) |
| `--search` | str | none | Initial search query |
| `--has-error/--no-has-error` | bool | none | Initial error presence filter |
| `--has-url/--no-has-url` | bool | none | Initial trace URL filter |
| `--has-messages/--no-has-messages` | bool | none | Initial trace messages filter |
| `--annotation` | any\|yes\|no | any | Initial annotation filter |
| `--results-dir` | path | . | Base directory for `.ezvals/sessions` |
| `--run` | flag | false | Auto-run all evals on startup |
| `--open/--no-open` | bool | open | Open browser automatically on startup |
| `--config` | str | none | Named config profile from ezvals.json |
