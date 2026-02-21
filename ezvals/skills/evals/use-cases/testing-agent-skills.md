# Testing Agent Skills

Agent skills, CLAUDE.md files, AGENTS.md configs, and MCP servers all shape how a coding agent behaves. But how do you know if your skill actually teaches the agent what you want? You can't just eyeball it — you need evals.

At its core, a skill is an organized collection of prompts and instructions for an LLM. The most reliable way to improve a skill over time is to evaluate it the same way you would any other prompt: run it, capture what happened, and score the result against criteria you defined up front.

This guide covers evaluating the **configuration layer** of coding agents — the skills, prompts, and tools that shape behavior. The agent itself is a black box. You're testing whether your instructions make it do the right thing.

## What You Can Test

- **Agent skills** — does your `.claude/skills/` or `.codex/skills/` teach the agent correctly?
- **Agent config** — does your `CLAUDE.md`, `AGENTS.md`, or `codex.md` improve behavior?
- **MCP servers** — does the agent use your custom tools effectively?
- **Agent comparison** — how does Claude Code vs Codex perform on the same tasks?
- **Prompt changes** — does updating your system prompt break existing behavior?

## 1. Define Success Before You Test

Before running evals, write down what "success" means for each scenario you care about. Structure your criteria around the three components of any eval:

- **Dataset**: What test cases should the agent handle? What inputs cover the important scenarios?
- **Target**: How should the agent be invoked? What data should be captured?
- **Evaluator**: How do you score the result? What passes, what fails?

This framing keeps you from writing vague criteria like "the agent should do a good job." Instead you get concrete things to check.

## 2. Use Plan-Only Mode

For skill testing, you usually don't need the agent to actually write code. You just need to see its **plan**. This is faster, cheaper, parallel-safe, and avoids file mutations.

Force plan-only behavior by prepending instructions to the prompt:

```
You are analyzing a codebase and producing a PLAN only.
Do NOT write any files. Do NOT apply any changes.
You are ONLY planning. This is absolutely critical — plan only, never execute.
```

Keep it natural language — don't force JSON structure on the plan itself. The agent should reason freely. You'll use a judge to score the plan separately.

When you do need the agent to execute (e.g., testing that a skill actually scaffolds files correctly), skip the plan contract and let it run. Use environment isolation (temp directories) so runs don't interfere with each other.

## 3. Target: Headless CLI Agent

The target is a subprocess call to your coding agent's headless mode. Same eval pattern as everything else — the target is just `subprocess.run` instead of a function call.

### Claude Code

Claude Code supports `claude -p` for non-interactive mode and `--output-format json` for structured output:

```python
import json
import os
import subprocess
from ezvals import eval, EvalContext

# Strip CLAUDECODE so this works when run from inside a Claude session
CLEAN_ENV = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

PLAN_CONTRACT = """You are analyzing a codebase and producing a PLAN only.
Do NOT write any files. Do NOT apply any changes.
You are ONLY planning."""

def claude_code_target(ctx: EvalContext):
    prompt = f"{PLAN_CONTRACT}\n\nTASK:\n{ctx.input}"
    result = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "json"],
        cwd=ctx.metadata.get("cwd", "."),
        capture_output=True, text=True, timeout=180, env=CLEAN_ENV,
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude exited {result.returncode}: {result.stderr[:500]}")

    payload = json.loads(result.stdout)
    ctx.store(
        output=payload.get("result", ""),
        trace_data={
            "cost_usd": payload.get("total_cost_usd"),
            "duration_ms": payload.get("duration_ms"),
        },
    )
```

### Codex

Codex supports `codex exec` for non-interactive mode:

```python
def codex_target(ctx: EvalContext):
    prompt = f"{PLAN_CONTRACT}\n\nTASK:\n{ctx.input}"
    result = subprocess.run(
        ["codex", "exec", prompt],
        cwd=ctx.metadata.get("cwd", "."),
        capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(f"codex exited {result.returncode}: {result.stderr[:500]}")

    ctx.store(output=result.stdout.strip())
```

## 4. Build Your Dataset

Write inputs the way a real user would type them — natural questions, not formal descriptions:

| Instead of | Write |
|---|---|
| "Evaluate groundedness of agent responses" | "How do I know if my agent is hallucinating?" |
| "Test tool call routing accuracy" | "My agent keeps calling the wrong tool, how do I test that?" |
| "Verify guardrail compliance" | "How do I make sure my agent doesn't answer questions it's not supposed to?" |

For each case, structure your reference criteria as **dataset**, **target**, and **evaluator** — what a good plan should include for each component:

