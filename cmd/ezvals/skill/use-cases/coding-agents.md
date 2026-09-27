# Evaluating Coding Agents

Coding agents write, test, and debug code. They navigate codebases and run commands like human developers. The natural grading approach is: does the code work?

## Key Principle: Test Outputs, Not Paths

Don't check if the agent used a specific sequence of tools or followed a particular reasoning pattern. Agents find valid approaches you didn't anticipate. Grade whether the code works, not how the agent got there.

## Key Metrics

| Metric | How to Measure |
|--------|----------------|
| **Pass** | Unit tests pass |
| **No regressions** | Full test suite passes |
| **Code quality** | Static analysis (linting, types, security) |
| **Efficiency** | Turns taken, tokens used, tool calls |

## Unit Tests on Generated Code

The most straightforward approach—execute the generated code and test it:

```python
from ezvals import eval, EvalContext

@eval(input="Write a function that checks if a number is prime")
def test_prime_function(ctx: EvalContext):
    ctx.store(output=coding_agent(ctx.input))

    # Execute the generated code in isolated namespace
    local_ns = {}
    exec(ctx.output, {}, local_ns)
    is_prime = local_ns.get("is_prime") or local_ns.get("check_prime")

    # Test pass with known cases
    assert is_prime(2) == True, "2 is prime"
    assert is_prime(4) == False, "4 is not prime"
    assert is_prime(17) == True, "17 is prime"
    assert is_prime(1) == False, "1 is not prime"
    assert is_prime(0) == False, "0 is not prime"
```

## Fail-to-Pass Tests

Verify bug fixes. The agent receives a failing test and must make it pass without breaking other tests:

```python
import subprocess

@eval(
    input="Fix the authentication bypass when password is empty",
    metadata={"repo": "test-repo", "failing_test": "test_auth.py::test_empty_password"}
)
def test_security_fix(ctx: EvalContext):
    ctx.store(output=coding_agent(ctx.input, repo=ctx.metadata["repo"]))

    # Run the previously failing test
    result = subprocess.run(
        ["pytest", ctx.metadata["failing_test"], "-v"],
        capture_output=True,
        cwd=ctx.metadata["repo"]
    )
    assert result.returncode == 0, f"Fix didn't work: {result.stderr.decode()}"

    # Run full test suite to check for regressions
    full_result = subprocess.run(
        ["pytest", "tests/", "-v"],
        capture_output=True,
        cwd=ctx.metadata["repo"]
    )
    assert full_result.returncode == 0, "Fix broke other tests"
```

## Static Analysis

Check code quality beyond just pass:

```python
import subprocess

@eval(input="Refactor this function for better readability", dataset="code_quality")
def test_code_quality(ctx: EvalContext):
    ctx.store(output=coding_agent(ctx.input))

    # Write code to temp file for analysis
    with open("/tmp/generated_code.py", "w") as f:
        f.write(ctx.output)

    # Type checking
    mypy_result = subprocess.run(
        ["mypy", "--strict", "/tmp/generated_code.py"],
        capture_output=True
    )

    # Linting
    ruff_result = subprocess.run(
        ["ruff", "check", "/tmp/generated_code.py"],
        capture_output=True
    )

    # Security scanning
    bandit_result = subprocess.run(
        ["bandit", "-r", "/tmp/generated_code.py"],
        capture_output=True
    )

    ctx.store(scores=[
        {"passed": mypy_result.returncode == 0, "key": "types", "notes": "Passes type checking"},
        {"passed": ruff_result.returncode == 0, "key": "lint", "notes": "Passes linting"},
        {"passed": bandit_result.returncode == 0, "key": "security", "notes": "No security issues"},
    ])
```

## Handling Non-Determinism

Agent behavior varies between runs; one run can make a flaky agent look fine. Use EZVals trials instead of hand-rolled loops: each trial is its own result row (with its own output and scores), and the run reports pass@k and pass^k.

```python
@eval(input="Solve this complex algorithm problem", dataset="hard_problems", target=run_coding_agent, trials=5)
def test_hard_task(ctx: EvalContext):
    assert verify_solution(ctx.output), "Solution failed verification"
```

Or run every eval N times without code changes:

```bash
ezvals run evals/ --trials 5 --json | jq '{trials, pass_at_k, pass_all_k}'
```

