# Web UI Behavior Catalog (Legacy UI)

Scope: `/` (results dashboard) and `/runs/:run_id/results/:index` (detail).
Source of truth: `ezvals/static/index.js`, `ezvals/static/detail.js`, `ezvals/templates/index.html`, `ezvals/templates/detail.html`.

## Conventions
- Each entry follows: Trigger -> Preconditions -> State touched -> Effects -> Notes.
- "State" includes local variables, DOM attributes/classes, localStorage/sessionStorage, and server calls.

## Shared State + Storage
- localStorage
  - `ezvals:theme` ("dark" or "light")
  - `ezvals:hidden_columns` (array)
  - `ezvals:col_widths` (map col -> px)
  - `ezvals:statsExpanded` ("true"/"false")
  - `ezvals:runMode` ("rerun" or "new")
  - `ezvals:messagesPaneWidth` (detail messages drawer width)
  - `ezvals:detailSizes` (detail panel sizes)
- sessionStorage
  - `ezvals:filters` (filter object)
  - `ezvals:search` (string)
  - `ezvals:comparisonRuns` (array of runs + colors)
  - `ezvals:scrollY` (scroll position for return from detail)

## Dashboard (Route: `/`)

### Boot and Data Load
- Trigger: page load -> `loadResults()`.
- Preconditions: none.
- State touched: `_currentData`, `_currentRunId`, `_sessionRuns`, `_comparisonRuns`, `_comparisonData`, `_comparisonMatrix`.
- Effects:
  - `GET /results` -> render dashboard.
  - If `session_name`, `GET /api/sessions/:name/runs` for run dropdowns.
  - Restore comparison state from sessionStorage (if >= 2 runs), fetch missing runs.
  - Render stats + table, then run `onResultsRendered()` initializer.
- Notes: failure renders error banner in `#results`.

### Theme Toggle
- Trigger: click `#theme-toggle`.
- Preconditions: none.
- State touched: `document.documentElement.classList`, `localStorage['ezvals:theme']`.
- Effects: adds/removes `dark` class and persists preference.

### Stats Panel (Expanded/Compact)
- Trigger: click expand/collapse buttons.
- Preconditions: stats rendered.
- State touched: `localStorage['ezvals:statsExpanded']`.
- Effects: toggles `.hidden` on `#stats-expanded` and `#stats-compact`.
- Notes: default expanded unless localStorage set to `false`.

### Stats Recalculation under Filters
- Trigger: `applyAllFilters()`.
- Preconditions: results table exists.
- State touched: none (derived from DOM).
- Effects:
  - Computes filtered stats from visible rows (latency + scores).
  - Updates charts, latency, and test count to `filtered/total`.
- Notes: in comparison mode, stats updates are skipped (read-only).

### Chart Animation
- Trigger: after render (`animateInitialBars()`).
- Preconditions: stats chart rendered.
- State touched: inline style `height` + `opacity` on bars/labels.
- Effects: staged bar fill animations and label/value fade-ins.

### Search
- Trigger: input on `#search-input` (120ms debounce).
- Preconditions: table rendered.
- State touched: `sessionStorage['ezvals:search']`.
- Effects: runs `applyAllFilters()` after debounce.
- Notes: restored on load via `restoreFiltersAndSearch()`.

### Filters (Score / Trace / Dataset / Labels / Annotation)
- Trigger: add rule, toggle pill, or click filter button.
- Preconditions: score keys and dataset/label lists computed from table or comparison data.
- State touched: `_filters` + `sessionStorage['ezvals:filters']`.
- Effects:
  - Score filter: select key + add value rule (numeric) or pass rule.
  - Dataset/Label pills: tri-state include -> exclude -> clear.
  - Trace filters: `hasError/hasUrl/hasMessages` tri-state true -> false -> null.
  - Annotation filter: `any -> yes -> no -> any`.
  - Active filter chips update badge count and chip list.
- Notes:
  - Score key dropdown hides sections based on whether the key is numeric or boolean.
  - Comparison mode filter match: row passes if any run in the comparison matches.

### Filter Matching Rules
- Trigger: `applyAllFilters()` or `rowMatchesFilters()`.
- Preconditions: `_filters` set and table exists.
- State touched: row classes (`.hidden`).
- Effects:
  - Search uses `tr.textContent` substring match.
  - Filters use data attributes (`data-scores`, `data-labels`, `data-dataset`, etc.).
  - Score value rules use op comparison; pass rules require exact pass/fail.

### Table Sorting
- Trigger: click table header (`th[data-col]`).
- Preconditions: table rendered.
- State touched: `_sortState`.
- Effects:
  - Single click toggles asc -> desc -> none.
  - Shift+click adds multi-sort with same cycle.
  - Numeric sort uses `data-value` if present.
  - Scores column treats empty values as always sorted last.
