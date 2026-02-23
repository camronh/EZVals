# Graders

The grader is the logic that determines whether an agent's output is correct. Choosing the right grader type is often where evals succeed or fail.

## Choosing the Right Type

| Type | Speed | Cost | Best For |
|------|-------|------|----------|
| **Code-based** | Fast | Free | Structural checks: JSON shape, tool names, state changes |
| **Model-based** | Slow | $$$ | Evaluating agent responses: accuracy, tone, groundedness, refusal |
| **Human** | Slowest | $$$$ | Gold standard labels, calibrating LLM judges, ambiguous cases |

**Use code-based graders for structural/mechanical checks** — JSON structure, tool names, state changes, file existence. They're fast, cheap, and deterministic. But don't use them for evaluating natural language responses, even when the expected answer is a known value.

**Use LLM judges when evaluating agent responses.** Any time you're checking whether an agent's natural language output is correct, faithful, or appropriate, use an LLM judge. This includes:

- **Refusal/guardrail checking** — refusal language varies widely ("I can't help with that", "That's outside my scope", redirecting to what the agent *can* do). Keyword matching is brittle and misses nuanced refusals. **Important**: guardrail evals need both should-refuse AND should-answer cases. Include in-scope queries (e.g., "What is your return policy?") marked as "should answer" alongside out-of-scope queries marked as "should refuse" — the judge must fail both: answering out-of-scope AND refusing in-scope.
- **Factual accuracy** — even when expected answers are known (prices, dates, policies), an LLM judge is more robust than substring matching. Substring checks miss wrong-context hits (agent mentions "$999.99" but for the wrong product), can't detect confident-but-wrong paraphrasing, and won't catch when the agent declines to answer an answerable question. Use an LLM judge for accuracy evals; supplement with code checks for exact values when needed.
- **Tone and style** — professionalism, empathy, and clarity are inherently subjective. Code-based checks (e.g., looking for "sorry") produce false positives and miss the point.
- **Groundedness / hallucination** — verifying that claims are supported by source documents requires semantic understanding, not keyword matching. Even when your knowledge base has exact values, the core hallucination grader should be an LLM judge that compares the response against retrieved sources — it catches wrong-context citations, subtle fabrications, and confident answers on topics the agent doesn't actually know enough about.

**Use a single holistic pass/fail for subjective evals.** When grading tone, style, or overall quality, use one LLM judge call that evaluates all criteria together and returns a single pass/fail. Don't split subjective dimensions (e.g., "professional" and "empathetic") into separate scores — the individual scores aren't actionable and they fragment what should be a unified judgment.

## Code-Based Graders

Use when you can verify pass programmatically. These should be your default.

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

Use when pass is subjective or requires semantic understanding.

### Binary Pass/Fail Judge

```python
import json
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

Return ONLY a JSON object:
{{"passed": true, "reasoning": "brief explanation"}}
or
{{"passed": false, "reasoning": "brief explanation"}}"""
        }]
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    verdict = json.loads(text.strip())
    return verdict["passed"], verdict.get("reasoning", "")

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

### Holistic Subjective Judgment

For subjective qualities (tone, style, professionalism), use a single judge call that evaluates all criteria together:

```python
@eval(input="Handle a frustrated customer asking for a refund")
def test_support_quality(ctx: EvalContext):
    ctx.store(output=support_agent(ctx.input))

    passed, reasoning = llm_judge(
        ctx.input,
        ctx.output,
        "The response is professional, shows empathy for the customer's frustration, "
        "clearly explains the resolution or next steps, and maintains a helpful tone"
    )
    ctx.store(scores={"passed": passed, "key": "quality", "notes": reasoning})
    assert passed, reasoning
```

This is better than checking each criterion separately because subjective qualities interact — a response can be technically empathetic but miss the mark overall. One holistic judgment captures this.

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
    "key": "metric_name",    # Identifier (default: "pass")
    "value": 0.95,           # Optional: numeric score (0-1 range)
    "passed": True,          # Optional: boolean pass/fail
    "notes": "Explanation"   # Optional: human-readable notes
}
```

Every score must have at least one of `value` or `passed`.

### Numeric Performance Scores

For latency, cost, and other performance metrics, store them as **numeric scores with `value`**, not just pass/fail assertions. The main value of performance evals is tracking numbers over time across runs — a hard threshold tells you "too slow" but doesn't show improvement trends.

```python
ctx.store(scores=[
    {"value": ctx.latency, "key": "latency_s",
     "passed": ctx.latency < 2.0,  # optional threshold
     "notes": f"{ctx.latency:.2f}s"},
    {"value": cost_usd, "key": "cost_usd",
     "notes": f"${cost_usd:.4f}"},
])
```

Store latency in `trace_data` or use the built-in `ctx.store(latency=...)` field. Store token counts and cost in `trace_data`. Then use `ezvals serve` with run comparison to see how metrics change across optimization attempts.

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
