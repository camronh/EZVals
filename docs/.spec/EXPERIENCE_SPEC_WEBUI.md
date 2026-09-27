# Web UI Experience Specification

This document specifies the web interface experience for EZVals.

---

## Starting the UI

```bash
ezvals serve evals/
```

Starts at `http://127.0.0.1:8000` (browser opens by default unless `--no-open` is used). Evaluations are discovered but not auto-run.

---

## Layout

The dashboard is a workbench: a runs sidebar on a tinted canvas, and the open run in an inset main panel.

1. **Sidebar**: the EZVals mark, the session, the session's runs (see [Runs Sidebar](#runs-sidebar)) with "+" to start a new run, and at the bottom Reload evals and Settings. The button at the left of the header hides and shows it, and the choice is remembered in this browser; until the user makes one, the sidebar shows on screens 1024px and wider.
2. **Header** (top of the main panel): the run's name with a rename pencil, its eval count and time, then Compare, Regrade and the primary Run button.
3. **Summary**: the run's headline numbers, pass-rate trend and outcome bar, plus each score key when there is more than one (see [Summary](#summary)).
4. **Filter bar**: the outcome switch (All / Failed / Errors, each with a count), search, Filters, Columns and Export. When rows are selected, the bar shows how many.
5. **Results table**, with the [review panel](#review-panel) beside it when a result is open.

Most runs are graded by a single pass/fail score, so the UI is built around one metric: the pass rate and each row's outcome icon carry it, and per-key detail appears only when a run has several keys (two or three is normal; more is unusual but supported).

The UI uses one cool neutral palette, a navy brand colour for primary actions and a blue accent for links, focus and the current row; green, red and amber only ever mean passed, failed and in progress, and always come with an icon or a word. Compared runs take blue, violet, teal and pink, never a status colour. Text is set in Geist, prose (inputs, outputs, notes) included. Geist Mono is used for eval names (they are code identifiers), headline numbers, structured data, errors, commands and ids.

The visual language is the EZVals design system: semantic colour tokens for both themes, a type scale (11–40px), a 4/6/8/12px radius scale, one set of button, field, chip, menu and dialog styles, and a single focus ring. It is documented in Storybook under **Design System** (Foundations and Controls).

### Accessibility

```gherkin
Scenario: The UI meets WCAG 2.1 AA
  Then every text colour has at least 4.5:1 contrast on the surfaces it is used on, in both themes
  And field and checkbox edges, the focus ring and status marks have at least 3:1
  And every control has an accessible name, and every story passes an automated WCAG 2.1 AA check in the story tests

Scenario: Keyboard use
  Then every control shows a visible focus ring when reached by keyboard
  And menus take focus when opened, arrow keys move between items, and Escape closes them and returns focus to their button
  And dialogs keep focus inside until closed with Escape, Close or a click outside, then return focus to where it was
  And option switches (All / Failed / Errors, Pretty / Raw, the theme) are radio groups: arrow keys move the choice
  And the review panel and the detail page step through results with ↑ and ↓ (see [Keyboard Shortcuts](#keyboard-shortcuts))
```

### Theme

```gherkin
Scenario: Theme follows the OS by default
  Given the user has never picked a theme
  When the UI opens
  Then it uses the OS light/dark preference
  And it switches live when the OS preference changes

Scenario: Pick a theme
  When the user picks System, Light or Dark in Settings
  Then the UI switches immediately
  And the choice is remembered in this browser
```

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
  And the summary says the evals have not been run yet

Scenario: No evals found
  Given discovery found no evals and reported no error
  Then the table area explains that no evals were found in the served path
  And shows a minimal example eval to copy
```

### Row Layout

```gherkin
Scenario: Eval cell
  Then each row's eval cell shows the eval name, with dataset, labels and trial "#n" on a quieter line beneath it
  And a leading icon shows the row's outcome (see Result Status Indicators)

Scenario: Scores cell with one metric
  Given the run's only score key is pass/fail
  Then the Scores cell shows no chips, since the row's outcome icon already says passed or failed
  And a failed score's notes show in the cell

Scenario: Scores cell with several metrics
  Given the run has more than one score key, or a numeric one
  Then a failed pass/fail score shows as a red "✗ key" chip (passed ones are implied by the outcome icon)
  And a numeric score shows as a neutral "key 0.83" chip
  And failed scores' notes show beneath the chips
  And hovering a chip shows its full value and notes

Scenario: Score chips elsewhere
  Given scores appear without an outcome icon (comparison cells and cards)
  Then a passed score shows as a green "✓ key" chip, a failed one as a red "✗ key" chip, and a numeric one as "key 0.83"
  And failed scores' notes show beneath the chips
```

### Table Sorting

```gherkin
Scenario: Sort by scores column
  Given results are displayed in the table
  When the user clicks the Scores column header
  Then rows sort by aggregate score (pass ratio or average value)
  And clicking again reverses the sort order

Scenario: Annotation indicator in results table
  Given results are displayed in the table
  When a row has a non-empty annotation
  Then a subtle annotation indicator icon appears in the Output cell
  And hovering the icon changes it to an edit affordance
  And hovering that indicator shows the full annotation in the hover preview popover
  And the popover has an edit action that switches to textarea mode with Save/Cancel
```

### Run Button (Single Action)

The primary button at the right of the header runs evals. While a run is active it is replaced, in the same place, by labeled Pause (or Resume) and Stop buttons.

```gherkin
Scenario: Stable run button label
  Given the UI is open
  When the user views the Run button
  Then the button label is "Run" when idle ("Run 3" when 3 rows are selected)
  And the button label is "Stop" while a run is active, next to "Pause"/"Resume"

Scenario: Selective run with checkboxes
  Given some evaluations are checked
  When the user clicks "Run"
  Then only the selected evaluations run
  And results update in place for the current run

Scenario: Run behavior
  When the user clicks "Run"
  Then the evals run again within the current run, replacing their previous results
  And the run_name and run_id stay the same
  And the timestamp updates
  And annotations are kept

Scenario: New run from the sidebar
  When the user clicks "+" beside Runs in the sidebar
  Then a new run file is created with an auto-generated friendly name
  And the new run has no completed results yet, and it opens
  And "+" is disabled while a run is in progress
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

Scenario: Reload evals from UI
  Given the UI is open
  When the user clicks "Reload evals" at the bottom of the sidebar
  Then evals are rediscovered and ezvals.json is reloaded
  And the page reloads

Scenario: Code changes are picked up
  Given the user edits an eval file while the UI is open
  When the user clicks Run
  Then the edited code runs (every run starts fresh eval processes)
```

### Trials and Regrading

```gherkin
Scenario: Trials in the table
  Given a run with repeated trials
  Then each trial is its own row with "#n" on the eval's detail line
  And the summary shows pass@k and pass^k

Scenario: Regrade from the dashboard
  When the user clicks "Regrade" in the header ("Regrade 3" when 3 rows are selected)
  Then selected rows (or all rows when none are selected) are regraded without re-running targets
  And a toast reports how many results were regraded and how many were skipped for having no target
```

### Result Status Indicators

A finished row's icon shows its **outcome**, not just that it finished:

| Outcome | Visual | Meaning |
|--------|--------|---------|
| not run | Gray ring, dimmed row | Never run |
| queued | Amber spinner | `pending` |
| running | Blue spinner | Currently executing |
| passed | Green check | Finished, no error, at least one pass/fail score and none failed |
| failed | Red cross | At least one score failed |
| error | Red warning | The eval raised (status `error` or an error message) |
| scored | Gray check | Finished with only numeric scores, or no scores |
| cancelled | Gray slash | Stopped by user |

The row keeps `data-status` (the raw status) for tests and scripts.

---

## Review Panel

Results are reviewed beside the table, so the user keeps their place in the run while reading one result.

```gherkin
Scenario: Open a result beside the table
  Given the run has results
  When the user clicks a row anywhere but its checkbox, eval name link or annotation mark
  Then the result opens in a review panel on the right, and its row is marked as the current one
  And the URL gains ?result={index}, so reloading or sharing the link reopens it
  And while the panel is open the table narrows to a list (eval, scores, time), since the panel shows the rest

Scenario: Review panel contents
  Then the panel's header shows the outcome icon, the eval name, its position among the rows in view ("2 of 6"), previous and next buttons, "Open" and close
  And beneath it: the verdict strip, Output, Reference (if set), Input, then the same sidebar as the detail page (scores, details, messages, metadata, annotation)
  And scores and the annotation can be edited in place

Scenario: Step through results
  Given the review panel is open and focus is not in a field, menu or dialog
  When the user presses ↓ or ↑
  Then the next or previous row in view opens, and the table scrolls to keep it visible
  When the user presses Enter
  Then the result opens on its detail page
  When the user presses Escape
  Then the panel closes

Scenario: The panel follows the run
  When the user opens another run or starts a new one
  Then the review panel closes
  And it is hidden while comparing runs

Scenario: Review panel on a narrow screen
  Given the viewport is narrower than 1024px
  Then the review panel slides over the table from the right instead of sitting beside it
```

---

## Detail View

```gherkin
Scenario: Open detail view
  Given an evaluation has completed
  When the user clicks the function name, or presses Enter or clicks "Open" in the review panel
  Then a full-page detail view opens
  At URL: /runs/{run_id}/results/{index}

Scenario: Detail header
  Then the header shows where the result is: session / run / eval name (the run links back to its dashboard)
  And the result's position ("5 of 12") with previous and next buttons, then Regrade and Rerun

Scenario: Verdict
  Given the detail view is open
  Then a strip under the header says how the result came out, and why:
    - error: the error's one-line summary, with the rest of the traceback below it (capped in height, with "Show all")
    - failed: "Failed" (with several scores, the keys that failed) and the failing scores' notes
    - passed: "Passed" and any notes the grader left
    - running, queued, cancelled or not run: that status
  And a result with only numeric scores has no strip

Scenario: Detail view contents
  Given the detail view is open
  Then user sees:
    - Input (expandable JSON)
    - Output (expandable JSON)
    - Reference (if set)
    - Scores (with key, value/passed, notes)
    - Metadata (expandable key-value list with formatted labels and clickable links)
    - Extra data (collapsible JSON of trace_data fields other than messages and trace_url)
    - Annotations (editable)
    - Tools used (unique tool names from trace_data.messages tool calls, if present)
    - Trace (a link to trace_url, labeled with its site's host name), if set
    - Latency

Scenario: Detail layout
  Then Input is on the left, and Output is on the right with Reference beneath it, so the two can be compared
  And prose renders in the UI's text face and structured data (JSON) in monospace

Scenario: Scores lead the sidebar
  Given the result has scores
  Then they are the first section of the sidebar, each with its pass/fail mark or value and its notes in full

Scenario: Message-format data rendering
  Given the detail view is open
  And input, output, reference, or trace messages contain chat-style message arrays
  When the UI detects common message schemas (OpenAI, Anthropic, or text/message variants)
  Then those sections default to a pretty chat-style rendering
  And each section provides a Pretty/Raw toggle
  And Raw shows the underlying JSON payload without transformation

Scenario: Regrade one result
  Given the result finished and its eval has a target
  When the user clicks "Regrade" in the header
  Then the output stays, the eval body scores it again, and the scores update when done

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

  When the user presses Escape (or clicks Back)
  Then the user returns to the dashboard with this result open in the review panel

Scenario: Escape closes an open drawer first
  Given the Messages drawer is open
  When the user presses Escape
  Then the drawer closes and the user stays on the detail page

Scenario: Detail pane sizes persist in-session
  Given the user is on a detail page
  And the user resizes one or more detail panes
  When the user navigates to another detail result in the same browser session
  Then the resized pane sizes remain applied

Scenario: Detail view on a narrow screen
  Given the viewport is narrower than 768px
  When the user opens a detail page
  Then Input, Output and Reference stack full-width, followed by the sidebar
  And resize handles are hidden (saved pane sizes still apply on wider screens)
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
  Then the annotation saves to the run via PATCH API
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
- Extra data
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
  And scores with both a value and pass/fail show both controls
  And a typed value that parses as a number (e.g. `.5`, `1e3`) saves as a number; other text saves as text
  And Save/Cancel buttons appear

Scenario: Save score edits
  Given the user is editing a score
  When the user updates fields and clicks Save
  Then the scores save to the run via PATCH API
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

The Export menu in the filter bar provides 4 export formats (JSON, CSV, Markdown, PNG).

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
    - metadata, trace_data, annotation
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
  When the user clicks Export > Image
  Then a dialog opens with a preview of the image
  And export options are collapsed by default behind a compact options button
  And the options include:
    - Editable title (the session name by default)
    - Score colours (good, mid, low; the theme's passed, in-progress and failed colours by default)
    - Toggles for showing the eval count and average latency under the title
  And the image shows the summary as on screen (the visible rows):
    - the title, and the eval count and average latency when enabled
    - the pass rate, large, with the outcome bar and a legend of passed, failed and errored counts
    - each score key with its value and a bar, only when there is more than one key or a numeric one
    - the EZVals mark and "ezvals.com" in the bottom-right
  And the image matches the current theme (dark or light)
  And the user can click Save to download the PNG
  And the user can click Copy to copy the image to clipboard

Scenario: Export as PNG in comparison mode
  Given comparison mode is active with 2+ runs
  When the user clicks Export > Image
  Then the default title is the session name
  And the modal includes editable run names and run colors
  And the modal includes up/down controls to reorder runs
  And the image shows one row per run:
    - the run's colour dot and name
    - its pass rate as a bar in the run's colour, with the change in points from the first run
    - its average latency
```

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `↑` | Previous result | Review panel, detail view |
| `↓` | Next result | Review panel, detail view |
| `Enter` | Open the result's detail page | Review panel |
| `Esc` | Close the panel | Review panel |
| `Esc` | Back to the dashboard, with the result open | Detail view |

Shortcuts are ignored while typing in a field or when a menu or dialog is open.

---

## Session & Run Navigation


### Runs Sidebar

The sidebar shows the session and its runs; the open run's name heads the main panel.

```gherkin
Scenario: Runs in the sidebar
  Then the sidebar lists the session's runs, newest first
  And each shows its name, pass rate, time (or "Running…" with a spinner while it runs) and a small passed/failed/errored bar
  And the open run is highlighted, and listed even before it has results ("Not run yet")

Scenario: Open another run
  When the user clicks a run in the sidebar
  Then that run becomes the active run and its results load
  And comparison mode ends if it was on

Scenario: Run actions
  When the user opens a run's "⋯" menu (always shown on the open run; on the others it shows on hover or keyboard focus)
  Then it offers Compare with this run (not on the open run), Rename, Copy name and Delete run

Scenario: Rename run via inline editing
  When the user clicks the pencil beside the run name in the header, or chooses Rename in a run's "⋯" menu
  Then the run name becomes an editable text field
  And pressing Enter (or clicking the checkmark, in the header) saves the new name
  And pressing Escape or clicking outside cancels the edit
  And the run's saved name updates on save (the run file, named by run id, stays put)
  And names keep spaces and punctuation; a blank name is rejected

Scenario: Copy session/run name
  When the user clicks the session name in the sidebar, or chooses Copy name in a run's "⋯" menu
  Then the name is copied to the clipboard
  And clicking the session name shows a "Copied!" tooltip briefly

Scenario: Delete run
  When the user chooses Delete run in a run's "⋯" menu
  Then a confirmation appears
  And on confirm, the run file is deleted and the list refreshes
  And the open run can't be deleted: the item is disabled until another run is open
```

---

## Summary

A compact strip under the header answers "how did this run do?" at a glance.

```gherkin
Scenario: Headline pass rate
  Given the run has finished rows with pass/fail scores
  Then the summary leads with the pass rate: passed rows / finished rows (passed, failed and errored)
  And beside it: passed, failed and error counts, the number of evals and the average latency
  And with trials, pass@k and pass^k

Scenario: Numeric-only scores
  Given no finished row has a pass/fail score
  Then the headline is the number of finished evals instead of a pass rate

Scenario: Change since the previous run
  Given the session has an older run with results
  And the current run is not running and no filter is active
  Then the pass rate shows the change in points since that run (e.g. "▲ 4 pts")
  And clicking it compares the two runs

Scenario: Pass-rate trend
  Given two or more of the session's runs have a pass rate
  Then a small line chart beside the headline shows the pass rates of the last 12 of them, oldest to newest, with the open run's point filled
  And hovering a point shows that run's name and pass rate

Scenario: Outcome bar
  Then under the headline a bar splits the rows into passed (green), failed (red) and errored (faded red) shares
  And rows that finished without a pass/fail score (numeric scores only, or none) take a grey share, counted in the facts as "N without pass/fail"
  And rows not yet finished leave the rest of the bar empty
  And hovering a share shows its count ("10 failed")

Scenario: One metric
  Given the run's only score key is pass/fail
  Then the summary shows just the headline and outcome bar, with no per-key breakdown

Scenario: Several metrics
  Given the run has more than one score key, or a numeric one
  Then each key is listed beside the headline with its pass rate (or average), "passed/total" (or "avg") and a small bar
  And bars are green at ≥80%, amber at ≥50% and red below

Scenario: Progress while running
  Given a run is in progress
  Then the outcome bar fills as results arrive, with "completed/total" beside it

Scenario: Not run yet
  Given no row has been run
  Then the summary says how many evals are ready to run ("6 evals ready to run")

Scenario: Stats update with filters
  Given filters, search or the outcome switch narrow the rows
  Then the counts, pass rate, latency, outcome bar and per-key stats describe the visible rows only
  And the eval count reads "5 of 20 evals"
```

---

## Filtering

### Outcome Switch

```gherkin
Scenario: Show only failures
  When the user picks "Failed" in the filter bar's outcome switch
  Then only failed and errored rows are shown
  And "Errors" shows only errored rows, "All" shows everything
  And each option shows its row count
  And the choice is kept in the URL (`outcome=failed|errors`)
```

### Filters Panel

The Filters button (labeled, with a count of active filters) opens a panel.

```gherkin
Scenario: Filter by dataset or label
  Given the filters panel is open
  Then each dataset and label is a row with "Only" and "Hide" buttons
  When the user clicks "Only"
  Then only rows with that value are shown
  When the user clicks "Hide"
  Then rows with that value are hidden
  And clicking the active button again clears it

Scenario: Presence filters
  Then Annotation, Error, URL and Messages each have an Any / Has / None switch
```

### Filter Types

| Filter | States | Description |
|--------|--------|-------------|
| Outcome | all / failed / errors | Quick switch in the filter bar |
| Dataset | only / hide / any | Filter by dataset name |
| Labels | only / hide / any | Filter by label |
| Annotation | has / none / any | Filter by presence of annotation |
| Error | has / none / any | Filter by presence of an error |
| URL | has / none / any | Filter by trace_data.url presence |
| Messages | has / none / any | Filter by trace_data.messages presence |
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
| `/api/runs/{run_id}/results/{index}` | GET | Result JSON for the detail view |
| `/api/runs/{run_id}/results/{index}` | PATCH | Update `annotation` and/or `scores` (any run) |

### Run Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs/rerun` | POST | Run active eval configuration (optionally selected indices) |
| `/api/runs/regrade` | POST | Regrade the active run (optionally `{"indices": [...]}`); returns `regraded` and `skipped_without_target` |
| `/api/runs/pause` | POST | Pause queued execution after in-flight evals finish |
| `/api/runs/resume` | POST | Resume pending evals on a paused run |
| `/api/runs/stop` | POST | Cancel pending/running evals |
| `/api/server/restart` | POST | Rediscover evals and reload ezvals.json |

**Rerun Request Body:**
```json
{
  "indices": [0, 2, 5],  // Optional: result rows to rerun
  "config_name": "gpt-4", // Optional: config profile; a different profile starts a new run named after it
  "run_id": "a1b2c3d4"    // Optional: run to rerun rows of; it becomes the active run (rerun and regrade)
}
```

A request while a run is in progress returns 409.

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
| `/api/sessions/{name}/runs` | GET | List runs in session: `run_id`, `run_name`, `timestamp`, `total_evaluations`, `total_passed`, `total_failed`, `total_errors` |
| `/api/sessions/{name}` | DELETE | Delete entire session and all runs |
| `/api/runs/{run_id}` | PATCH | Rename a run (`{"run_name"}`, trimmed; blank is a 400) |
| `/api/runs/{run_id}` | DELETE | Delete specific run |
| `/api/runs/{run_id}/activate` | POST | Switch active run to view/edit a different run |
| `/api/runs/new` | POST | Create a new run with a fresh run_id/run_name (no overwrite) |

### Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get ezvals.json config |
| `/api/config` | PUT | Save the Settings keys (`concurrency`, `timeout`, `trials`, `results_dir`, `completion_notifications`): the body replaces them, and a key sent as null or left out goes back to its default. Other keys in ezvals.json (`configs`, `port`, `overwrite`, `verbose`) are kept |
| `/api/configs` | GET | Config profile names and the active one |
| `/api/configs/select` | POST | Choose the config profile for the next run |

```gherkin
Scenario: Configure completion notifications from Settings
  Given the user opens Settings from the sidebar
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

Scenario: Discovery finds no evals or fails
  Given the eval path has no evals, or an eval file fails to import
  When GET /results (or /api/runs/latest/data)
  Then 200 with the active run's ids and names and no results
  And `discovery_error` holds the worker's error and traceback when discovery failed
  And the UI shows "Couldn't load your evals" with the traceback and how to recover (fix the file, then Reload evals in the sidebar)
  And with no results, the table and the "No evals found" message are not shown

Scenario: No results match the filters
  Given filters or search hide every row
  Then the table says so and offers "Clear filters", which resets filters and search

Scenario: Loading and load failures
  Then while a page loads it says what it is loading ("Loading results…")
  And if it can't load, it says so ("Couldn't load results") and suggests checking that `ezvals serve` is still running
  And action failures appear as toasts that start with "Couldn't …" and include the reason
```

---

## File Storage

Each run is an append-only event log at `.ezvals/sessions/<session>/<run_id>.jsonl` (format in [EXPERIENCE_SPEC_SDK.md](./EXPERIENCE_SPEC_SDK.md#run-format)):

```
.ezvals/
└── sessions/
    ├── default/
    │   └── 3f9a1c2e.jsonl
    └── model-upgrade/
        ├── 7b2d4e61.jsonl   (run_name "gpt5")
        └── c08e5a93.jsonl   (run_name "gpt5-1")
```

- Session = directory name (letters, digits, `-` and `_`); `run_id` = 8 random hex characters; the run name lives inside the log, so it can hold any text and renaming never moves files
- Results stream into the log as each eval finishes, so a crashed or stopped run keeps everything that completed
- **Overwrite behavior:** When `overwrite=true` (default), starting a run with the same session + run name deletes the older run

### JSON Schema

The API, `ezvals run --json` and `ezvals export -f json` present a run as:

```json
{
  "run_id": "3f9a1c2e",
  "session_name": "model-upgrade",
  "run_name": "baseline",
  "created_at": 1705312200,
  "path": "evals/",
  "total_evaluations": 50,
  "total_functions": 10,
  "total_passed": 45,
  "total_failed": 3,
  "total_errors": 2,
  "total_with_scores": 48,
  "average_latency": 0.5,
  "results": [
    {
      "id": "evals/support.py::test_refund~2",
      "function": "test_refund",
      "dataset": "customer_service",
      "labels": ["production"],
      "trial": 2,
      "trial_of": "evals/support.py::test_refund",
      "regradable": true,
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
        "annotation": "Good tone",
        "correction_history": [
          {
            "field": "scores",
            "before": [{"key": "pass", "passed": false, "notes": "judge output"}],
            "after": [{"key": "pass", "passed": true, "notes": "human correction"}],
            "timestamp": "2026-02-20T12:34:56Z"
          }
        ]
      }
    }
  ]
}
```

`trial`, `trial_of` and `regradable` appear only when they apply; runs with trials also carry `trials`, `pass_at_k` and `pass_all_k`. `created_at` is when the run last started running (unix seconds). `/results` and `/api/runs/{run_id}/data` add `score_chips`, `eval_path`, and for the active run `is_paused`, `selected_total`, and `discovery_error` (only when discovering the evals failed).

---

## Comparison Mode

Comparison mode allows users to view and compare results from multiple runs side-by-side.

### Entering Comparison Mode

```gherkin
Scenario: Start comparing runs
  Given the user has multiple runs in the current session
  When the user clicks "Compare" in the header
  Then a menu shows the other runs in the session
  And selecting a run enters comparison mode
  And "Compare" is disabled when the session has no other run

Scenario: Compare from the sidebar
  When the user chooses "Compare with this run" in another run's "⋯" menu
  Then comparison mode starts with the open run and that run

Scenario: Compare with the previous run
  When the user clicks the pass-rate change in the summary
  Then comparison mode starts with the current and previous runs
```

### Comparison Mode UI

```gherkin
Scenario: Header in comparison mode
  Given comparison mode is active
  Then the header shows "Comparing N runs" and an "Exit" button in place of the run actions
  And clicking "Exit" returns to the first run

Scenario: Comparison summary
  Given comparison mode is active with 2+ runs (max 4)
  Then the summary is a table with one row per run:
    - color dot and run name
    - pass rate with a bar in the run's colour, and for runs after the first, the change in points from the first run
    - one column per score key (pass rate or average), only when the runs have more than one key or a numeric one
    - average latency
  And the best value in each column is emphasized (nothing is, when the runs tie)
  And non-primary rows have a remove (×) button
  And an "Add run" button adds another run (if < 4 runs)

Scenario: Reorder compared runs
  Given comparison mode is active with 2+ runs
  When the user clicks up/down controls on a run row
  Then the order updates immediately without exiting comparison mode
  And comparison table columns follow the new run order
  And the first row remains the primary run (cannot be removed)
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
  And this applies to annotation indicators within run columns when annotations are present
  And annotation popovers can switch to edit mode and save updates inline
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

Scenario: Run button hidden
  Given comparison mode is active
  Then the header shows "Comparing N runs" instead of the Run button
```

### Exiting Comparison Mode

```gherkin
Scenario: Remove runs to exit
  Given comparison mode is active with 2 runs
  When the user clicks "×" on the second run's row
  Then that run is removed from comparison
  And the UI returns to normal (single-run) mode
  And the first run remains as the active run
```

### Color Assignment

Runs are assigned colors from a fixed palette in order (the `--run-1` to `--run-4` tokens, tuned for each theme):
1. First run: Blue
2. Second run: Violet
3. Third run: Teal
4. Fourth run: Pink

Colors are reassigned when runs are removed to maintain palette order.

### API Endpoint

```
GET /api/runs/{run_id}/data
```

Returns full run data without changing the active run. Used for fetching comparison run data.

Response format: Same as `/results` endpoint (includes `score_chips`).
