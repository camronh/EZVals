---
name: ship
description: Ship dev to main. Creates a release with version bump, changelog, and tag.
---

Follow these steps in order:

## 1. Confirm on Dev

- Verify we're on the `dev` branch
- If not, stop and ask

## 2. Run Tests

- Run tests and ensure all tests pass. (Use `-n auto` to run tests in parallel)
- If tests fail, STOP and report the failures

## 3. Version Bump

- Read `docs/changelog.mdx` to see what's in the `## Unreleased` section
- Suggest the next version (based on existing versions in the changelog)
- Update `docs/changelog.mdx`: change `## Unreleased` to `## <version> - <today's date>`
- Update `pyproject.toml` version to match

## 4. Update Skill Version

- Update the version comment in `ezvals/skills/evals/SKILL.md` (the `<!-- Version: X.X.X -->` line) to match the release version
- The skill version **MUST** match the release tag — the Sync Skill to Marketplace workflow will fail otherwise

## 5. Commit & Push Dev

```bash
git add -A
git commit -m "release <version>"
git push origin dev
```

## 6. Merge to Main

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

## 7. Tag & Push

```bash
git tag v<version>
git push origin v<version>
```

## 8. Return to Dev

```bash
git checkout dev
```

## PyPI Publishing (Automatic)

Publishing to PyPI is handled automatically by GitHub Actions:

- **Dev builds** (`.github/workflows/publish-dev.yml`): Every push to `main` publishes a dev version (`0.0.0.dev{timestamp}`) to PyPI
- **Release builds** (`.github/workflows/publish.yml`): Pushing a tag like `v0.1.0` triggers a release publish to PyPI

You don't need to manually run `uv publish` - just push the tag and the workflow handles it.

## Error Handling

- If tests fail → stop and report
- If merge conflicts occur → stop and ask for help
- If not on dev → stop and ask
