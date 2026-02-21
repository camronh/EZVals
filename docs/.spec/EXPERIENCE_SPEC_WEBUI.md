# Web UI Experience Specification

This document specifies the web interface experience for EZVals.

---

## Starting the UI

```bash
ezvals serve evals/
```

Starts at `http://127.0.0.1:8000` (browser opens by default unless `--no-open` is used). Evaluations are discovered but not auto-run.

---

## Main Table View

### Initial State

```gherkin
Scenario: View discovered evaluations
  Given the UI starts with `ezvals serve evals/`
  When the browser opens
  Then all discovered evaluations are listed
  And each row shows: function name, dataset, labels, status
  And status is "not_started" for all rows
```

### Table Sorting

```gherkin
Scenario: Sort by scores column
  Given results are displayed in the table
  When the user clicks the Scores column header
  Then rows sort by aggregate score (pass ratio or average value)
  And clicking again reverses the sort order
```

### Run Button (Single Action)

The top-right run control is a single stable action button.

```gherkin
Scenario: Stable run button label
  Given the UI is open
  When the user views the Run button
  Then the button label is "Run" when idle
  And the button label is "Stop" while a run is active

Scenario: Selective run with checkboxes
  Given some evaluations are checked
  When the user clicks "Run"
  Then only the selected evaluations run
  And results update in place for the current run

Scenario: Run behavior
  When the user clicks "Run"
  Then the current run is overwritten
  And the run_name stays the same
  And the timestamp updates

Scenario: New run from stats panel
  Given the stats panel shows the current run name
  When the user clicks the new-run icon next to the run name
  Then a new run file is created with an auto-generated friendly name
  And the new run has no completed results yet
```

### Run Execution

```gherkin
Scenario: Run all evaluations
  Given evaluations are displayed
  When the user clicks Run with nothing selected
  Then all evaluations begin running
  And results stream in real-time as each completes
  And progress indicators update live

Scenario: Run selected evaluations
  Given the user selects rows via checkboxes
  When the user clicks Run
  Then only selected evaluations run
  And unselected rows retain their previous results

Scenario: Stop running evaluations
  Given evaluations are currently running
  When the user clicks Stop
  Then pending and running evaluations are marked "cancelled" immediately

Scenario: Pause and resume running evaluations
  Given evaluations are currently running
  When the user clicks Pause
  Then currently running evaluations complete
  And no new evaluations start
  And remaining queued evaluations stay pending

  When the user clicks Resume
  Then pending evaluations continue running from where the run paused

Scenario: Reload server from UI
  Given the UI is open
  When the user clicks "Reload Server"
  Then the current serve process is restarted
  And it comes back on the same port with the same serve command arguments
```

### Result Status Indicators

| Status | Visual | Meaning |
|--------|--------|---------|
| `not_started` | Gray | Never run |
| `pending` | Yellow spinner | Queued |
| `running` | Blue spinner | Currently executing |
| `completed` | Green check | Finished successfully |
| `error` | Red X | Exception occurred |
| `cancelled` | Gray slash | Stopped by user |

---

## Detail View

```gherkin
Scenario: Open detail view
  Given an evaluation has completed
  When the user clicks the function name
  Then a full-page detail view opens
  At URL: /runs/{run_id}/results/{index}

Scenario: Detail view contents
  Given the detail view is open
  Then user sees:
    - Input (expandable JSON)
    - Output (expandable JSON)
    - Reference (if set)
    - Scores (with key, value/passed, notes)
    - Metadata (expandable key-value list with formatted labels and clickable links)
    - Run Data (expandable JSON)
    - Annotations (editable)
    - Tools used (unique tool names from trace_data.messages tool calls, if present)
    - Latency
    - Error message (if any)

Scenario: Message-format data rendering
  Given the detail view is open
  And input, output, reference, or trace messages contain chat-style message arrays
  When the UI detects common message schemas (OpenAI, Anthropic, or text/message variants)
  Then those sections default to a pretty chat-style rendering
  And each section provides a Pretty/Raw toggle
  And Raw shows the underlying JSON payload without transformation

Scenario: Output loading state during active run
  Given the detail view is open
  And the selected result status is pending or running
  Then the Output panel shows an animated loading state
  And stale output text is hidden until the result reaches completed or error
```

