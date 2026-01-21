# Graders

Choosing and implementing graders for AI agent evaluations. The grader is the logic that determines whether an agent's output is correct, and it's often where evals succeed or fail.

## Choosing the Right Grader Type

| Type | Speed | Cost | Best For |
|------|-------|------|----------|
| **Code-based** | Fast | Free | Exact values, patterns, structure, verifiable outcomes |
| **Model-based** | Slow | $$$ | Subjective quality, semantic correctness, open-ended tasks |
| **Human** | Slowest | $$$$ | Gold standard labels, calibrating LLM judges, ambiguous cases |

**Start with code-based graders whenever possible.** They're fast, cheap, and deterministic. Only escalate to model-based when code can't capture what you need to check. Reserve human grading for calibration and ground truth.

## Code-Based Graders

Use when you can verify correctness programmatically. These should be your default choice.

### When to Use

- Checking for specific strings, numbers, or patterns
- Validating JSON structure or schema
- Running unit tests on generated code
- Verifying state changes (database writes, file changes)
- Checking tool call parameters
- Transcript analysis (token counts, turn counts)

### Strengths

- **Fast**: Milliseconds to execute
- **Cheap**: No API calls
- **Objective**: Same input always produces same result
- **Reproducible**: Easy to debug and explain failures
- **Precise**: Can verify specific conditions exactly

### Weaknesses

- **Brittle**: Can reject valid variations that don't match expected patterns
- **Limited nuance**: Can't assess "mostly correct" or "partially helpful"
- **Not semantic**: `"30 days"` and `"one month"` are different strings

### Patterns

**String Contains:**
```python
@eval(input="What is the return policy?", reference="30 days", dataset="qa")
def test_contains_answer(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.reference.lower() in ctx.output.lower(), \
        f"Expected '{ctx.reference}' in output"
```

**Exact Match:**
```python
@eval(input="What is 2+2?", reference="4")
def test_exact(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.output.strip() == ctx.reference
```

**Regex Patterns:**
```python
import re

@eval(input="Generate a valid email")
def test_email_format(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    assert re.match(pattern, ctx.output), "Invalid email format"
```

**JSON Structure Validation:**
```python
import json

@eval(input="Return user data as JSON")
def test_json_structure(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    data = json.loads(ctx.output)
    assert "name" in data, "Missing 'name' field"
    assert "email" in data, "Missing 'email' field"
    assert isinstance(data["name"], str), "Name should be string"
```

**Unit Tests on Generated Code:**
```python
@eval(input="Write a function to reverse a string")
def test_code_correctness(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Execute the generated code
    local_ns = {}
    exec(ctx.output, {}, local_ns)
    reverse = local_ns['reverse']

    # Test it
    assert reverse("hello") == "olleh"
    assert reverse("") == ""
    assert reverse("a") == "a"
```

**State Verification:**
```python
@eval(input="Book a flight from NYC to LAX on March 15")
def test_booking_created(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Check the actual state in the environment
    booking = db.get_latest_booking(user_id=ctx.metadata["user_id"])
    assert booking is not None, "No booking created"
    assert booking.origin == "NYC", "Wrong origin"
    assert booking.destination == "LAX", "Wrong destination"
```

**Tool Call Verification:**
```python
@eval(input="Search for Python tutorials")
def test_used_search(ctx: EvalContext):
    result = agent_with_trace(ctx.input)
    ctx.output = result.output

    # Check that search was called (when you specifically need this)
    search_calls = [c for c in result.tool_calls if c.name == "search"]
    assert len(search_calls) > 0, "Should have used search tool"
```

Note: Only verify tool calls when you're specifically optimizing tool usage. For most evals, test the output, not the path.

## Model-Based Graders (LLM-as-Judge)

Use when correctness is subjective or requires semantic understanding.

### When to Use

- Assessing answer quality, helpfulness, or appropriateness
- Checking semantic equivalence ("30 days" = "one month")
- Evaluating tone, empathy, or communication style
- Grading open-ended creative tasks
- Checking groundedness (is the answer supported by context?)

### Strengths

