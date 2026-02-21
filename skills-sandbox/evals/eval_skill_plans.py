"""Evaluate whether the EZVals skill teaches Claude Code to plan good evals.

Runs Claude Code in headless mode against a sandbox project, captures the plan,
and scores it against criteria using an LLM judge (also headless Claude).
"""

import json
import os
import subprocess
from pathlib import Path

from ezvals import eval, EvalContext

ROOT = Path(__file__).parent.parent
EVALS_DIR = Path(__file__).parent
SANDBOX_DIR = str(ROOT / "sandbox")
PLAN_CONTRACT = (ROOT / "prompts" / "plan_contract.md").read_text()
JUDGE_PROMPT_TEMPLATE = (ROOT / "prompts" / "judge_prompt.md").read_text()
CASES = json.loads((EVALS_DIR / "dataset.json").read_text())

# Clean env for subprocess calls - unset CLAUDECODE to allow nested invocations
_CLEAN_ENV = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}


def _run_claude(prompt, cwd=None, timeout=180):
    """Run claude -p and return the parsed JSON payload."""
    result = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "json"],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=_CLEAN_ENV,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude exited {result.returncode}: {result.stderr[:500]}")

    return json.loads(result.stdout)


def claude_code_target(ctx: EvalContext):
    """Run Claude Code headless and capture its eval plan."""
    full_prompt = f"{PLAN_CONTRACT}\n\nTASK:\n{ctx.input}"
    payload = _run_claude(full_prompt, cwd=SANDBOX_DIR, timeout=180)
    plan_text = payload.get("result", "")

    ctx.store(
        output=plan_text,
        trace_data={
            "cost_usd": payload.get("total_cost_usd"),
            "duration_ms": payload.get("duration_ms"),
        },
    )


def judge_plan(plan, should_statements):
    """Use Claude Code headless as LLM-as-judge to score a plan."""
    criteria_text = "\n".join(f"- {s}" for s in should_statements)
    prompt = JUDGE_PROMPT_TEMPLATE.replace("{{PLAN}}", plan).replace(
        "{{CRITERIA}}", criteria_text
    )

    payload = _run_claude(prompt, timeout=60)
    judge_text = payload.get("result", "")

    # Strip markdown code fences if present
    cleaned = judge_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    verdict = json.loads(cleaned.strip())
    return {"passed": verdict["passed"], "notes": verdict.get("reasoning", "")}


@eval(
    target=claude_code_target,
    dataset="skill_eval",
    timeout=300,
    cases=CASES,
)
def test_skill_plan_quality(ctx: EvalContext):
    """Score the agent's eval plan against our criteria."""
    should = []
    for category in ("dataset", "target", "evaluator"):
        for item in ctx.reference.get(category, []):
            should.append(f"[{category}] {item}")
    verdict = judge_plan(ctx.output, should)
    ctx.store(scores=verdict)
    assert verdict["passed"], verdict["notes"]