- Notes: original row order is preserved when no sort state.

### Column Visibility
- Trigger: toggle checkbox in columns menu, or click reset.
- Preconditions: `#columns-menu` exists.
- State touched: `localStorage['ezvals:hidden_columns']`.
- Effects:
  - Applies `.hidden` to header/cells for hidden columns.
  - Syncs toggle states to stored set.

### Column Resizing
- Trigger: drag `.col-resizer` in table header.
- Preconditions: table exists.
- State touched: `localStorage['ezvals:col_widths']`.
- Effects:
  - Applies inline `width` on header cell while dragging.
  - Writes rounded width to storage on mouseup.
- Notes: min 50px, max 500px per column.

### Row Expansion
- Trigger: click a row (excluding inputs/buttons/links).
- Preconditions: main row exists.
- State touched: row class `.expanded`.
- Effects: expands line clamp and rotates chevron.

### Row Selection
- Trigger: click row checkbox or select-all.
- Preconditions: visible rows exist.
- State touched: `selectedIndices` set.
- Effects:
  - Select-all affects only visible rows.
  - Shift+click selects range between last checked and current (visible rows only).
- Notes: selection affects run button state.

### Run Controls (Run / Stop / New / Rerun)
- Trigger: click run button or dropdown options.
- Preconditions: not in comparison mode.
- State touched: `_runMode`, `_hasRunBefore`, `_isRunning`.
- Effects:
  - `POST /api/runs/stop` when running.
  - `POST /api/runs/rerun` or `/api/runs/new` with optional `indices`.
  - Run button toggles icon/color; progress bar pulse when running.
- Notes:
  - Comparison mode hides run button and dropdown and shows "Compare Mode".
  - `_hasRunBefore` inferred if any result is not `not_started`.

### Live Updates
- Trigger: `scheduleLiveRefresh()` when results pending/running/not_started.
- Preconditions: not in comparison mode.
- State touched: `_currentData`.
- Effects:
  - Polls `/results` every 500ms.
  - Updates rows in place if result JSON differs.
  - Updates stats in place, re-applies column visibility.

### Inline Run Rename
- Trigger: click pencil icon in stats header.
- Preconditions: run name or dropdown exists.
- State touched: DOM (replace span with input), `_hasRunBefore`.
- Effects:
  - Save on Enter or checkmark; cancel on blur/Escape.
  - `PATCH /api/runs/:id` if run file exists, else `PUT /api/pending-run-name`.
  - Reloads results after save/cancel.

### Export
- Trigger: select export menu item.
- Preconditions: table exists.
- State touched: none.
- Effects:
  - JSON/CSV: navigate to `/api/runs/:id/export/{json|csv}`.
  - Markdown: `POST /api/runs/:id/export/markdown` with visible rows/columns + stats.
  - Comparison mode adds per-run filtered results + chips + latency.
- Notes: filtered export uses only visible rows and visible columns.

### Scroll Restore
- Trigger: click a result link to detail.
- Preconditions: `a[href*="/runs/"][href*="/results/"]`.
- State touched: `sessionStorage['ezvals:scrollY']`.
- Effects: restores scroll on return, then clears `scrollY`.
- Notes: `?scroll` in URL triggers history replace.

### Settings Modal
- Trigger: click settings icon, close/cancel, backdrop click, or submit.
- Preconditions: modal exists.
- State touched: none (server config via API).
- Effects:
  - `GET /api/config` on open, populates fields.
  - `PUT /api/config` on save, closes modal on success.

### Copyable Fields
- Trigger: click `.copyable`.
- Preconditions: element has text.
- State touched: DOM (temporary tooltip).
- Effects: copies text to clipboard, shows "Copied!" tooltip for 1s.

## Detail View (Route: `/runs/:run_id/results/:index`)

### Boot and Mode Selection
- Trigger: page load -> `loadDetail()`.
- Preconditions: none.
- State touched: `dataPayloads`, `functionName`, `evalPath`, `total`.
- Effects:
  - `GET /api/runs/:id/results/:index`.
  - Comparison mode if sessionStorage `comparisonRuns` has >1 runs including current and `compare=0` not present.
  - Otherwise render single-result layout.

### Data Rendering (JSON / Markdown / Text)
- Trigger: render result panels.
- Preconditions: data available.
- State touched: `data-raw` and `data-mode` attributes.
- Effects:
  - JSON detection for objects or JSON-ish strings.
  - Markdown detection with `marked` + `DOMPurify`; code highlighted via `highlight.js`.
  - Plain text uses `<pre>` with escaped text.
- Notes: `filterTraceData()` strips `messages` and `trace_url` for trace panel.

