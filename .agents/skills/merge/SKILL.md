---
name: merge
description: "UAT a feature branch and merge it into dev. Use when: ready to merge a feature branch, want to verify changes before merging, or bringing worktree work into dev."
---

**Arguments:** The feature branch name to UAT and merge into dev.

Assumes tests already passed during `/prepare-merge`. No need to re-run pytest.

Follow these steps in order:

## 1. Analyze Branch Changes

- Run `git diff dev..<branch> --stat` to see changed files
- Run `git log dev..<branch> --oneline` to see commits
- Read key changed files to understand what was implemented
- Categorize changes:
  - **CLI**: `ezvals/cli.py`, `ezvals/runner.py`, `ezvals/discovery.py`, `ezvals/config.py`
  - **UI**: `ezvals/server/`, `ezvals/templates/`, `ezvals/static/`, `frontend/`
  - **Python API**: `ezvals/decorators.py`, `ezvals/context.py`, `ezvals/storage.py`
  - **Docs/Tests only**: `docs/`, `tests/`, `README.md`

## 2. Handle Worktree (If Applicable)

Run `git worktree list` to check if the branch is checked out in a worktree.

If it is (e.g. at `~/.claude-worktrees/<repo>/<branch>`):
- Remove it: `git worktree remove <worktree-path>`
- The branch is now free to check out normally

## 3. Checkout the Branch

```bash
git checkout <branch>
uv sync
```

## 4. UAT Based on What Changed

Consult the relevant spec in `docs/.spec/` for expected behavior.

### If CLI changes detected:
- Run `uv run ezvals run examples --visual` and verify the output looks correct
- If specific CLI flags were added or changed, test those explicitly
- Verify exit code is 0

### If UI changes detected:
- Build frontend if source changed: `cd frontend && npm ci && npm run build && cd ..`
- Start the server with auto-run: `uv run ezvals serve examples --session merge-uat --run`
- Write and execute Playwright scripts to verify the changes:
  - Use `sync_playwright()` with headless chromium
  - Wait for `networkidle` before inspecting
  - Take screenshots as evidence
  - Check behavior against `docs/.spec/EXPERIENCE_SPEC_WEBUI.md`
- Kill the server when done

### If Python API changes detected:
- Run `uv run ezvals run examples --visual` to verify evals still work
- If new decorator options or context methods were added, verify the examples exercise them

### If docs/tests only:
- Skim the changes, confirm they look reasonable
- No active UAT needed

## 5. Report UAT Results

Summarize:
- What was tested
- What passed
- Any issues or spec deviations found
- Screenshots if UI was tested

## 6. Check for Merge Conflicts

Before merging, do a dry run to detect conflicts:

```bash
git checkout dev
git merge --no-commit --no-ff <branch>
```

- If conflicts: run `git merge --abort`, report which files conflict, and STOP. The user needs to rebase the feature branch first, then re-run `/merge`.
- If clean: run `git merge --abort` to reset, then proceed to the actual merge.

## 7. Squash Merge Into Dev (If UAT Passes and No Conflicts)

```bash
git merge --squash <branch>
git commit -m "<concise summary of the feature>"
```

Use a concise commit message in lowercase imperative mood (e.g. "add export feature", "fix context bug").

Then delete the merged branch:

```bash
git branch -d <branch>
```

## Error Handling

- If UAT fails or something looks wrong: STOP, report findings, `git checkout dev`, do NOT merge
- If merge conflicts detected: abort, report conflicting files, STOP
- If worktree removal fails: stop and ask for help
