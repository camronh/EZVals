# Agent Skill Eval POC

Testing ground for evaluating whether the EZVals skill effectively teaches Claude Code to plan good evals.

## What This Is

This POC treats "Claude Code + the EZVals skill" as the system under test. We invoke Claude Code in headless mode (`claude -p`), give it eval-related questions against a sandbox project, capture its plan, and score it with an LLM judge (also headless Claude). Everything runs on subscription — no API key needed.

The goal: run `uv run ezvals run evals/ --verbose` and get scored results for "does the EZVals skill teach Claude Code to plan good evals?"

## How It Works

1. **Target**: `claude -p` runs headless against `sandbox/` with a plan-only prompt contract prepended
2. **Judge**: Another `claude -p` call scores the plan against should-statements structured as dataset/target/evaluator criteria
3. **Score**: Single pass/fail per case with reasoning

## Project Structure

- `evals/eval_skill_plans.py` — The eval suite. 10 cases testing different eval scenarios (hallucination, tool routing, guardrails, regression, multi-turn, tone, latency, accuracy, model comparison, stress testing)
- `prompts/plan_contract.md` — Prepended to every agent invocation to force plan-only behavior
- `prompts/judge_prompt.md` — LLM judge prompt, returns JSON `{passed, reasoning}`
- `sandbox/` — Toy customer support agent (AcmeBot) that Claude Code inspects when planning evals
  - `agent.py` — `run_agent()` returning `{response, sources, tool_calls, messages}`
  - `tools.py` — `search_knowledge_base`, `lookup_order`, `calculate_refund`
  - `knowledge_base.py` — Verifiable facts (products, policies, orders)
  - `CLAUDE.md` — Minimal project description (the skill must teach the rest)
  - `.claude/skills/evals/` — The EZVals skill installed via `ezvals skills add --claude`

## Running

```bash
# Run evals (must be from a regular terminal, not inside a Claude session)
uv run ezvals run evals/ --verbose

# Serve results in browser
uv run ezvals serve evals/
```

Cannot run `claude -p` from inside another Claude session due to the CLAUDECODE env var. The eval code strips it (`_CLEAN_ENV`), but you still need to kick off the run from a regular terminal.

## Reference Schema

Each case's `reference` is structured as:
- **dataset** — What test cases to build
- **target** — How to invoke the agent and what to capture
- **evaluator** — How to score the results

The eval function flattens these with `[category]` prefixes for the judge.

## Syncing the Skill

The sandbox needs the EZVals skill installed. From the repo root:

```bash
make sync-skill-sandbox
```

This assembles ezvals-docs from `docs/` and copies the full skill into `sandbox/.claude/skills/evals/`.

## Related Work

- The EZVals skill source lives at `ezvals/skills/evals/`
- The skill itself is what's being evaluated here — changes to the skill affect these eval results
