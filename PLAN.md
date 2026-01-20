# React Migration Plan (EZVals UI)

Status: in progress

## Goals
- Recreate the current UI in React with minimal behavior drift.
- Keep legacy UI intact and running at http://127.0.0.1:8987/.
- Use Playwright to validate behavior + visual parity against baselines.
- Preserve DX and avoid overengineering.

## Current Status
- Legacy UI baselines captured in `docs/.spec/visual-baseline/`.
- Behavior catalog: `docs/.spec/BEHAVIOR_CATALOG_WEBUI.md`.
- React app scaffolded in `ui/` (Vite) with legacy CSS + fonts loaded.
- Dashboard + detail markup mirrored in React; legacy JS loaded via dynamic import for parity baseline.
- ShadCN CLI initialized (components.json) and accordion component added.

## How To Run
1) Legacy UI:
   - `uv run ezvals serve examples` (or your normal serve command)
   - Verify: http://127.0.0.1:8987/
2) React UI (parallel):
   - `cd ui && npm run dev`
   - Verify: Vite default http://127.0.0.1:5173/

## Migration Steps (Do In Order)
1) React shell + layout parity (in progress)
   - Use existing tokens: `ui/src/styles/legacy.css`.
   - Load fonts and tailwind config via `ui/index.html`.
   - Confirm header, stats shell, and table shell visually match baseline.
   - Current bridge: `legacy-dashboard.js` and `legacy-detail.js` imported for parity; replace with React logic slice-by-slice.
2) Data wiring
   - Build API client for `/results` + detail endpoints.
   - No behavior changes yet; render raw data into layout.
3) Dashboard slices (parity gates after each slice)
   - Stats (expanded/compact, chart, progress).
   - Filters (search, score rules, dataset/label pills, trace filters).
   - Columns (visibility, widths).
   - Table (row render, status pills, expand).
   - Selection + sorting.
   - Export (JSON/CSV/Markdown) and compare mode.
4) Detail slices (parity gates after each slice)
   - Layout + data renderers (JSON/markdown/plain).
   - Collapsibles (metadata/trace).
   - Messages drawer + resize.
   - Rerun single eval.
   - Comparison detail layout.
5) Regression workflow
   - Keep legacy UI intact for A/B checks.
   - Add Playwright scripts for React UI parity vs baselines.
   - Update specs if any new behavior is introduced.

## Playwright Parity Checks
Baselines live in `docs/.spec/visual-baseline/`.

### Dashboard Baselines (Desktop)
- `docs/.spec/visual-baseline/dashboard/desktop-default.png`
- `docs/.spec/visual-baseline/dashboard/desktop-stats-collapsed.png`
- `docs/.spec/visual-baseline/dashboard/desktop-filters-open.png`
- `docs/.spec/visual-baseline/dashboard/desktop-columns-open.png`
- `docs/.spec/visual-baseline/dashboard/desktop-export-open.png`
- `docs/.spec/visual-baseline/dashboard/desktop-settings-open.png`
- `docs/.spec/visual-baseline/dashboard/desktop-row-expanded.png`
- `docs/.spec/visual-baseline/dashboard/desktop-row-selected.png`
- `docs/.spec/visual-baseline/dashboard/desktop-compare-mode.png`

### Detail Baselines (Desktop)
- `docs/.spec/visual-baseline/detail/desktop-default.png`
- `docs/.spec/visual-baseline/detail/desktop-metadata-collapsed.png`
- `docs/.spec/visual-baseline/detail/desktop-compare-mode.png`

### Optional Baselines (Not Yet Captured)
- Messages drawer open.
- Error banner state.

### How To Run Baseline Capture
- Legacy UI baseline capture:
  - `cd /Users/camronhaider/.codex/skills/playwright-skill && node run.js /tmp/playwright-baseline-ezvals.js`
  - `cd /Users/camronhaider/.codex/skills/playwright-skill && node run.js /tmp/playwright-baseline-ezvals-compare.js`

### How To Run Parity Tests (React)
- Duplicate the baseline scripts and set `TARGET_URL` to the React UI (Vite port).
- Compare screenshots against `docs/.spec/visual-baseline/`.

## ShadCN Components
- Use CLI for any components and then customize:
  - Example: `npx shadcn@latest add accordion`

## Testing
- Seed data: `uv run ezvals run examples` (re-run as needed).
- UI checks: always run Playwright parity against baselines after each slice.
- If adding e2e tests, use pytest with `-n auto`.

## Commit Guidance
- Commit after each meaningful slice passes parity checks.
- Do not delete or modify legacy templates/static JS unless explicitly required.
