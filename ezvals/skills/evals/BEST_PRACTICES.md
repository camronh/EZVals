# Eval Best Practices

Principles for designing effective evaluations, based on Anthropic's experience building evals for AI agents.

## Task Design

### Write Unambiguous Tasks

A good task is one where two domain experts would independently reach the same pass/fail verdict.

**Bad:**
```python
@eval(input="Write something helpful about Python")
def test_vague(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert len(ctx.output) > 0  # What makes it "helpful"?
```

**Good:**
```python
@eval(
    input="Explain how Python's list comprehension syntax works",
    reference="[expr for item in iterable if condition]"
)
def test_specific(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert "for" in ctx.output and "in" in ctx.output
    assert "[" in ctx.output and "]" in ctx.output
```

### Include Reference Solutions

Each task should have a known-working output that passes all graders. This proves:
1. The task is solvable
2. Graders are correctly configured

```python
@eval(
    input="What is the capital of France?",
    reference="Paris"
)
def test_capital(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert "paris" in ctx.output.lower()
```

### Build Balanced Problem Sets

Test both cases where a behavior should occur AND where it shouldn't. One-sided evals create one-sided optimization.

```python
# Test that agent DOES search when appropriate
@eval(input="What's the weather in Tokyo right now?", labels=["should_search"])
def test_should_search(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.metadata.get("searched") is True

# Test that agent DOESN'T search when unnecessary
@eval(input="Who founded Apple?", labels=["should_not_search"])
def test_should_not_search(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.metadata.get("searched") is False
    assert "steve jobs" in ctx.output.lower()
```

### One Behavior Per Eval

Keep evals atomic. Test one thing at a time.

**Bad:**
```python
@eval(input="Help me with my code")
def test_everything(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert len(ctx.output) > 100  # Length
    assert "def" in ctx.output     # Has code
    assert ctx.output.count("```") >= 2  # Formatted
    # Too many things at once
```

**Good:**
```python
@eval(input="Help me with my code", labels=["formatting"])
def test_code_formatting(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.output.count("```") >= 2, "Should use code blocks"

@eval(input="Help me with my code", labels=["content"])
def test_has_code(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert "def" in ctx.output or "function" in ctx.output
```

## Grader Design

### Grade Outcomes, Not Paths

Avoid checking that agents followed specific steps. Agents regularly find valid approaches that eval designers didn't anticipate.

**Bad:**
```python
def test_coding_task(ctx: EvalContext):
    # Too rigid - agent might solve it differently
    assert ctx.metadata["tools_called"] == ["read_file", "edit_file", "run_tests"]
```

**Good:**
```python
def test_coding_task(ctx: EvalContext):
    # Grade the outcome, not the path
    assert ctx.metadata["tests_passed"] is True
```

### Build In Partial Credit

For tasks with multiple components, represent the continuum of success.

```python
@eval(input="Process this refund request")
def test_refund(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Partial credit for each step
    if ctx.metadata.get("identity_verified"):
        ctx.add_score(True, "Verified identity", key="verification")
    else:
        ctx.add_score(False, "Failed to verify identity", key="verification")

    if ctx.metadata.get("refund_processed"):
        ctx.add_score(True, "Processed refund", key="refund")
    else:
        ctx.add_score(False, "Failed to process refund", key="refund")

    if ctx.metadata.get("confirmation_sent"):
        ctx.add_score(True, "Sent confirmation", key="confirmation")
    else:
        ctx.add_score(False, "No confirmation sent", key="confirmation")
```

### Make Graders Resistant to Gaming

The agent shouldn't be able to "cheat" the eval. Design so passing genuinely requires solving the problem.

**Bad:**
```python
def test_summarization(ctx: EvalContext):
    # Agent could just copy the input
    assert len(ctx.output) < len(ctx.input)
```

**Good:**
```python
def test_summarization(ctx: EvalContext):
    # Check it's actually a summary
    assert len(ctx.output) < len(ctx.input) * 0.5, "Should be significantly shorter"
    # Key information preserved
    assert ctx.metadata["key_facts_preserved"] >= 0.8
    # Not just truncated
    assert ctx.output[-1] in ".!?", "Should be complete sentences"
```

## Environment & Harness

### Isolate Trials

Each trial should start from a clean environment. Shared state causes correlated failures.

```python
import tempfile
import shutil

@eval(input="Create a config file")
def test_file_creation(ctx: EvalContext):
    # Use isolated temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        ctx.metadata["working_dir"] = tmpdir
        ctx.output = agent(ctx.input, working_dir=tmpdir)
        assert Path(tmpdir, "config.json").exists()
```

### Match Production Behavior

The agent in evals should function roughly the same as in production. Differences introduce noise.

## Maintenance

### Read the Transcripts

You won't know if graders are working unless you read transcripts from many trials. When scores don't climb, verify it's due to agent performance, not the eval.

### Monitor for Saturation

An eval at 100% tracks regressions but provides no signal for improvement. As evals approach saturation, graduate them to a regression suite and create harder capability evals.

### Treat Evals as Living Artifacts

Evals need ongoing attention:
- Add new test cases from production failures
- Update graders when valid solutions are rejected
- Remove or fix ambiguous tasks
- Calibrate model-based graders against human judgment

## Anti-Patterns to Avoid

1. **Vague success criteria**: "Should be helpful" is not testable
2. **Overfitting to happy paths**: Test edge cases too
3. **Class imbalance**: Test both should-do and shouldn't-do cases
4. **Rigid path checking**: Grade outcomes, not steps
5. **Shared state between trials**: Causes correlated failures
6. **Uncalibrated model graders**: Regularly validate against human judgment
7. **Ignoring transcripts**: Always review failures manually
