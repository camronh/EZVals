# Graders Reference

Choosing and implementing graders for AI agent evaluations.

## Grader Types Overview

| Type | Speed | Cost | Best For |
|------|-------|------|----------|
| **Code-based** | Fast | Free | Exact values, patterns, structure |
| **Model-based** | Slow | $$$ | Subjective quality, semantics |
| **Human** | Slowest | $$$$ | Gold standard, calibration |

## Code-Based Graders

Use when you can verify correctness programmatically.

### Strengths
- Fast and cheap
- Objective and reproducible
- Easy to debug
- Verify specific conditions

### Weaknesses
- Brittle to valid variations
- Can't assess nuance
- Limited for subjective tasks

### Patterns

**Exact Match:**
```python
@eval(input="What is 2+2?", reference="4")
def test_exact(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.output.strip() == ctx.reference
```

**Pattern Matching:**
```python
import re

@eval(input="Generate an email address")
def test_email_format(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    assert re.match(pattern, ctx.output), "Invalid email format"
```

**JSON Structure:**
```python
import json

@eval(input="Return user data as JSON")
def test_json_structure(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    data = json.loads(ctx.output)
    assert "name" in data, "Missing name field"
    assert "email" in data, "Missing email field"
    assert isinstance(data["name"], str), "Name should be string"
```

**String Contains:**
```python
@eval(input="Explain photosynthesis")
def test_key_concepts(ctx: EvalContext):
    ctx.output = agent(ctx.input).lower()
    assert "sunlight" in ctx.output, "Should mention sunlight"
    assert "carbon dioxide" in ctx.output or "co2" in ctx.output
    assert "oxygen" in ctx.output, "Should mention oxygen"
```

**Unit Tests on Generated Code:**
```python
@eval(input="Write a function to reverse a string")
def test_code_correctness(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Execute the generated code
    exec(ctx.output, globals())

    # Test it
    assert reverse("hello") == "olleh"
    assert reverse("") == ""
    assert reverse("a") == "a"
```

**State Verification:**
```python
@eval(input="Create a user account")
def test_account_created(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Check the actual state
    user = db.get_user(ctx.metadata["user_id"])
    assert user is not None, "User not created"
    assert user.email_verified is False, "Should not auto-verify"
```

## Model-Based Graders

Use when correctness is subjective or requires understanding.

### Strengths
- Flexible and scalable
- Captures nuance
- Handles open-ended tasks
- Works with freeform output

### Weaknesses
- Non-deterministic
- More expensive
- Requires calibration

### Patterns

**Rubric Scoring:**
```python
from anthropic import Anthropic

client = Anthropic()

def grade_with_rubric(ctx: EvalContext):
    rubric = """
    Score the response on a scale of 1-5:
    5: Comprehensive, accurate, well-structured
    4: Mostly complete, minor issues
    3: Adequate but missing key points
    2: Significant gaps or errors
    1: Incorrect or irrelevant
    """

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        messages=[{
            "role": "user",
            "content": f"""
            {rubric}

            Question: {ctx.input}
            Response: {ctx.output}

            Score (1-5):
            """
        }]
    )

    score = int(response.content[0].text.strip())
    ctx.add_score(score >= 4, f"Rubric score: {score}/5", key="quality")

@eval(input="Explain machine learning", evaluators=[grade_with_rubric])
def test_explanation(ctx: EvalContext):
    ctx.output = agent(ctx.input)
```

**Natural Language Assertions:**
```python
def check_assertions(ctx: EvalContext):
    assertions = [
        "The response shows empathy for the customer's frustration",
        "The resolution is clearly explained",
        "The response is grounded in policy"
    ]

    for assertion in assertions:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10,
            messages=[{
                "role": "user",
                "content": f"""
                Response: {ctx.output}

                Is this true? "{assertion}"
                Answer only YES or NO.
                """
            }]
        )
        passed = "YES" in response.content[0].text.upper()
        ctx.add_score(passed, assertion, key=assertion[:20])
```

**Reference Comparison:**
```python
def compare_to_reference(ctx: EvalContext):
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        messages=[{
            "role": "user",
            "content": f"""
            Reference answer: {ctx.reference}
            Candidate answer: {ctx.output}

            Does the candidate answer convey the same key information?
            Answer YES or NO, then explain briefly.
            """
        }]
    )

    passed = response.content[0].text.strip().upper().startswith("YES")
    ctx.add_score(passed, "Matches reference semantically", key="semantic_match")
```

### Calibration Tips

1. **Give the LLM an out**: Include "Unknown" option when information is insufficient
2. **Use structured rubrics**: Clear criteria reduce inconsistency
3. **Grade dimensions separately**: Use isolated judges for each aspect
4. **Validate against humans**: Regularly compare LLM grades to expert grades
5. **Use majority voting**: Run multiple judges and take consensus

## Human Graders

Use for gold standard quality and calibrating automated graders.

### When to Use
- Calibrating model-based graders
- Subjective tasks where consensus is needed
- High-stakes decisions
- Building ground truth datasets

### Patterns

**Structured Scoring:**
```python
# Define clear criteria for human raters
RATING_CRITERIA = """
Rate each dimension 1-5:

1. Accuracy: Is the information correct?
2. Completeness: Are all key points covered?
3. Clarity: Is it easy to understand?
4. Tone: Is the tone appropriate?

Provide scores and brief justification for each.
"""
```

**Inter-Annotator Agreement:**
- Have multiple raters grade the same samples
- Measure agreement (Cohen's kappa, Krippendorff's alpha)
- Reconcile disagreements through discussion
- Use agreed labels as ground truth

### Cost Management

Human grading is expensive. Use strategically:
1. Grade a sample (not all) for calibration
2. Use humans to create ground truth, then train LLM graders
3. Reserve for periodic spot-checks
4. Focus human effort on ambiguous cases

## Combining Graders

Most effective evals combine multiple grader types:

```python
@eval(input="Write a support response to a frustrated customer")
def test_support_response(ctx: EvalContext):
    ctx.output = agent(ctx.input)

    # Code-based: Check structure
    assert len(ctx.output) > 50, "Response too short"
    assert "?" not in ctx.output[:20], "Don't start with questions"

    # Code-based: Check forbidden content
    assert "your fault" not in ctx.output.lower(), "Never blame customer"

    # Model-based: Check quality (as evaluator)
    # grade_with_rubric(ctx)  # Called via evaluators parameter
```

## Scoring Strategies

**Binary (All Must Pass):**
```python
def test_strict(ctx: EvalContext):
    assert condition_1
    assert condition_2
    assert condition_3
    # All must pass or eval fails
```

**Weighted Scoring:**
```python
def test_weighted(ctx: EvalContext):
    score = 0
    if condition_1:
        score += 0.5
    if condition_2:
        score += 0.3
    if condition_3:
        score += 0.2
    ctx.add_score(score, f"Weighted score: {score}", key="weighted")
    assert score >= 0.7, "Did not meet threshold"
```

**Partial Credit:**
```python
def test_partial(ctx: EvalContext):
    ctx.add_score(condition_1, "Step 1", key="step_1")
    ctx.add_score(condition_2, "Step 2", key="step_2")
    ctx.add_score(condition_3, "Step 3", key="step_3")
    # Each step scored independently
```