- **Flexible**: Can evaluate nuanced, subjective qualities
- **Scalable**: Cheaper than human review at scale
- **Semantic**: Understands meaning, not just strings

### Weaknesses

- **Non-deterministic**: Same input can produce different scores
- **Expensive**: Each grading call costs money and time
- **Requires calibration**: Must validate against human judgment
- **Can be gamed**: Model might favor certain phrasings

### Binary vs Likert Scales

**Prefer binary (pass/fail) over Likert scales (1-5 ratings).**

Engineers often believe Likert scales provide more information. In practice, they create more problems:

- The difference between adjacent points (3 vs 4) is subjective and inconsistent across judges
- Detecting statistical differences requires larger sample sizes
- Judges often default to middle values to avoid hard decisions
- Binary forces clearer thinking: "Is this acceptable or not?"

If you need to track gradual improvements, measure specific sub-components with their own binary checks rather than using a scale. Instead of rating "factual accuracy 1-5", track "4 out of 5 expected facts included" as separate binary checks.

### Patterns

**Binary Pass/Fail Judge:**
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
    ctx.output = agent(ctx.input)
    passed, reasoning = llm_judge(
        ctx.input,
        ctx.output,
        "The response correctly answers the question with accurate information"
    )
    ctx.store(scores={"passed": passed, "key": "quality", "notes": reasoning})
    assert passed, reasoning
```

**Natural Language Assertions:**
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
    ctx.output = support_agent(ctx.input)

    checks = check_assertions(ctx.output, [
        "Shows empathy for the customer's frustration",
        "Clearly explains the resolution or next steps",
        "Maintains a professional and helpful tone"
    ])

    for assertion, passed in checks.items():
        ctx.store(scores={"passed": passed, "key": assertion[:20], "notes": assertion})

    assert all(checks.values()), f"Failed: {[a for a,p in checks.items() if not p]}"
```

**Semantic Equivalence:**
```python
def semantically_equivalent(output: str, reference: str) -> bool:
    """Check if output conveys the same information as reference"""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=50,
        messages=[{
            "role": "user",
            "content": f"""Reference answer: {reference}
Candidate answer: {output}

Does the candidate answer convey the same key information as the reference?
Answer YES or NO."""
        }]
    )
    return "YES" in response.content[0].text.upper()
```

### Calibrating LLM Judges

LLM-as-judge graders require calibration against human judgment. The judge should reflect YOUR opinion, not the LLM's default behavior.

**Calibration process:**

1. **Create labeled examples**: Have a human (ideally a domain expert) grade 50-100 outputs as pass/fail with brief reasoning.

2. **Test the judge**: Run your LLM judge on the same examples.

3. **Measure alignment**: Calculate True Positive Rate (correctly passes things humans passed) and True Negative Rate (correctly fails things humans failed).

4. **Iterate on the prompt**: If alignment is poor, refine your judge prompt. Add clearer criteria, examples, or edge case guidance.

5. **Use validated examples as few-shots**: The human-labeled examples can become few-shot examples in your judge prompt.

```python
# Example: Calibration test
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

    tpr = results["tp"] / (results["tp"] + results["fn"])  # Sensitivity
    tnr = results["tn"] / (results["tn"] + results["fp"])  # Specificity

    print(f"True Positive Rate: {tpr:.1%}")
    print(f"True Negative Rate: {tnr:.1%}")
    return results
```

**Tips for better judges:**

1. **Give the LLM an out**: Include "UNKNOWN" or "UNCLEAR" options when information is insufficient. This prevents hallucinated judgments.

2. **Grade dimensions separately**: Use isolated judges for each aspect (accuracy, tone, completeness) rather than one judge for everything.

3. **Use structured output**: Request JSON or a specific format to make parsing reliable.

4. **Consider majority voting**: Run the judge 3 times and take consensus for important decisions.

## Human Graders

Use for establishing ground truth and calibrating automated graders.

### When to Use

- Creating labeled datasets for calibrating LLM judges
- High-stakes decisions where automated grading isn't trusted
- Subjective tasks where expert judgment is the only standard
- Periodic spot-checks to verify automated graders still work

