---
name: prepare-merge
description: Clean up code and prepare documentation before merging a feature branch.
---

**Arguments:** Specify the target branch to compare against (default: `dev`)

Follow these steps:

## 0. Ensure You're on a Branch
If you're in a worktree on a detached HEAD, create a branch for your changes and commit before proceeding.

## 1. Analyze Branch Changes
- Run `git log <target>..HEAD --oneline` to see commits
- Run `git diff <target>..HEAD --stat` to see changed files
- Read key changed files to understand what was implemented
- Summarize the features/changes in the branch

## 2. Clean Up Code
Now that the feature works correctly, review the branch changes for cleanup opportunities before merging:
- **Rewrite for elegance:** Look at the solution holistically and consider if it can be expressed more cleanly now that you understand the full picture
- **Remove dead code:** Delete any unused functions, variables, imports, or commented-out code
- **Remove slop:** Inline single-use functions, strip overly defensive code, remove chronological comments, cut YAGNI violations (see CLAUDE.md for the full slop definition)
- **Consolidate:** Merge redundant logic, reduce duplication, simplify overly abstracted code

Only clean up code touched by this branch. Don't refactor unrelated areas. Run tests after cleanup to confirm nothing broke.

## 3. Update docs/changelog.mdx
- Add entries to the "Unreleased" section
- Use these prefixes:
  - `Added:` for new features
  - `Changed:` for modifications
  - `Fixed:` for bug fixes
  - `Tests:` for test changes
- Write concise descriptions (1-2 sentences)
- Don't duplicate existing entries

## 4. Update Documentation (If Needed)
Review if changes require updates to:
- `docs/` directory (Mintlify docs)
- `README.md`

**Update docs when:**
- New user-facing features were added
- Existing feature behavior changed
- New CLI flags or API endpoints were added

**Skip docs for:**
- Internal refactoring
- Bug fixes without behavior changes
- Test-only changes

When updating, write docs as if they're the current state - don't mention "updated" or "changed from".

## 5. Run Tests
- Run tests and ensure all tests pass. (Use `-n auto` to run tests in parallel)
- If tests fail, fix them and re-run until all tests pass

## 5b. Check Skill Version (If Merging to Main)
If preparing for a release to main:
- Check the version in `ezvals/skills/evals/SKILL.md` (the `<!-- Version: X.X.X -->` line)
- Flag if it doesn't match the upcoming release version
- The Sync Skill to Marketplace CI workflow requires the skill version to match the release tag

## 6. Summary
Report:
- What features/changes were found
- What documentation was updated
- What was skipped and why
- The final merge skill command: `/merge <branch>`