```python
cases=[
    {
        "id": "hallucination",
        "input": "How do I know if my agent is hallucinating? Help me write evals for that.",
        "reference": {
            "dataset": [
                "Answerable questions AND refusal questions (has context about the topic but not enough to answer)",
            ],
            "target": [
                "Captures retrieved source documents in trace_data",
            ],
            "evaluator": [
                "LLM judge checks if the answer can be cited from source docs",
                "'I don't know' passes for refusal cases, answering from own knowledge fails even if correct",
                "Single groundedness metric, not a separate metric per check",
            ],
        },
    },
    {
        "id": "tool_routing",
        "input": "My agent keeps calling the wrong tool, how do I write evals to test that?",
        "reference": {
            "dataset": [
                "Queries that map to specific expected tools",
                "Negative cases — queries that look like they'd trigger certain tools but shouldn't",
            ],
            "target": [
                "Store messages from the agent in trace_data",
            ],
            "evaluator": [
                "Programmatic evaluator that checks tool call messages against expected",
                "Pass if the correct tool was called",
            ],
        },
    },
]
```

Start with 5-10 cases. Grow the dataset over time as you discover real failures. Every time the skill gets something wrong that you manually fix, turn that failure into a new test case.

## 5. Evaluator: CLI Agent as Judge

You can use the same headless CLI trick for judging. No API key needed — runs on your existing subscription.

The judge takes the plan + criteria and returns a single pass/fail with reasoning. Don't break criteria into separate metrics — it's clunky and the individual scores aren't actionable. The judge evaluates holistically.

```python
def judge_plan(plan, should_statements):
    criteria_text = "\n".join(f"- {s}" for s in should_statements)
    prompt = f"""Evaluate if this plan meets the criteria AS A WHOLE.
The plan doesn't need to hit every bullet perfectly, but it should
demonstrate solid understanding of the approach described.

## Plan:
{plan}

## Criteria:
{criteria_text}

Return ONLY a JSON object:
{{"passed": true, "reasoning": "brief explanation"}}
or
{{"passed": false, "reasoning": "brief explanation"}}"""

    result = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "json"],
        capture_output=True, text=True, timeout=60, env=CLEAN_ENV,
    )
    payload = json.loads(result.stdout)
    judge_text = payload.get("result", "").strip()

    # Strip markdown code fences if present
    if judge_text.startswith("```"):
        judge_text = judge_text.split("\n", 1)[1] if "\n" in judge_text else judge_text[3:]
    if judge_text.endswith("```"):
        judge_text = judge_text[:-3]

    verdict = json.loads(judge_text.strip())
    return {"passed": verdict["passed"], "notes": verdict.get("reasoning", "")}
```

## 6. Wire It Together

```python
@eval(
    target=claude_code_target,
    dataset="skill_eval",
    timeout=300,
    cases=[...],  # your cases from step 4
)
def test_skill_plan_quality(ctx: EvalContext):
    # Flatten reference into should-statements for the judge
    should = []
    for category in ("dataset", "target", "evaluator"):
        for item in ctx.reference.get(category, []):
            should.append(f"[{category}] {item}")

    verdict = judge_plan(ctx.output, should)
    ctx.store(scores=verdict)
    assert verdict["passed"], verdict["notes"]
```

The `[category]` prefixes give the judge context about which eval component each criterion relates to.

## 7. Run and Iterate

```bash
# Run the evals
ezvals run evals/ --verbose --run-name baseline

# Serve results for review
ezvals serve evals/
```

Review the judge's reasoning in the UI. The iteration loop:

1. **Run evals** — get a baseline of how well your skill teaches the agent
2. **Review failures** — read the plans that failed and the judge's reasoning
3. **Update your skill** — adjust the skill content to address gaps
4. **Re-run** — `ezvals run evals/ --run-name v2`
5. **Compare** — use `ezvals serve` to view runs side by side
6. **Repeat** — until you're satisfied with pass rates

### Aligning the Judge

The judge itself needs calibration. On your first run, review every result:

- If the judge passes something that should fail, tighten the should-statements or the judge prompt
- If the judge fails something that should pass, loosen the criteria or add context
- If the judge is inconsistent, make the criteria more specific — "uses an LLM judge" is better than "has good evaluation logic"

This is normal. Judge alignment is iterative, just like prompt engineering.

## What You Need

1. **A project for the agent to inspect** — the agent needs a codebase to read when planning. This can be your actual project or a sandbox with a toy agent.

2. **The skill installed** — install your skill into the project so the agent has access to it.

3. **Plan-only prompt** — prepended to every input so the agent plans instead of executing.

4. **Judge prompt** — tells the judge how to score. Keep it simple: here's the plan, here are the criteria, pass or fail.

5. **Cases** — natural-language inputs with dataset/target/evaluator criteria.

## Deterministic Checks vs. LLM Judge

Not everything needs a judge. If your skill should produce specific files, run specific commands, or follow a strict structure, use deterministic checks:

```python
def test_skill_creates_files(ctx: EvalContext):
    # Check that the skill created the expected files
    assert os.path.exists(f"{project_dir}/package.json"), "Missing package.json"
    assert os.path.exists(f"{project_dir}/src/App.tsx"), "Missing App.tsx"
```

Use the LLM judge for subjective quality — did the plan make sense? Is the approach sound? Did it follow best practices? Use deterministic checks for objective outcomes — did the file get created? Did the command run? Did the test pass?

Start with deterministic checks where you can. Layer in the judge only where code can't capture what you need.
