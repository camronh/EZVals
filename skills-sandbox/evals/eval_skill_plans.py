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
SANDBOX_DIR = str(ROOT / "sandbox")
PLAN_CONTRACT = (ROOT / "prompts" / "plan_contract.md").read_text()
JUDGE_PROMPT_TEMPLATE = (ROOT / "prompts" / "judge_prompt.md").read_text()

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
    cases=[
        {
            "id": "hallucination",
            "input": "How do I know if my agent is hallucinating? Help me write evals for that.",
            "reference": {
                "dataset": [
                    "Answerable questions AND questions the agent should refuse (has context about the topic but not enough to answer)",
                ],
                "target": [
                    "Captures retrieved source documents in trace_data",
                ],
                "evaluator": [
                    "Uses an LLM judge that checks if the answer can be cited from the source docs",
                    "Handles refusal correctly — 'I don't know' passes for refusal cases, answering from own knowledge fails even if correct",
                    "Single groundedness/faithfulness metric, not a separate metric per check",
                    "Judge should use structured output (e.g., --output-format json or similar) for machine-parseable results",
                ],
            },
        },
        {
            "id": "tool_routing",
            "input": "My agent keeps calling the wrong tool, how do I write evals to test that?",
            "reference": {
                "dataset": [
                    "Queries that map to specific expected tools",
                    "Includes negative cases — queries that look like they'd trigger certain tools but shouldn't",
                ],
                "target": [
                    "Store messages from the agent in trace_data",
                ],
                "evaluator": [
                    "Programmatic evaluator that checks tool call messages against the expected tool calls",
                    "Pass if the correct tool was called",
                ],
            },
        },
        {
            "id": "guardrails",
            "input": "How do I make sure my agent doesn't answer questions it's not supposed to? Help me write evals for this.",
            "reference": {
                "dataset": [
                    "Mix of in-scope queries and out-of-scope queries (questions that sound related but fall outside the agent's domain)",
                    "Each case marked as 'should answer' or 'should refuse'",
                ],
                "target": [],
                "evaluator": [
                    "Uses an LLM judge to check for refusals",
                    "Single pass/fail — answering out-of-scope fails, refusing in-scope also fails",
                ],
            },
        },
        {
            "id": "regression",
            "input": "I'm about to change my CLAUDE.md to add type checking, how do I use evals to make sure I don't break anything?",
            "reference": {
                "dataset": [
                    "Hopefully, already have a good baseline of evals in place",
                    "If not, suggest writing up regression evals that test as many important coding agent behaviors as possible",
                    "Use programmatic evaluators if possible, otherwise use an LLM judge with 'should' statements",
                ],
                "target": [
                    "Use a headless CLI agent as the target. Should match the config of the current agent being used for evals",
                    "Shouldn't need a separate sandbox environment, just use the current one in this case",
                    "Prompt should force the agent to write a plan, do not implement changes",
                ],
                "evaluator": [
                    "Suggests running a baseline first, then comparing after the change",
                    "Add a type checking check to any datasets that would expect type checking",
                    "Uses session/run naming to compare before and after (e.g., --run-name baseline vs --run-name new-prompt)",
                ],
            },
        },
        {
            "id": "multi_turn",
            "input": "My agent needs to handle follow-up questions and remember context from earlier in the conversation. How do I write evals for that?",
            "reference": {
                "dataset": [
                    "Multi-turn conversation sequences, not just single questions",
                    "Later messages should use implicit references to earlier context (e.g., 'What about that one?' or 'Can I return it?') to test memory",
                ],
                "target": [
                    "Uses the conversation_history parameter from run_agent() to simulate multi-turn",
                    "Runs turns sequentially, feeding previous messages back in",
                ],
                "evaluator": [
                    "Checks that later responses correctly reference information from earlier turns",
                    "Fails if the agent asks for information it was already given",
                ],
            },
        },
        {
            "id": "tone",
            "input": "I need to make sure my agent always sounds professional and empathetic, even with angry customers. Help me write evals for that.",
            "reference": {
                "dataset": [
                    "Queries across different customer moods — neutral, frustrated, angry, confused",
                    "Include provocative inputs that might cause the agent to break character",
                ],
                "target": [],
                "evaluator": [
                    "LLM judge checking tone criteria (professional, empathetic, not defensive or dismissive)",
                    "Single pass/fail per case, not a separate score for each tone dimension",
                ],
            },
        },
        {
            "id": "latency_cost",
            "input": "My agent is too slow and expensive. How do I use evals to track and improve that?",
            "reference": {
                "dataset": [
                    "Representative queries across different complexity levels (simple lookups vs multi-step tasks)",
                ],
                "target": [
                    "Captures latency and token usage in trace_data",
                ],
                "evaluator": [
                    "Tracks latency and cost as numeric scores (ctx.store with value, not just pass/fail)",
                    "Optionally asserts under a threshold, but the main value is tracking the numbers over time",
                    "Uses run comparison to see if changes improve or regress performance",
                ],
            },
        },
        {
            "id": "accuracy",
            "input": "How do I know if my agent is giving correct answers to customer questions? Help me write evals for accuracy.",
            "reference": {
                "dataset": [
                    "Synthetically generate questions with known correct answers from the knowledge base (prices, policies, order details),"
                    "by searching the knowledge base and then formulating questions based on knowledge base rather than relying on a SME",
                    "Include reference answers or key facts that must appear in the response",
                ],
                "target": [],
                "evaluator": [
                    "LLM judge would be the best fit here",
                    "Fails if the answer is factually wrong, even if it sounds confident",
                    "Declining to answer an answerable question should fail",
                ],
            },
        },
        {
            "id": "model_comparison",
            "input": "I want to try swapping my agent's model to see if a cheaper one works just as well. How do I compare them with evals?",
            "reference": {
                "dataset": [
                    "Hopefully, already have a good baseline of evals in place",
                    "If not, suggest writing up regression evals that test as many important coding agent behaviors as possible",
                    "Use programmatic evaluators if possible, otherwise use an LLM judge with 'should' statements",
                ],
                "target": [
                    "Parameterize the target to swap the model (e.g., pass model name via metadata or config)",
                    "Run the same evals with each model configuration",
                ],
                "evaluator": [
                    "Same evaluators for both models so the comparison is apples-to-apples",
                    "Use run naming to label each model (e.g., --run-name gpt-4o vs --run-name claude-sonnet)",
                    "Use ezvals serve to compare runs side by side",
                ],
            },
        },
        {
            "id": "stress_testing",
            "input": "My agent is using too many emojis! Fix it with evals.",
            "reference": {
                "dataset": [
                    "Try to reproduce and make a quick dataset of a handful of queries and their outputs with emojis",
                ],
                "target": [
                    "Run quick evals programatically so you dont have to add them to the codebase since these are one-off",
                    "Save the json when running programatically",
                ],
                "evaluator": [
                    "Should not use a score here. 'Less emojis' is not a metric. Will need to eyeball and do pairwise comparisons (doenst need to refer to them as pairwise, just needs to mention a kinda before and after flow)",
                    "Make tweaks to the prompt to see if you can get the agent to use fewer emojis, and rerun",
                    "Eyeball results and then serve the results side by side to compare when satisfied",
                ],
            },
        },
    ],
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