### The Benevolent Dictator Model

For most small to medium teams, appoint a single domain expert as the "benevolent dictator" for quality standards. This person—whether a domain expert, product manager, or team lead—becomes the definitive voice on what "good" looks like.

A single expert:
- Eliminates annotation conflicts
- Prevents paralysis from "too many cooks"
- Can incorporate input from others but drives decisions
- Builds consistent standards over time

If you feel like you need five experts to judge a single interaction, your product scope might be too broad.

### Structured Annotation

When using human graders, provide clear criteria:

```
GRADING CRITERIA FOR SUPPORT RESPONSES

For each response, answer:

1. ACCURACY (Pass/Fail)
   Pass: All factual claims are correct
   Fail: Contains any incorrect information

2. COMPLETENESS (Pass/Fail)
   Pass: Addresses all parts of the customer's question
   Fail: Misses any part of what they asked

3. TONE (Pass/Fail)
   Pass: Professional, empathetic, appropriate
   Fail: Rude, dismissive, or inappropriate

For each dimension, provide a brief justification.
```

### Inter-Annotator Agreement

When multiple humans grade the same content:

1. Have each annotator label a shared set of traces independently
2. Measure agreement using Cohen's Kappa (accounts for chance agreement)
3. Discuss disagreements to refine criteria
4. Use agreed labels as ground truth

Low agreement often signals ambiguous criteria, not bad annotators. Refine your rubric.

### Managing Cost

Human grading is expensive. Use strategically:

1. **Sample, don't grade everything**: 50-100 labeled examples is often enough for calibration
2. **Create ground truth once**: Use human labels to train/calibrate LLM judges, then automate
3. **Spot-check periodically**: Verify automated graders with occasional human review
4. **Focus on ambiguous cases**: Let automation handle clear passes/fails; escalate edge cases

## Reducing Grader Flakiness

LLM-based graders are non-deterministic. Here's how to reduce flakiness:

**1. Use temperature=0**: More consistent (though not perfectly deterministic) outputs.

**2. Constrain the output format**:
```python
# Bad: open-ended response
"Evaluate the quality..."

# Good: constrained format
"Answer only PASS or FAIL, then a one-sentence reason."
```

**3. Make criteria specific**:
```python
# Bad: vague
"Is the response good?"

# Good: specific
"Does the response mention the return policy deadline?"
```

**4. Accept some flakiness**: If your judge is 95% accurate and consistent, that may be good enough for measuring relative performance. You're comparing prompt A to prompt B, not seeking absolute truth.

## Combining Graders

The most effective evals combine multiple grader types:

```python
@eval(input="Handle a refund request from a frustrated customer")
def test_support_response(ctx: EvalContext):
    ctx.output = support_agent(ctx.input)

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

## Scoring Strategies

**Binary (all must pass):**
```python
def test_strict(ctx: EvalContext):
    assert condition_1, "Failed condition 1"
    assert condition_2, "Failed condition 2"
    # All must pass or eval fails
```

**Partial Credit (independent scores):**
```python
@eval(input="test query", dataset="multi_score")
def test_partial(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    ctx.store(scores=[
        {"passed": condition_1, "key": "accuracy", "notes": "Accuracy check"},
        {"passed": condition_2, "key": "completeness", "notes": "Completeness check"},
        {"passed": condition_3, "key": "tone", "notes": "Tone check"},
    ])
    # Each dimension scored independently, can see which failed
```

**Weighted Threshold:**
```python
@eval(input="test query", dataset="weighted")
def test_weighted(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    score = 0
    if accuracy_check(ctx.output):
        score += 0.5  # Accuracy is most important
    if completeness_check(ctx.output):
        score += 0.3
    if tone_check(ctx.output):
        score += 0.2

    ctx.store(scores={"value": score, "key": "weighted", "notes": f"Score: {score:.0%}"})
    assert score >= 0.7, f"Score {score:.0%} below 70% threshold"
```

Choose based on what you're trying to learn. Partial credit gives more diagnostic information; strict binary is simpler to track.
