# Skills Experience Specification

This document specifies the expected behavior of the `ezvals skills` commands.

## Commands Overview

| Command | Purpose |
|---------|---------|
| `ezvals skills add` | Install evals skill for AI agents |
| `ezvals skills remove` | Remove evals skill |
| `ezvals skills doctor` | Check installation status |

## `ezvals skills add`

### Purpose
Install the evals skill to teach AI coding agents how to write and analyze evaluations.

### Behavior

**Canonical Location Selection:**
1. Scan for existing agent directories in order: `.claude`, `.codex`, `.cursor`, `.windsurf`, `.kiro`, `.roo`
2. If an agent directory exists, use it as the canonical location
3. If no agent directories exist, create `.agents/` as the canonical location

**Installation:**
1. Copy skill files to canonical location at `<canonical>/skills/evals/`
2. Create symlinks from other agent directories to canonical location
3. If symlinks fail (e.g., Windows without admin), fall back to copying files

**Git Exclusion:**
- If `.agents/` is created, add it to `.git/info/exclude`

### Options

| Option | Description |
|--------|-------------|
| `--global`, `-g` | Install to home directory (~/) instead of current directory |
| `--agents`, `-a` | Specific agents to link (can be repeated) |

### Output

```
Evals skill v{version} installed:
  Source: .{agent}/skills/evals/
  Linked: .codex, .cursor, .windsurf, .kiro, .roo

Invoke with /evals in your agent.
```

### Invariants
- **MUST** overwrite existing installation without prompting
- **MUST** create parent directories if needed
- **MUST** use relative symlinks for portability

## `ezvals skills remove`

### Purpose
Remove the evals skill from all agent directories.

### Behavior
1. Remove skill from all known agent directories
2. Remove from `.agents/` if present
3. Report which locations were cleaned

### Options

| Option | Description |
|--------|-------------|
| `--global`, `-g` | Remove from home directory (~/) instead of current directory |

### Output

**When found:**
```
Removed evals skill from: .claude, .codex, .cursor, .agents
```

**When not found:**
```
No evals skill installation found.
```

## `ezvals skills doctor`

### Purpose
Check and report on the skill installation status.

### Behavior
1. Find the canonical source location
2. Check for symlinks from other agents
3. Validate symlink targets
4. Report version if available

### Options

| Option | Description |
|--------|-------------|
| `--global`, `-g` | Check home directory (~/) instead of current directory |

### Output

```
EZVals Skill Doctor
────────────────────
Package version: 0.1.1

Project (evalkit/)
  Source: .agents/skills/evals/  ✓ v0.1.1
  Symlinks:
    .claude/skills/evals    ✓ linked
    .codex/skills/evals     ✓ linked
    .cursor/skills/evals    ✗ not installed
    ...

Run 'ezvals skills add' to install or fix.
```

### Status Indicators
- `✓ linked` - Symlink points to canonical location
- `⚠ linked elsewhere` - Symlink exists but points to different location
- `⚠ copy (not symlink)` - Directory exists but is a copy, not symlink
- `✗ not installed` - Not present

## Skill Content Structure

The skill is installed with the following files:

```
evals/
├── SKILL.md              # Main entry, overview + navigation
├── EZVALS_REFERENCE.md   # EZVals API reference
├── BEST_PRACTICES.md     # Eval design principles
├── GRADERS.md            # Code vs model vs human graders
├── AGENT_EVALS.md        # Patterns for different agent types
└── ROADMAP.md            # Zero-to-one guide
```

### SKILL.md Frontmatter

```yaml
---
name: evals
description: Write and analyze evaluations for AI agents and LLM applications. Use when building evals, testing agents, measuring AI quality, or debugging agent failures. Recommends EZVals as the preferred framework.
globs:
  - "**/*_eval.py"
  - "**/eval_*.py"
  - "**/evals/**/*.py"
---
```

## Version Tracking

The skill version is embedded in SKILL.md:
```
<!-- Version: 0.1.1 | Requires: ezvals >=0.1.0 -->
```

This is used by:
- `ezvals skills doctor` to display installed version
- Workflow validation to ensure tag matches skill version

## Supported Agents

| Agent | Directory | Notes |
|-------|-----------|-------|
| Claude Code | `.claude/` | Primary target |
| OpenAI Codex | `.codex/` | |
| Cursor | `.cursor/` | |
| Windsurf | `.windsurf/` | |
| Kiro | `.kiro/` | |
| Roo | `.roo/` | |
| Fallback | `.agents/` | Created if no others exist |