### Messages Rendering
- Trigger: render messages pane.
- Preconditions: trace data has messages array.
- State touched: DOM innerHTML.
- Effects:
  - If message schema known, renders styled message cards.
  - Tool calls/results show collapsed JSON, with best-effort parsing of Python-ish data.
  - Unknown schema renders raw JSON.

### Copy Buttons
- Trigger: click any `.copy-btn`.
- Preconditions: target has `data-raw` or text content.
- State touched: DOM (icon swap).
- Effects: copies target content, shows check icon for 1.5s.

### Copy Run Command
- Trigger: click copy command button.
- Preconditions: `eval_path` or function name set.
- State touched: clipboard.
- Effects: copies `ezvals run {path}::{name}` or `ezvals run {name}`.

### Resizable Panels
- Trigger: drag `.resize-handle-v` / `.resize-handle-h`.
- Preconditions: panel elements exist.
- State touched: inline `style` widths/heights, `localStorage['ezvals:detailSizes']`.
- Effects:
  - Input/Output, Input/Reference, Main/Sidebar, IO/Reference, Comparison Top/Bottom resizing.
  - Saves sizes on mouseup and restores on load.
- Notes: min sizes enforced; input may lock to full width in comparison mode.

### Messages Drawer Resize
- Trigger: drag messages pane handle.
- Preconditions: messages drawer exists.
- State touched: inline `width`, `localStorage['ezvals:messagesPaneWidth']`.
- Effects: resizes drawer within 300px to (viewport - 100px).

### Messages Drawer Toggle + Dismiss
- Trigger: click messages row or close button; click outside; Esc.
- Preconditions: messages pane exists.
- State touched: `translate-x-full` class.
- Effects: toggles drawer open/close; clicking outside closes; Esc closes if open.

### Navigation (Prev/Next)
- Trigger: click prev/next or ArrowUp/ArrowDown.
- Preconditions: `currentIndex` within bounds.
- State touched: location.
- Effects: navigates to `/runs/:id/results/:idx` (keeps `?compare=0` if set).
- Notes: buttons disabled at bounds.

### Rerun Single Eval
- Trigger: click "Rerun" button.
- Preconditions: not already disabled.
- State touched: button disabled + innerHTML spinner.
- Effects:
  - `POST /api/runs/rerun` with `{ indices: [currentIndex] }`.
  - Polls the same detail endpoint until status is `completed` or `error`.
  - Re-renders result view on completion.

### Comparison Detail View
- Trigger: comparison mode selected.
- Preconditions: comparison context built from sessionStorage.
- State touched: DOM only.
- Effects:
  - Shared input/reference from base result.
  - Output cards per run with badges and error snippet.
  - "Open detail" links include `?compare=0` to force single view.

## Visual Baseline Mapping (Desktop)

Baseline screenshots live at `docs/.spec/visual-baseline/` and are used for pixel parity checks during React migration.

### Verification Checkpoints
- After each UI slice migration (Stats, Filters, Table, Detail panels), recapture the mapped baseline(s) and diff.
- After completing each route (`/`, detail), run full baseline diff set.
- Final gate: full baseline diff set before release.

### Dashboard (`/`)
| Screenshot | Behavior Coverage |
| --- | --- |
| `docs/.spec/visual-baseline/dashboard/desktop-default.png` | Boot and Data Load; Table render; Stats default state |
| `docs/.spec/visual-baseline/dashboard/desktop-stats-collapsed.png` | Stats Panel (Expanded/Compact) |
| `docs/.spec/visual-baseline/dashboard/desktop-filters-open.png` | Filters menu open state |
| `docs/.spec/visual-baseline/dashboard/desktop-columns-open.png` | Column visibility menu open state |
| `docs/.spec/visual-baseline/dashboard/desktop-export-open.png` | Export menu open state |
| `docs/.spec/visual-baseline/dashboard/desktop-settings-open.png` | Settings modal open state |
| `docs/.spec/visual-baseline/dashboard/desktop-row-expanded.png` | Row Expansion state |
| `docs/.spec/visual-baseline/dashboard/desktop-row-selected.png` | Row Selection state |
| `docs/.spec/visual-baseline/dashboard/desktop-compare-mode.png` | Comparison mode layout and run chips |

### Detail (`/runs/:run_id/results/:index`)
| Screenshot | Behavior Coverage |
| --- | --- |
| `docs/.spec/visual-baseline/detail/desktop-default.png` | Data Rendering; default panels layout |
| `docs/.spec/visual-baseline/detail/desktop-metadata-collapsed.png` | Metadata collapsible state |
| `docs/.spec/visual-baseline/detail/desktop-compare-mode.png` | Comparison detail layout |

### Not Yet Captured (Optional)
- Messages drawer open.
- Error banner state.
