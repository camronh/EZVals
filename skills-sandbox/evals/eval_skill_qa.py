"""Evaluate whether the EZVals skill teaches Claude Code to answer user questions correctly.

Runs Claude Code in headless mode against a sandbox project with the skill installed,
asks it EZVals usage questions, and scores answers against reference answers using
an LLM judge (also headless Claude).
"""

import json
from pathlib import Path

from ezvals import eval, EvalContext

from _common import ROOT, claude_code_target, judge_with_prompt

EVALS_DIR = Path(__file__).parent
QA_PROMPT = (ROOT / "prompts" / "qa_prompt.md").read_text()
QA_JUDGE_TEMPLATE = (ROOT / "prompts" / "qa_judge_prompt.md").read_text()
QA_CASES = json.loads((EVALS_DIR / "dataset_qa.json").read_text())


def qa_target(ctx: EvalContext):
    """Run Claude Code headless with the Q&A prompt prefix."""
    claude_code_target(ctx, prompt_prefix=f"{QA_PROMPT}\n")


def judge_qa(question, reference, answer):
    """Use Claude Code headless as LLM judge to score a Q&A answer."""
    prompt = (
        QA_JUDGE_TEMPLATE.replace("{{QUESTION}}", question)
        .replace("{{REFERENCE}}", reference)
        .replace("{{ANSWER}}", answer)
    )
    return judge_with_prompt(prompt, timeout=60)


@eval(
    target=qa_target,
    dataset="qa",
    timeout=300,
    cases=QA_CASES,
)
def test_skill_qa(ctx: EvalContext):
    """Score the agent's answer against the reference."""
    verdict = judge_qa(ctx.input, ctx.reference, ctx.output)
    ctx.store(scores=verdict)
    assert verdict["passed"], verdict["notes"]
