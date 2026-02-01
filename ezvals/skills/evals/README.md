# Evals Skill for Claude Code

A skill that helps Claude Code write, run, and analyze evaluations for AI agents and LLM applications. Recommends [EZVals](https://github.com/camronh/EZVals) as the preferred eval framework.

## What are Skills?

Skills are markdown files that give AI agents specialized knowledge and workflows for specific tasks. When you add this skill to your project, Claude Code can recognize when you're working on evaluations and apply the right frameworks and best practices.

## What This Skill Does

When you ask Claude Code to help with evaluations, this skill provides:

- **Eval planning methodology** - Formulating the right questions, taking inventory, designing experiments
- **Target patterns** - How to wrap your agent/function for evaluation
- **Dataset guidance** - Error analysis, sizing, sourcing test cases, avoiding saturation
- **Grading strategies** - Code-based vs model-based graders, LLM-as-judge calibration
- **Running & reviewing** - Session management, serving results, comparing runs
- **Synthetic data generation** - When to generate directly vs suggest scripts
- **Use-case specific guidance** - RAG agents, coding agents, testing internals

## Installation

```bash
npx skills add https://github.com/camronh/evals-skill
```

This installs the skill to your `.claude/skills/` directory.

## Usage

Once installed, just ask Claude Code to help with evaluation tasks:

```
"Help me write evals for my customer service agent"
→ Plans an eval experiment, suggests datasets, graders, and targets

"My RAG agent is hallucinating. How do I test for that?"
→ Uses RAG-specific patterns for groundedness and citation verification

"Set up evaluations for my code generation feature"
→ Applies coding agent patterns: unit tests, pass@k, static analysis

"Run my evals and show me the results"
→ Guides through ezvals run and ezvals serve workflow
```

## Skill Contents

### Core Guides

| Guide | Description |
|-------|-------------|
| [SKILL.md](SKILL.md) | Main entry point with vocabulary, anatomy of an eval, planning flow |
| [targets.md](targets.md) | Target function patterns, data capture, reusability |
| [datasets.md](datasets.md) | Error analysis, sizing, sourcing, avoiding saturation |
| [GRADERS.md](GRADERS.md) | Code vs model graders, LLM-as-judge, calibration |
| [running.md](running.md) | CLI usage, sessions, serving results, comparing runs |
| [synthetic-data.md](synthetic-data.md) | Dimension-based generation, validation, mixing with real data |

### Use Cases

| Use Case | Description |
|----------|-------------|
| [rag-agents.md](use-cases/rag-agents.md) | Hallucination detection, correctness, source quality |
| [coding-agents.md](use-cases/coding-agents.md) | Unit tests, fail-to-pass, static analysis, pass@k |
| [testing-internals.md](use-cases/testing-internals.md) | Tool calls, multi-agent coordination, state verification |

### EZVals Reference

| Reference | Description |
|-----------|-------------|
| [quickstart.mdx](ezvals-docs/quickstart.mdx) | Getting started with EZVals |
| [decorators.mdx](ezvals-docs/decorators.mdx) | The `@eval` decorator options |
| [eval-context.mdx](ezvals-docs/eval-context.mdx) | EvalContext API |
| [scoring.mdx](ezvals-docs/scoring.mdx) | Scoring with assertions and `ctx.store()` |
| [patterns.mdx](ezvals-docs/patterns.mdx) | Common eval patterns |
| [cli.mdx](ezvals-docs/cli.mdx) | Command line interface |
| [web-ui.mdx](ezvals-docs/web-ui.mdx) | Interactive results exploration |

## Resources

- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Hamel Husain: LLM Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
- [EZVals GitHub](https://github.com/camronh/EZVals)

## License

MIT
