"""Shared infrastructure for skill sandbox evals.

Common target, judge, and helpers used by both plan-quality and Q&A evals.
"""

import json
import os
import re
import subprocess
from pathlib import Path

from ezvals import EvalContext

ROOT = Path(__file__).parent.parent
SANDBOX_DIR = str(ROOT / "sandbox")

# Clean env for subprocess calls - unset CLAUDECODE to allow nested invocations
_CLEAN_ENV = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}


def run_claude(prompt, cwd=None, timeout=180, model=None):
    """Run claude -p and return the parsed JSON payload."""
    cmd = ["claude", "-p", prompt, "--output-format", "json"]
    if model:
        cmd.extend(["--model", model])
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=_CLEAN_ENV,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude exited {result.returncode}: {result.stderr[:500]}")

    return json.loads(result.stdout)


def claude_code_target(ctx: EvalContext, prompt_prefix=""):
    """Run Claude Code headless against the sandbox and capture output."""
    full_prompt = f"{prompt_prefix}{ctx.input}" if prompt_prefix else ctx.input
    payload = run_claude(full_prompt, cwd=SANDBOX_DIR, timeout=180, model="sonnet")
    plan_text = payload.get("result", "")

    ctx.store(
        output=plan_text,
        trace_data={
            "cost_usd": payload.get("total_cost_usd"),
            "duration_ms": payload.get("duration_ms"),
        },
    )


def _extract_json(text):
    """Extract a JSON object from text that may contain markdown or prose."""
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        pass

    # Regex: find first {...} block
    match = re.search(r'\{[^{}]*"passed"\s*:\s*(true|false)[^{}]*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise json.JSONDecodeError("No JSON object found", text, 0)


def judge_with_prompt(prompt, timeout=60):
    """Run Claude Code headless as LLM judge and return parsed verdict."""
    for attempt in range(2):
        payload = run_claude(prompt, timeout=timeout)
        judge_text = payload.get("result", "")
        try:
            verdict = _extract_json(judge_text)
            return {"passed": verdict["passed"], "notes": verdict.get("reasoning", "")}
        except (json.JSONDecodeError, KeyError):
            if attempt == 0:
                continue
            raise
