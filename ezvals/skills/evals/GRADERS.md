# Graders

The grader is the logic that determines whether an agent's output is correct. Choosing the right grader type is often where evals succeed or fail.

## Choosing the Right Type

| Type | Speed | Cost | Best For |
|------|-------|------|----------|
| **Code-based** | Fast | Free | Exact values, patterns, structure, verifiable outcomes |
| **Model-based** | Slow | $$$ | Subjective quality, semantic correctness, open-ended tasks |
| **Human** | Slowest | $$$$ | Gold standard labels, calibrating LLM judges, ambiguous cases |

**Start with code-based graders whenever possible.** They're fast, cheap, and deterministic. Only escalate to model-based when code can't capture what you need to check.

## Code-Based Graders

Use when you can verify correctness programmatically. These should be your default.

### Assertions

The simplest approach—use Python's `assert` like pytest:

```python
@eval(input="What is the capital of France?", dataset="qa")
async def test_capital(ctx: EvalContext):
    ctx.store(output=await my_agent(ctx.input))
    assert "paris" in ctx.output.lower(), "Should mention Paris"
```

When assertions pass, your eval passes. When they fail, the assertion message becomes the failure reason.

### Multiple Assertions

Chain assertions to check multiple conditions:

```python
@eval(input="I want a refund", dataset="support")
async def test_refund_response(ctx: EvalContext):
    ctx.store(output=await support_agent(ctx.input))

    assert len(ctx.output) > 20, "Response too short"
    assert "refund" in ctx.output.lower(), "Should acknowledge refund"
    assert "sorry" in ctx.output.lower() or "apologize" in ctx.output.lower(), \
        "Should express empathy"
```

### Regex Patterns

```python
import re

@eval(input="Generate a valid email")
def test_email_format(ctx: EvalContext):
    ctx.store(output=agent(ctx.input))
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    assert re.match(pattern, ctx.output), "Invalid email format"
```

### JSON Validation

```python
import json

@eval(input="Return user data as JSON")
def test_json_structure(ctx: EvalContext):
    ctx.store(output=agent(ctx.input))
    data = json.loads(ctx.output)
    assert "name" in data, "Missing 'name' field"
    assert "email" in data, "Missing 'email' field"
```

### State Verification

For agents that modify external state, verify the actual outcome:

```python
@eval(input="Book a flight from NYC to LAX on March 15", metadata={"user_id": "test_user"})
async def test_booking_created(ctx: EvalContext):
    ctx.store(output=await booking_agent(ctx.input))

    # Check actual state, not just what the agent said
    booking = await db.get_latest_booking(user_id=ctx.metadata["user_id"])
    assert booking is not None, "No booking created"
    assert booking.origin == "NYC", "Wrong origin"
    assert booking.destination == "LAX", "Wrong destination"
```

## Model-Based Graders (LLM-as-Judge)

Use when correctness is subjective or requires semantic understanding.

### Binary Pass/Fail Judge

```python
from anthropic import Anthropic

client = Anthropic()

def llm_judge(question: str, output: str, criteria: str) -> tuple[bool, str]:
    """Returns (passed, reasoning)"""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""Evaluate if this response meets the criteria.

Question: {question}
Response: {output}
Criteria: {criteria}

Does the response meet the criteria? Answer with:
PASS: [brief reason]
or
FAIL: [brief reason]"""
        }]
    )

    text = response.content[0].text.strip()
    passed = text.upper().startswith("PASS")
    return passed, text

@eval(input="What is our refund policy?", dataset="qa")
def test_answer_quality(ctx: EvalContext):
    ctx.store(output=agent(ctx.input))
    passed, reasoning = llm_judge(
        ctx.input,
        ctx.output,
        "The response correctly answers the question with accurate information"
    )
    ctx.store(scores={"passed": passed, "key": "quality", "notes": reasoning})
    assert passed, reasoning
```

### Natural Language Assertions

Check multiple criteria about an output:

```python
def check_assertions(output: str, assertions: list[str]) -> dict[str, bool]:
    """Check multiple assertions about an output"""
    results = {}
    for assertion in assertions:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10,
            messages=[{
                "role": "user",
                "content": f"""Response to evaluate: {output}

Is this true? "{assertion}"
Answer only YES or NO."""
            }]
        )
        results[assertion] = "YES" in response.content[0].text.upper()
    return results

@eval(input="Handle a frustrated customer asking for a refund")
def test_support_quality(ctx: EvalContext):
    ctx.store(output=support_agent(ctx.input))

    checks = check_assertions(ctx.output, [
        "Shows empathy for the customer's frustration",
        "Clearly explains the resolution or next steps",
        "Maintains a professional and helpful tone"
    ])

    for assertion, passed in checks.items():
        ctx.store(scores={"passed": passed, "key": assertion[:20], "notes": assertion})

    assert all(checks.values()), f"Failed: {[a for a,p in checks.items() if not p]}"
```

