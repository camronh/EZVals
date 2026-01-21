---
name: ezvals
description: Write, run, and analyze LLM evaluations using EZVals
globs:
  - "**/*_eval.py"
  - "**/eval_*.py"
  - "**/evals/**/*.py"
---

<!-- Version: 0.1.1 | Requires: ezvals >=0.1.0 -->

# EZVals Evaluation Skill

Write, run, and analyze evaluations for AI agents and LLM applications.

## Quick Reference

### @eval Decorator

```python
from ezvals import eval, EvalContext

@eval(
    input="User message",           # Pre-populate ctx.input
    reference="Expected output",    # Pre-populate ctx.reference
    dataset="dataset_name",         # Groups related evals (defaults to filename)
    labels=["tag1", "tag2"],        # Filtering tags
    metadata={"key": "value"},      # Pre-populate ctx.metadata
    timeout=30.0,                   # Max execution time in seconds
    target=callable,                # Pre-hook that runs before the eval
    evaluators=[evaluator_fn],      # Post-execution scoring functions
)
async def test_example(ctx: EvalContext):
    ctx.output = await my_agent(ctx.input)
    assert ctx.output is not None
```

### EvalContext

Auto-injected when you add `ctx: EvalContext` parameter:

```python
# Direct field access
ctx.input = "test input"
ctx.output = "model response"
ctx.reference = "expected output"
ctx.metadata["model"] = "gpt-4"

# Scoring with assertions (preferred)
assert ctx.output is not None, "Got no output"
assert "expected" in ctx.output.lower(), "Missing content"

# Manual scoring
ctx.add_score(True, "Test passed")                    # Boolean
ctx.add_score(0.95, "High score", key="similarity")   # Numeric with key
```

### @parametrize

Generate multiple evals from one function:

```python
from ezvals import eval, parametrize, EvalContext

@eval(dataset="sentiment")
@parametrize("input,reference", [
    ("I love this!", "positive"),
    ("This is terrible", "negative"),
])
def test_sentiment(ctx: EvalContext):
    ctx.output = analyze(ctx.input)
    assert ctx.output == ctx.reference
```

### CLI Commands

```bash
# Run evals headlessly
ezvals run path/to/evals

# Interactive web UI
ezvals serve path/to/evals

# Rich terminal output
ezvals run path/to/evals --visual

# Filter by dataset or label
ezvals run path/to/evals -d dataset_name -l label

# Run specific function
ezvals run path/to/evals.py::function_name
```

## Best Practices

### Choosing Graders

**Use code-based graders when:**
- Checking exact values or patterns (`assert output == expected`)
- Validating JSON structure or types
- Measuring latency, token count, or cost
- Checking for presence/absence of specific strings

**Use model-based graders when:**
- Assessing subjective quality (tone, helpfulness, coherence)
- Comparing semantic similarity
- Evaluating multi-turn conversation quality
- Checking factual accuracy against references

### Task Design

1. **Unambiguous specs**: Define exactly what "good" looks like
2. **Reference solutions**: Include expected outputs when possible
3. **Balanced datasets**: Cover edge cases, not just happy paths
4. **Atomic tests**: One behavior per eval function

### Agent Patterns

**Coding agents:**
```python
@eval(input="Write a function that reverses a string", dataset="coding")
async def test_code_gen(ctx: EvalContext):
    ctx.output = await coding_agent(ctx.input)
    # Test the generated code
    exec_result = exec(ctx.output + "\nassert reverse('hello') == 'olleh'")
    assert exec_result is None  # No exception = passed
```

**Conversational agents:**
```python
@eval(input="I need help with my order", dataset="support")
async def test_support(ctx: EvalContext):
    ctx.output = await support_agent(ctx.input)
    assert len(ctx.output) > 20, "Response too short"
    assert "help" in ctx.output.lower(), "Should offer help"
```

**Research agents:**
```python
@eval(
    input="What are the latest developments in quantum computing?",
    dataset="research"
)
async def test_research(ctx: EvalContext):
    ctx.output = await research_agent(ctx.input)
    ctx.metadata["sources"] = ctx.output.get("sources", [])
    assert len(ctx.output["answer"]) > 100
    assert len(ctx.output.get("sources", [])) > 0, "Should cite sources"
```

## Workflows

### Writing New Evals

1. Create a file ending in `_eval.py` or `eval_*.py`
2. Import: `from ezvals import eval, EvalContext`
3. Define function with `@eval` decorator and `ctx: EvalContext` parameter
4. Set `ctx.output` with your agent's response
5. Use `assert` statements to score pass/fail

### Running & Analyzing

```bash
# Quick validation
ezvals run evals/ --visual

# Interactive exploration
ezvals serve evals/

# CI/CD (outputs JSON)
ezvals run evals/ --no-save
```

### File-Level Defaults

Set defaults for all evals in a file:

```python
ezvals_defaults = {
    "dataset": "my_dataset",
    "labels": ["production"],
    "metadata": {"model": "gpt-4"}
}

@eval(input="test")  # Inherits defaults
def test_example(ctx: EvalContext):
    ...
```

## Resources

- [EZVals Documentation](https://github.com/camronh/EZVals)
- [Anthropic Eval Guide](https://www.anthropic.com/research/evaluations-guide)
