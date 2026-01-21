# EZVals Reference

Complete API reference for the EZVals evaluation framework.

## @eval Decorator

Mark a function as an evaluation:

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

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `str` | Pre-populate `ctx.input` |
| `reference` | `str` | Pre-populate `ctx.reference` (expected output) |
| `dataset` | `str` | Group name for filtering (defaults to filename) |
| `labels` | `list[str]` | Tags for filtering |
| `metadata` | `dict` | Pre-populate `ctx.metadata` |
| `timeout` | `float` | Max execution time in seconds |
| `target` | `callable` | Function to run before eval (result stored in `ctx.output`) |
| `evaluators` | `list[callable]` | Post-execution scoring functions |

## EvalContext

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

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `input` | `str` | The input to evaluate |
| `output` | `Any` | The output to grade |
| `reference` | `str` | Expected/ideal output |
| `metadata` | `dict` | Arbitrary key-value data |

### Methods

| Method | Description |
|--------|-------------|
| `add_score(value, notes, key)` | Add a score manually |

## @parametrize

Generate multiple evals from one function:

```python
from ezvals import eval, parametrize, EvalContext

@eval(dataset="sentiment")
@parametrize("input,reference", [
    ("I love this!", "positive"),
    ("This is terrible", "negative"),
    ("It's okay", "neutral"),
])
def test_sentiment(ctx: EvalContext):
    ctx.output = analyze(ctx.input)
    assert ctx.output == ctx.reference
```

### CSV Files

Load test cases from CSV:

```python
@eval(dataset="qa")
@parametrize("input,reference", csv="test_cases.csv")
def test_qa(ctx: EvalContext):
    ctx.output = qa_agent(ctx.input)
    assert ctx.output == ctx.reference
```

## File-Level Defaults

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

## CLI Commands

### Run Evals Headlessly

```bash
# Basic run
ezvals run path/to/evals

# With rich terminal output
ezvals run path/to/evals --visual

# Filter by dataset or label
ezvals run path/to/evals -d dataset_name -l label

# Run specific function
ezvals run path/to/evals.py::function_name

# Limit number of evals
ezvals run path/to/evals --limit 10

# Set concurrency
ezvals run path/to/evals --concurrency 4

# Output JSON to stdout (no file save)
ezvals run path/to/evals --no-save

# Custom output file
ezvals run path/to/evals --output results.json
```

### Interactive Web UI

```bash
# Start web UI
ezvals serve path/to/evals

# Auto-run on startup
ezvals serve path/to/evals --run

# Custom port
ezvals serve path/to/evals --port 8080

# View existing results
ezvals serve results.json
```

### Export Results

```bash
# Export to markdown
ezvals export run.json -f md -o report.md

# Export to CSV
ezvals export run.json -f csv
```

## Async Support

EZVals supports both sync and async eval functions:

```python
# Async
@eval(input="test")
async def test_async(ctx: EvalContext):
    ctx.output = await async_agent(ctx.input)

# Sync
@eval(input="test")
def test_sync(ctx: EvalContext):
    ctx.output = sync_agent(ctx.input)
```

## Target Functions

Use `target` to run a function before the eval:

```python
def my_agent(input: str) -> str:
    return f"Response to: {input}"

@eval(input="Hello", target=my_agent)
def test_with_target(ctx: EvalContext):
    # ctx.output is already populated with my_agent's result
    assert "Hello" in ctx.output
```

## Evaluators

Use `evaluators` for post-execution scoring:

```python
def check_length(ctx: EvalContext):
    if len(ctx.output) < 10:
        ctx.add_score(False, "Response too short", key="length")
    else:
        ctx.add_score(True, "Good length", key="length")

@eval(input="Explain quantum computing", evaluators=[check_length])
def test_explanation(ctx: EvalContext):
    ctx.output = agent(ctx.input)
```
