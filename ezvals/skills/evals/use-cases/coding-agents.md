# Evaluating Coding Agents

Coding agents write, test, and debug code. They navigate codebases and run commands like human developers. The natural grading approach is: does the code work?

## Key Principle: Test Outputs, Not Paths

Don't check if the agent used a specific sequence of tools or followed a particular reasoning pattern. Agents find valid approaches you didn't anticipate. Grade whether the code works, not how the agent got there.

## Key Metrics

| Metric | How to Measure |
|--------|----------------|
| **Correctness** | Unit tests pass |
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

    # Test correctness with known cases
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

Check code quality beyond just correctness:

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

Agent behavior varies between runs. Use pass@k and pass^k metrics.

### pass@k: "Can It Ever Work?"

Measures the probability of at least one success in k attempts. Use when one working solution is all you need.

```python
@eval(input="Solve this complex algorithm problem", dataset="hard_problems")
def test_hard_task_pass_at_5(ctx: EvalContext):
    successes = 0
    all_outputs = []

    for _ in range(5):
        output = coding_agent(ctx.input)
        all_outputs.append(output)
        if verify_solution(output):
            successes += 1

    ctx.store(
        output=all_outputs[0],
        trace_data={"all_outputs": all_outputs},
        scores={"passed": successes > 0, "key": "pass_at_5", "notes": f"{successes}/5 succeeded"},
    )

### pass^k: "Is It Reliable?"

Measures the probability that ALL k trials succeed. Use for customer-facing agents where consistency matters.

```python
@eval(input="Generate a function to validate email addresses", dataset="critical_tasks")
def test_reliability(ctx: EvalContext):
    results = []
    for _ in range(3):
        output = coding_agent(ctx.input)
        # Execute and test
        local_ns = {}
        exec(output, {}, local_ns)
        validate_email = local_ns.get("validate_email")
        passed = (
            validate_email("test@example.com") == True and
            validate_email("invalid") == False
        )
        results.append(passed)

    # pass^3: all 3 must succeed
    all_passed = all(results)
    ctx.store(scores={"passed": all_passed, "key": "pass_to_3", "notes": f"{sum(results)}/3 succeeded"})
```

### Pass Rate

For most cases, just measure what percentage pass:

```python
@eval(input="Standard coding task", metadata={"trials": 10})
def test_pass_rate(ctx: EvalContext):
    results = []
    for _ in range(ctx.metadata["trials"]):
        output = coding_agent(ctx.input)
        results.append(verify_solution(output))

    pass_rate = sum(results) / len(results)
    ctx.store(scores={"value": pass_rate, "key": "pass_rate", "notes": f"Pass rate: {pass_rate:.0%}"})
    assert pass_rate >= 0.8, f"Pass rate {pass_rate:.0%} below 80% threshold"
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

Monitor resource usage alongside correctness:

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
    # Correctness check
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