### Navigation

```gherkin
Scenario: Navigate between results
  Given the user is on a detail page
  When the user presses ↑ (up arrow)
  Then the previous result loads

  When the user presses ↓ (down arrow)
  Then the next result loads

  When the user presses Escape
  Then the user returns to the main table
```

---

## Inline Editing

### Annotation Editing

The annotation section in the detail view sidebar allows adding, editing, and removing annotations.

```gherkin
Scenario: Add annotation via pencil icon
  Given the detail view is open
  And no annotation exists
  When the user clicks the pencil icon next to "Annotation"
  Then a textarea appears with placeholder "Add annotation..."
  And Save/Cancel buttons appear

Scenario: Add annotation via placeholder link
  Given the detail view is open
  And no annotation exists
  When the user clicks "+ Add annotation"
  Then the textarea edit mode activates

Scenario: Save annotation
  Given the user is editing an annotation
  When the user types text and clicks Save
  Then the annotation saves to the JSON file via PATCH API
  And a correction_history entry is appended with field="annotation", before, after, and timestamp
  And the view returns to read-only mode showing the annotation text
  And the annotation persists across page reloads

Scenario: Cancel annotation edit
  Given the user is editing an annotation
  When the user clicks Cancel (or presses Escape)
  Then changes are discarded
  And the view returns to read-only mode

Scenario: Clear annotation
  Given an annotation exists
  When the user edits and clears all text, then saves
  Then the annotation is removed (set to null)
  And the placeholder "+ Add annotation" reappears

Scenario: Keyboard navigation disabled while editing
  Given the user is editing an annotation
  When the user presses arrow keys or Escape
  Then arrow keys work normally in textarea (no result navigation)
  And Escape cancels edit instead of navigating back
  And footer shows "Esc cancel" instead of "Esc back"
```

**Annotation UI States:**
- **View mode (no annotation)**: Shows clickable "+ Add annotation" link
- **View mode (has annotation)**: Shows annotation text with pencil edit icon in header
- **Edit mode**: Shows textarea with Save/Cancel buttons
- **Saving**: Shows spinner on Save button, buttons disabled

**Editable Fields:**
- Annotations (via textarea with explicit save)
- Scores (via per-score inline edit controls in detail sidebar)

**Read-Only Fields:**
- Input
- Output
- Reference
- Dataset
- Labels
- Metadata
- Run Data
- Latency
- Error

### Score Editing

The scores section in the detail view sidebar allows editing each score entry inline.

```gherkin
Scenario: Edit score from score card
  Given the detail view is open
  And one or more scores are shown in the sidebar
  When the user clicks the pencil icon on a score card
  Then inline edit controls appear for that score
  And boolean scores only show boolean controls
  And value scores only show value controls
  And Save/Cancel buttons appear

Scenario: Save score edits
  Given the user is editing a score
  When the user updates fields and clicks Save
  Then the scores save to the JSON file via PATCH API
  And a correction_history entry is appended with field="scores", before, after, and timestamp
  And the score card returns to read-only mode
  And the edits persist across page reloads
  And score type does not change (boolean stays boolean, value stays value)

Scenario: Cancel score edit
  Given the user is editing a score
  When the user clicks Cancel (or presses Escape)
  Then changes are discarded
  And the score card returns to read-only mode
```

---

## Export

The export dropdown menu in the header provides 4 export formats (JSON, CSV, Markdown, PNG).

### Raw Exports (All Data)