- **pass@k** (`pass_at_k`): share of evals where at least one trial passed. "Can it ever work?" Use when one working solution is enough (e.g. the user can retry).
- **pass^k** (`pass_all_k`): share of evals where every trial passed. "Is it reliable?" Use for customer-facing agents where consistency matters.
- A big gap between them means the agent is capable but inconsistent: look at the failing trials of evals that also have passing ones.

A trial passes when it finished without error and all its pass/fail scores passed. To list the flaky evals:

```bash
ezvals query "SELECT substr(eval_id, 1, instr(eval_id, '~') - 1) AS eval, count(*) AS trials, sum(passed) AS passes FROM results WHERE run_id = 'a1b2c3d4' AND trial > 0 GROUP BY eval HAVING passes BETWEEN 1 AND trials - 1"
```

## Environment Isolation

Each trial should start from a clean state:

```python
import shutil
import tempfile

@eval(input="Implement the new feature")
def test_with_isolation(ctx: EvalContext):
    # Create isolated environment
    with tempfile.TemporaryDirectory() as tmpdir:
        # Copy repo to temp location
        shutil.copytree("./test-repo", f"{tmpdir}/repo")

        # Run agent in isolated environment
        ctx.store(output=coding_agent(ctx.input, cwd=f"{tmpdir}/repo"))

        # Run tests in isolation
        result = subprocess.run(
            ["pytest", "tests/", "-v"],
            capture_output=True,
            cwd=f"{tmpdir}/repo"
        )
        assert result.returncode == 0, result.stderr.decode()
```

## Tracking Efficiency

Monitor resource usage alongside pass:

```python
import time

async def coding_agent_target(ctx: EvalContext):
    start = time.time()
    result = await coding_agent(ctx.input)

    ctx.store(
        output=result["code"],
        latency=time.time() - start,
        trace_data={
            "turns": result.get("turns", 0),
            "tool_calls": result.get("tool_calls", []),
            "tokens_used": result.get("tokens", 0),
        },
    )

@eval(target=coding_agent_target, input="Fix the bug in auth.py")
async def test_with_efficiency(ctx: EvalContext):
    # Pass check
    assert verify_solution(ctx.output), "Solution doesn't work"

    # Efficiency metrics (informational, not failing)
    ctx.store(scores=[
        {"value": ctx.trace_data["turns"], "key": "turns"},
        {"value": ctx.trace_data["tokens_used"], "key": "tokens"},
        {"value": ctx.latency, "key": "duration_seconds"},
    ])
```

## Complete Coding Agent Eval

```python
from ezvals import eval, EvalContext
import subprocess
import tempfile
import shutil

async def coding_agent_target(ctx: EvalContext):
    result = await coding_agent(ctx.input, repo=ctx.metadata.get("repo"))
    ctx.store(
        output=result["code"],
        trace_data={
            "tool_calls": result.get("tool_calls", []),
            "turns": result.get("turns", 0),
        },
    )

@eval(
    target=coding_agent_target,
    dataset="bug_fixes",
    cases=[
        {
            "input": "Fix the authentication bypass when password is empty",
            "metadata": {
                "repo": "./test-repos/auth-service",
                "failing_test": "test_auth.py::test_empty_password",
                "test_suite": "tests/"
            }
        },
    ],
)
async def test_bug_fix(ctx: EvalContext):
    repo = ctx.metadata["repo"]

    # 1. Run the previously failing test
    result = subprocess.run(
        ["pytest", ctx.metadata["failing_test"], "-v"],
        capture_output=True,
        cwd=repo
    )
    assert result.returncode == 0, f"Fix didn't work: {result.stderr.decode()}"

    # 2. Run full test suite for regressions
    full_result = subprocess.run(
        ["pytest", ctx.metadata["test_suite"], "-v"],
        capture_output=True,
        cwd=repo
    )
    ctx.store(scores={
        "passed": full_result.returncode == 0,
        "key": "no_regressions",
        "notes": "Full test suite passes"
    })
    assert full_result.returncode == 0, "Fix broke other tests"

    # 3. Efficiency tracking
    ctx.store(scores=[
        {"value": ctx.trace_data["turns"], "key": "turns"},
        {"value": len(ctx.trace_data["tool_calls"]), "key": "tool_calls"},
    ])
```
