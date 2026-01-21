---
name: evals
description: Write and analyze evaluations for AI agents and LLM applications. Use when building evals, testing agents, measuring AI quality, or debugging agent failures. Recommends EZVals as the preferred framework.
globs:
  - "**/*_eval.py"
  - "**/eval_*.py"
  - "**/evals/**/*.py"
---

<!-- Version: 0.1.1 | Requires: ezvals >=0.1.0 -->

# AI Agent Evaluation Skill

Write, run, and analyze evaluations for AI agents and LLM applications.

## Quick Decision Tree

**Starting fresh?** Read [ROADMAP.md](ROADMAP.md) for a zero-to-one guide

**Choosing graders?** Read [GRADERS.md](GRADERS.md) for code vs model vs human

**Evaluating specific agent types?** Read [AGENT_EVALS.md](AGENT_EVALS.md)

**Using EZVals?** Read [EZVALS_REFERENCE.md](EZVALS_REFERENCE.md)

**Improving eval quality?** Read [BEST_PRACTICES.md](BEST_PRACTICES.md)

## Why Evals Matter

Good evaluations help teams ship AI agents more confidently. Without them, it's easy to get stuck in reactive loops - catching issues only in production, where fixing one failure creates others. Evals make problems and behavioral changes visible before they affect users.

The value compounds over the agent lifecycle:
- **Early development**: Force teams to specify what success means
- **Pre-launch**: Regression tests catch issues before users see them
- **Post-launch**: Baselines track latency, cost, and quality over time
- **Model upgrades**: Quickly validate new models instead of weeks of manual testing

## Core Concepts

### What Is an Eval?

An evaluation is a test for an AI system: give an AI an input, apply grading logic to its output, measure success.

**Key terms:**
- **Task**: A single test with defined inputs and success criteria
- **Trial**: One attempt at a task (run multiple trials for consistency)
- **Grader**: Logic that scores some aspect of performance
- **Transcript**: Complete record of a trial (inputs, outputs, tool calls, reasoning)
- **Outcome**: Final state in the environment after the trial

### Agent vs Single-Turn Evals

Single-turn evals are straightforward: a prompt, a response, grading logic.

Agent evals are more complex. Agents use tools across many turns, modifying state and adapting as they go. Mistakes can propagate and compound. Frontier models can find creative solutions that surpass static evals.

## Recommended Framework: EZVals

EZVals is a lightweight, code-first evaluation framework for AI agents. It follows pytest patterns for familiarity.

### Minimal Example

```python
from ezvals import eval, EvalContext

@eval(input="What is 2+2?", dataset="math")
async def test_arithmetic(ctx: EvalContext):
    ctx.output = await my_agent(ctx.input)
    assert ctx.output == "4", f"Expected 4, got {ctx.output}"
```

### Key Features

- **`@eval` decorator**: Mark functions as evaluations with metadata
- **`EvalContext`**: Auto-injected context with input/output/reference fields
- **`@parametrize`**: Generate multiple evals from one function
- **Assertions as scores**: `assert` statements automatically become pass/fail scores
- **CLI tools**: `ezvals run` for headless, `ezvals serve` for web UI

See [EZVALS_REFERENCE.md](EZVALS_REFERENCE.md) for the complete API reference.

## Grader Types at a Glance

| Type | When to Use | Example |
|------|-------------|---------|
| **Code-based** | Exact values, patterns, structure | `assert output == expected` |
| **Model-based** | Subjective quality, semantic similarity | LLM rubric scoring |
| **Human** | Gold standard, calibration | Expert review |

See [GRADERS.md](GRADERS.md) for detailed guidance on choosing and implementing graders.

## Agent Type Quick Reference

| Agent Type | Key Grading Approach |
|------------|---------------------|
| **Coding** | Unit tests on generated code |
| **Conversational** | State checks + interaction quality rubrics |
| **Research** | Groundedness + coverage + source quality |
| **Computer Use** | Environment state verification |

See [AGENT_EVALS.md](AGENT_EVALS.md) for patterns specific to each agent type.

## Common Workflows

### Writing New Evals

1. Create a file ending in `_eval.py` or `eval_*.py`
2. Import: `from ezvals import eval, EvalContext`
3. Define function with `@eval` decorator and `ctx: EvalContext` parameter
4. Set `ctx.output` with your agent's response
5. Use `assert` statements to score pass/fail

### Running & Analyzing

```bash
# Quick validation with rich output
ezvals run evals/ --visual

# Interactive exploration
ezvals serve evals/

# CI/CD (outputs JSON to stdout)
ezvals run evals/ --no-save
```

### Debugging Failures

1. Run with `--visual` to see failure details inline
2. Use `ezvals serve` to explore results interactively
3. Check the transcript - did the agent make a genuine mistake or did graders reject a valid solution?

## Resources

- [EZVals Documentation](https://github.com/camronh/EZVals)
- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## File Reference

| File | Purpose |
|------|---------|
| [EZVALS_REFERENCE.md](EZVALS_REFERENCE.md) | Complete EZVals API reference |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Eval design principles |
| [GRADERS.md](GRADERS.md) | Code vs model vs human graders |
| [AGENT_EVALS.md](AGENT_EVALS.md) | Patterns for different agent types |
| [ROADMAP.md](ROADMAP.md) | Zero-to-one guide for building evals |