```gherkin
Scenario: Export as JSON
  Given evaluation results exist
  When the user clicks Export > JSON
  Then the full results JSON downloads
  With filename: {run_id}.json

Scenario: Export as CSV
  Given evaluation results exist
  When the user clicks Export > CSV
  Then a CSV downloads with columns:
    - function, dataset, labels
    - input, output, reference
    - scores, error, latency
    - metadata, trace_data, annotations
```

### Filtered Exports (Respects Filters & Column Selection)

```gherkin
Scenario: Export as Markdown
  Given evaluation results exist
  And some filters are applied
  When the user clicks Export > Markdown
  Then a markdown file downloads with:
    - Header with run name
    - ASCII bar chart for scores (e.g., "████████░░ 80%")
    - Stats summary
    - Markdown table with only visible rows and visible columns

Scenario: Export as PNG
  Given evaluation results exist
  When the user clicks Export > PNG
  Then a modal opens with a PNG preview
  And export controls are collapsed by default behind a compact options button
  And the controls include:
    - Editable title
    - Score color customization
    - Toggles for showing test count and average latency in the footer
  And the preview image shows:
    - EZVals logo and title
    - Test count (when enabled) in the bottom-left
    - Average latency (when enabled) in the bottom-left
    - Vertical bar chart for each score metric with percentages
    - EZVals logo and "ezvals.com" branding in the bottom-right
  And the image matches the current theme (dark or light)
  And the user can click Save to download the PNG
  And the user can click Copy to copy the image to clipboard

Scenario: Export as PNG in comparison mode
  Given comparison mode is active with 2+ runs
  When the user clicks Export > PNG
  Then the default title is the session name
  And the modal includes editable run names and run colors
  And the modal includes up/down controls to reorder runs
  And the PNG preview shows:
    - Run chips with colors and test counts
    - Grouped bars per metric (one bar per run, colored by run)
    - Percentage labels above each bar
    - Latency as an additional metric
```

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `↑` | Previous result | Detail view |
| `↓` | Next result | Detail view |
| `Esc` | Back to table | Detail view |

---

## Session & Run Navigation


### Run Selector

The run selector displays as a dropdown when multiple runs exist in the session, otherwise as plain text.

```gherkin
Scenario: Single run in session
  Given only one run exists in the current session
  When the user views the run name in the stats bar
  Then it displays as plain text (not a dropdown)
  And the pencil edit icon is shown next to it

Scenario: Multiple runs in session (dropdown)
  Given two or more runs exist in the current session
  When the user views the run name in the stats bar
  Then it displays as a dropdown selector
  And each option shows: run_name and formatted timestamp (e.g., "run-one (Dec 17, 9:52 AM)")
  And runs are sorted newest-first
  And the pencil edit icon is shown next to the dropdown

Scenario: Switch run via dropdown
  Given the run dropdown is visible
  When the user selects a different run
  Then that run's results load in the table
  And the dropdown updates to show the new selection

Scenario: Rename run via inline editing
  When the user clicks the pencil icon next to the run name in the stats bar
  Then the run name becomes an editable text field
  And if a dropdown was shown, it hides and the input appears in its place
  And pressing Enter or clicking the checkmark saves the new name
  And pressing Escape or clicking outside cancels the edit
  And the filename and JSON metadata update on save

Scenario: Copy session/run name
  When the user clicks on the session or run name in the stats bar
  Then the name is copied to the clipboard
  And a "Copied!" tooltip appears briefly

Scenario: Delete run
  When the user clicks delete on a run
  Then a confirmation appears
  And on confirm, the run file is deleted
  And the dropdown refreshes
```

---

## Stats Bar

The top stats bar shows session/run info, test counts, and score breakdown.

### Expanded View (default)

Shows a bar chart with score breakdown:
- Each score key has a colored bar (green ≥80%, amber ≥50%, red <50%)
- Below each bar: percentage prominent on top, ratio smaller below
  - Example: "87%" on first line, "54/62" smaller below