### Binary vs Likert Scales

**Prefer binary (pass/fail) over Likert scales (1-5 ratings).**

Problems with Likert:
- Difference between adjacent points (3 vs 4) is subjective
- Detecting statistical differences requires larger samples
- Judges often default to middle values
- Binary forces clearer thinking: "Is this acceptable or not?"

If you need gradual improvement tracking, use separate binary checks for sub-components rather than a scale.

### Calibrating LLM Judges

LLM judges require calibration against human judgment:

1. **Create labeled examples**: Have a human grade 50-100 outputs as pass/fail
2. **Test the judge**: Run your LLM judge on the same examples
3. **Measure alignment**: Calculate True Positive Rate and True Negative Rate
4. **Iterate**: If alignment is poor, refine the judge prompt
5. **Use as few-shots**: Human-labeled examples can become few-shot examples

```python
def calibrate_judge(judge_fn, labeled_examples):
    """Test judge against human labels"""
    results = {"tp": 0, "tn": 0, "fp": 0, "fn": 0}

    for example in labeled_examples:
        judge_passed, _ = judge_fn(example["output"])
        human_passed = example["human_label"]

        if judge_passed and human_passed:
            results["tp"] += 1
        elif not judge_passed and not human_passed:
            results["tn"] += 1
        elif judge_passed and not human_passed:
            results["fp"] += 1
        else:
            results["fn"] += 1

    tpr = results["tp"] / (results["tp"] + results["fn"])
    tnr = results["tn"] / (results["tn"] + results["fp"])

    print(f"True Positive Rate: {tpr:.1%}")
    print(f"True Negative Rate: {tnr:.1%}")
```

## Multiple Scores with store()

Use `ctx.store(scores=...)` for numeric scores or multiple named metrics:

```python
@eval(input="Explain quantum computing", dataset="qa")
async def test_comprehensive(ctx: EvalContext):
    ctx.store(output=await my_agent(ctx.input))

    # Multiple independent metrics
    ctx.store(scores=[
        {"passed": "quantum" in ctx.output.lower(), "key": "relevance"},
        {"passed": len(ctx.output) < 500, "key": "brevity"},
        {"value": similarity_score(ctx.output, reference), "key": "similarity"}
    ])
```

### Score Structure

```python
{
    "key": "metric_name",    # Identifier (default: "correctness")
    "value": 0.95,           # Optional: numeric score (0-1 range)
    "passed": True,          # Optional: boolean pass/fail
    "notes": "Explanation"   # Optional: human-readable notes
}
```

Every score must have at least one of `value` or `passed`.

## Combining Graders

The most effective evals combine multiple grader types:

```python
@eval(input="Handle a refund request from a frustrated customer")
def test_support_response(ctx: EvalContext):
    ctx.store(output=support_agent(ctx.input))

    # Code-based: structural checks (fast, free)
    assert len(ctx.output) > 50, "Response too short"
    assert "your fault" not in ctx.output.lower(), "Never blame customer"

    # Code-based: required content
    assert any(word in ctx.output.lower() for word in ["refund", "return", "process"]), \
        "Should mention refund process"

    # Model-based: quality check (slower, costs money)
    passed, reasoning = llm_judge(
        ctx.input, ctx.output,
        "Response shows empathy and provides clear next steps"
    )
    ctx.store(scores={"passed": passed, "key": "quality", "notes": reasoning})
    assert passed, reasoning
```

**Order matters**: Run cheap code-based checks first. If they fail, skip expensive LLM calls.

## Reducing Grader Flakiness

LLM-based graders are non-deterministic. To reduce flakiness:

1. **Use temperature=0**: More consistent outputs
2. **Constrain output format**: "PASS or FAIL" is more consistent than open-ended
3. **Make criteria specific**: "Does the response mention the deadline?" not "Is it good?"
4. **Run multiple trials**: Majority vote for important decisions

```python
def grade_with_confidence(output, trials=3):
    results = [llm_judge(output) for _ in range(trials)]
    pass_rate = sum(r[0] for r in results) / len(results)
    return pass_rate >= 0.67  # Majority passed
```

## Evaluators (Post-Processing)

Evaluators are functions that run after the eval completes and add additional scores:

```python
def check_format(result):
    """Check if output is valid JSON."""
    try:
        json.loads(result.output)
        return {"key": "format", "passed": True}
    except:
        return {"key": "format", "passed": False, "notes": "Invalid JSON"}

@eval(input="Get user data", dataset="api", evaluators=[check_format])
async def test_json_response(ctx: EvalContext):
    ctx.store(output=await api_call(ctx.input))
    assert "user" in ctx.output, "Should contain user data"
```

Evaluators are useful for reusable checks across many evals.
