"""Evaluate whether the EZVals skill teaches Claude Code to plan good evals.

Runs Claude Code in headless mode against a sandbox project, captures the plan,
and scores it against criteria using an LLM judge (also headless Claude).
"""

import json
from pathlib import Path

from ezvals import eval, EvalContext

from _common import ROOT, claude_code_target, judge_with_prompt

EVALS_DIR = Path(__file__).parent
PLAN_CONTRACT = (ROOT / "prompts" / "plan_contract.md").read_text()
JUDGE_PROMPT_TEMPLATE = (ROOT / "prompts" / "judge_prompt.md").read_text()
CASES = json.loads((EVALS_DIR / "dataset.json").read_text())


def plan_target(ctx: EvalContext):
    """Run Claude Code headless with plan-only contract."""
    claude_code_target(ctx, prompt_prefix=f"{PLAN_CONTRACT}\n\nTASK:\n")


def judge_plan(plan, should_statements):
    """Use Claude Code headless as LLM-as-judge to score a plan."""
    criteria_text = "\n".join(f"- {s}" for s in should_statements)
    prompt = JUDGE_PROMPT_TEMPLATE.replace("{{PLAN}}", plan).replace(
        "{{CRITERIA}}", criteria_text
    )
    return judge_with_prompt(prompt, timeout=60)


@eval(
    target=plan_target,
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