- Left side shows: session name, run name (dropdown if multiple runs), test count, avg latency

Compact mode is not available. The stats bar always uses expanded view.

### Dynamic Stats

```gherkin
Scenario: Stats update with filters
  Given filters or search are active
  When rows are filtered
  Then stats bar shows "filtered/total" format (e.g., "TESTS 5/20")
  And latency and score chips calculate from visible rows only
  And chips show actual filtered counts, not original totals
```

---

## Filtering

### Three-State Filters

Dataset, label, annotation, and trace data filters use a cycling toggle pattern:

| Click | State | Visual | Behavior |
|-------|-------|--------|----------|
| 1st | Include | Blue | Show only matching rows |
| 2nd | Exclude | Rose | Hide matching rows |
| 3rd | Any | Gray | No filter applied |

```gherkin
Scenario: Filter by dataset (include)
  Given the filter menu is open
  When the user clicks a dataset pill once
  Then the pill turns blue
  And only rows with that dataset are shown

Scenario: Filter by dataset (exclude)
  Given a dataset pill is blue (included)
  When the user clicks the pill again
  Then the pill turns rose with ✕ prefix
  And rows with that dataset are hidden

Scenario: Clear dataset filter
  Given a dataset pill is rose (excluded)
  When the user clicks the pill again
  Then the pill turns gray
  And all rows are shown (no dataset filter)
```

### Filter Types

| Filter | States | Description |
|--------|--------|-------------|
| Dataset | include / exclude / any | Filter by dataset name |
| Labels | include / exclude / any | Filter by label |
| Annotation | has / no / any | Filter by presence of annotation |
| Has URL | has / no / any | Filter by trace_data.url presence |
| Has Messages | has / no / any | Filter by trace_data.messages presence |
| Score Value | numeric rules | Filter by score values |
| Score Passed | boolean rules | Filter by pass/fail status |

### Filter Persistence

```gherkin
Scenario: Filters persist on navigation
  Given filters are applied
  When the user navigates to detail view and back
  Then the same filters are still applied
```

Filters are stored in sessionStorage and restored on page load.

### Search Column Scope

```gherkin
Scenario: Search scope is configurable per column
  Given the columns menu is open
  When the user toggles search on or off for a column
  Then search only matches text from columns with search enabled
  And table visibility toggles remain independent from search toggles
```

---

## REST API Endpoints

The UI is backed by these REST endpoints, also available programmatically.

### Results

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/results` | GET | HTML table view |
| `/runs/{run_id}/results/{index}` | GET | HTML detail view |
| `/api/runs/{run_id}/results/{index}` | PATCH | Update result fields |

### Run Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs/rerun` | POST | Run active eval configuration (optionally selected indices) |
| `/api/runs/pause` | POST | Pause queued execution after in-flight evals finish |
| `/api/runs/resume` | POST | Resume pending evals on a paused run |
| `/api/runs/stop` | POST | Cancel pending/running evals |
| `/api/server/restart` | POST | Restart the current `ezvals serve` process |

**Rerun Request Body:**
```json
{
  "indices": [0, 2, 5]  // Optional: specific indices to rerun
}
```

### Export

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs/{run_id}/export/json` | GET | Download JSON |
| `/api/runs/{run_id}/export/csv` | GET | Download CSV |
| `/api/runs/{run_id}/export/markdown` | POST | Download filtered Markdown |

### Sessions & Runs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all session names (from directories) |
| `/api/sessions/{name}/runs` | GET | List runs in session |
| `/api/sessions/{name}` | DELETE | Delete entire session and all runs |
| `/api/runs/{run_id}` | PATCH | Update run metadata (rename updates filename) |
| `/api/runs/{run_id}` | DELETE | Delete specific run |
| `/api/runs/{run_id}/activate` | POST | Switch active run to view/edit a different run |
| `/api/runs/new` | POST | Create a new run with a fresh run_id/run_name (no overwrite) |

### Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get ezvals.json config |
| `/api/config` | PUT | Update config |

```gherkin
Scenario: Configure completion notifications from Settings
  Given the user opens the Settings modal from the config menu
  When the user toggles "Completion notifications + sound" and clicks Save
  Then the value is persisted via `/api/config`
  And future run-complete events honor the toggle
```

---

## Error States

```gherkin
Scenario: Rerun without eval path
  Given UI started without a path somehow
  When POST /api/runs/rerun
  Then 400: "Rerun unavailable: missing eval path"

Scenario: Eval path deleted after UI start
  Given UI started with evals/ which was later deleted
  When POST /api/runs/rerun
  Then 400: "Eval path not found: evals/"

Scenario: Run not found
  When GET /runs/{invalid_run_id}/results/0
  Then 404: "Run not found"

Scenario: Result index out of range
  When GET /runs/{run_id}/results/999
  Then 404: "Result not found"
```

---

## File Storage

Results are stored in `.ezvals/sessions/` with hierarchical session directories:

```
.ezvals/
├── sessions/
│   ├── default/
│   │   └── swift-falcon_1705312200.json
│   ├── emojis/
│   │   ├── baseline_1705312300.json
│   │   └── fixed_1705312500.json
│   └── model-upgrade/
│       ├── gpt5_1705313000.json
│       └── gpt5-1_1705313200.json
└── ezvals.json
```

**File naming:** `{run_name}_{unix_timestamp}.json`
- Unix timestamps (integers) for easy sorting
- Session = directory name
- Run name = filename prefix

**Overwrite behavior:** When `overwrite=true` (default), running with the same session + run name replaces the existing file.

### JSON Schema

```json
{
  "session_name": "model-upgrade",
  "run_name": "baseline",
  "run_id": "1705312200",
  "path": "evals/",
  "total_evaluations": 50,
  "total_functions": 10,
  "total_passed": 45,
  "total_errors": 2,
  "total_with_scores": 48,
  "average_latency": 0.5,
  "results": [
    {
      "function": "test_refund",
      "dataset": "customer_service",
      "labels": ["production"],
      "result": {
        "input": "I want a refund",
        "output": "I'll help you with that",
        "reference": null,
        "scores": [{"key": "pass", "passed": true}],
        "error": null,
        "latency": 0.234,
        "metadata": {"model": "gpt-4"},
        "trace_data": {},
        "status": "completed",
        "correction_history": [
          {
            "field": "scores",
            "before": [{"key": "pass", "passed": false, "notes": "judge output"}],
            "after": [{"key": "pass", "passed": true, "notes": "human correction"}],
            "timestamp": "2026-02-20T12:34:56.000000+00:00"
          }
        ],
        "annotations": null
      }
    }
  ]
}
```

**Note:** `run_id` is a Unix timestamp (string representation of integer) for sortability.

---

## Comparison Mode

Comparison mode allows users to view and compare results from multiple runs side-by-side.

### Entering Comparison Mode

```gherkin
Scenario: Start comparing runs
  Given the user has multiple runs in the current session
  And the user is viewing a run in the stats panel
  When the user clicks the "+ Compare" button next to the run name
  Then a dropdown appears showing other available runs in the session
  And selecting a run enters comparison mode
  And both runs are shown as color-coded chips
```

### Comparison Mode UI

```gherkin
Scenario: Left panel in comparison mode
  Given comparison mode is active with 2+ runs
  Then the left panel shows:
    - Session name
    - "comparing" label
    - Color-coded chips for each run (max 4)
    - Each chip shows: color dot, run name, test count in parentheses
    - Non-primary chips have an "×" button to remove them
    - A "+" button to add more runs (if < 4 runs)
  And average latency is NOT shown (moved to chart)
  And test count is NOT shown (embedded in chips)

Scenario: Reorder compared runs
  Given comparison mode is active with 2+ runs
  When the user clicks up/down controls on a run chip
  Then the chip order updates immediately without exiting comparison mode
  And chart bars and comparison table columns follow the new run order
  And the first chip remains the primary run (cannot be removed)

Scenario: Chart in comparison mode
  Given comparison mode is active
  Then the chart shows:
    - Grouped bars (one per run) for each score metric
    - Bars color-coded to match run chips
    - "Latency" as an additional metric (normalized 0-5s = 0-100%)
    - Per-run values displayed below each metric group
```

### Comparison Table

```gherkin
Scenario: Table structure in comparison mode
  Given comparison mode is active
  Then the table shows columns:
    - Checkbox (disabled)
    - Eval (function name + dataset + labels)
    - Input
    - Reference
    - One column per run (named after run name, color-coded header)
  And Output/Error/Scores/Time columns are replaced by per-run columns
  And each run column contains: output text, error (if any), score badges, latency

Scenario: Result alignment across runs
  Given comparison mode is active
  Then results are matched across runs by (function, dataset) tuple
  And rows with matching results show data from all runs
  And missing results show "—" in the respective run column

Scenario: Hover preview popover in comparison table
  Given comparison mode is active
  When the user hovers truncated cell content in the comparison table
  Then a preview popover appears after the same delay as single-run mode
  And this applies to Input and Reference cells
  And this applies to Output, Error, and Scores content within each run column
```

### Comparison Detail View

```gherkin
Scenario: Comparison detail layout
  Given comparison mode is active
  And the user opens a result detail page
  Then the page uses a dedicated comparison layout
  And the eval function name appears once in the top header
  And the rerun button is hidden
  And the single-run right sidebar is hidden
  And run output cards are the primary top region
  And input/reference are shown in a supporting bottom region
  And the top/bottom and input/reference boundaries are draggable

Scenario: Per-run information in comparison detail
  Given comparison mode is active in detail view
  Then each run output card shows:
    - run name and status
    - output content
    - score chips with hoverable full score details (key, value/passed, notes)
    - annotation (inline or hoverable when present)
    - latency (when present)
  And each run output card includes an "Open detail" link to that run's single-run detail page
```

### Comparison Limits

```gherkin
Scenario: Maximum 4 runs
  Given the user has 4 runs in comparison mode
  Then the "+" button is hidden or disabled
  And no more runs can be added

Scenario: Run button disabled
  Given comparison mode is active
  Then the Run button shows "Compare Mode"
  And the button is disabled (grayed out)
  And no dropdown is shown
```

### Exiting Comparison Mode

```gherkin
Scenario: Remove runs to exit
  Given comparison mode is active with 2 runs
  When the user clicks "×" on the second run's chip
  Then that run is removed from comparison
  And the UI returns to normal (single-run) mode
  And the first run remains as the active run
```

### Color Assignment

Runs are assigned colors from a fixed palette in order:
1. First run: Blue (#3b82f6)
2. Second run: Orange (#f97316)
3. Third run: Green (#22c55e)
4. Fourth run: Purple (#a855f7)

Colors are reassigned when runs are removed to maintain palette order.

### API Endpoint

```
GET /api/runs/{run_id}/data
```

Returns full run data without changing the active run. Used for fetching comparison run data.

Response format: Same as `/results` endpoint (includes `score_chips`).

---

## Known Issues

### Limited Test Coverage

| Feature | Coverage |
|---------|----------|
| Run/Stop controls | Tested |
| Result streaming | Tested |
| JSON export | Tested |
| CSV export | Partially tested |
| Inline editing | Annotation editing tested |
| Keyboard shortcuts | Detail view arrows/Esc tested |
| Stats bar | Tested |
| Three-state filtering | Not tested |
| Filter persistence | Not tested |
| Comparison mode | Partially tested |
