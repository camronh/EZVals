# Datasets

Build evaluation datasets that help you understand how your AI system behaves.

Below are some suggestions and best practices. Not all of these suggestions will be possible or applicable for the user's needs. Choose the appropriate suggestions.

## Error Analysis First

Before writing any eval dataset, consider looking at your actual data. Error analysis tells you what's actually failing versus what you imagine might fail.

**One approach:**

1. **Gather traces**: Collect representative interactions with your agent (50-100 is a reasonable starting point)
2. **Open coding**: Review each trace, note issues you observe. Focus on the first failure in each trace
3. **Axial coding**: Group notes into a failure taxonomy. Count failures per category
4. **Iterate until saturation**: Keep reviewing until new traces stop revealing new failure modes

This helps ensure your dataset targets real problems rather than imagined ones.

## Dataset Sizing

These are rough guidelines—your needs may vary:

| Purpose | Typical Size | Notes |
|---------|--------------|-------|
| **Iteration** | 5-20 cases | Quick feedback during development |
| **Analysis** | 100+ cases | Larger samples for understanding patterns |
| **Regression** | 50-200 curated | Cases you want to protect against breaking |

```python
from ezvals import eval, EvalContext

# Quick iteration dataset
@eval(dataset="returns", cases=[
    {"input": "What's the return policy?", "reference": "30 days"},
    {"input": "Can I return opened items?", "reference": "unopened only"},
    {"input": "Do I need a receipt?", "reference": "receipt required"},
])
def test_returns_quick(ctx: EvalContext):
    ctx.store(output=agent(ctx.input))
    assert ctx.reference in ctx.output.lower()
```

## Sourcing Test Cases

Good test cases can come from many places:

### From Manual Testing

Queries you already test manually before releases are a natural starting point:

```python
MANUAL_TEST_CASES = [
    {"input": "Hello", "reference": "greeting"},
    {"input": "What can you help with?", "reference": "capabilities"},
    {"input": "I want to cancel", "reference": "cancellation"},
]
```

### From Production Data

Bug trackers and support queues often reveal real failure modes:

```python
# From support ticket #1234
{"input": "Connect me to billing", "reference": "555-0100", "metadata": {"source": "ticket-1234"}},

# From production log analysis
{"input": "What are your hours?", "reference": "9am-5pm", "metadata": {"source": "prod-20240115"}},
```

### From Failure Analysis

If you've done error analysis, convert your failure taxonomy into test cases:

```python
# Taxonomy: "Agent doesn't handle ambiguous location names"
LOCATION_AMBIGUITY_CASES = [
    {"input": "Weather in Springfield", "metadata": {"note": "Which Springfield?"}},
    {"input": "Restaurants in Portland", "metadata": {"note": "OR or ME?"}},
    {"input": "News from Washington", "metadata": {"note": "State or DC?"}},
]
```

## Using EZVals Cases

The `cases=` parameter generates multiple evals from one function:

```python
@eval(
    dataset="sentiment",
    target=run_classifier,
    cases=[
        {"input": "I love this!", "reference": "positive"},
        {"input": "This is terrible", "reference": "negative"},
        {"input": "It's okay", "reference": "neutral"},
    ],
)
async def test_sentiment(ctx: EvalContext):
    assert ctx.output == ctx.reference
```

Cases are list-of-dict overrides. Each case becomes a separate eval run with `ctx.input` and `ctx.reference` auto-populated.

### Custom Fields in Input

For complex test data, put everything in `input`:

```python
@eval(
    dataset="support",
    cases=[
        {"input": {"query": "I want a refund", "user_type": "premium"}, "reference": "expedited"},
        {"input": {"query": "I want a refund", "user_type": "standard"}, "reference": "normal"},
    ],
)
async def test_refund_handling(ctx: EvalContext):
    ctx.store(output=await support_agent(ctx.input["query"], user_type=ctx.input["user_type"]))
    assert ctx.reference in ctx.output.lower()
```

## Dynamic Datasets with Input Loaders

Load test cases from external sources (databases, APIs) at runtime:

```python
async def fetch_from_db():
    examples = await db.get_test_cases()
    return [{"input": e.prompt, "reference": e.expected} for e in examples]

@eval(dataset="dynamic", input_loader=fetch_from_db)
async def test_from_database(ctx: EvalContext):
    ctx.store(output=await my_agent(ctx.input))
    assert ctx.output == ctx.reference
```

The loader is called lazily at eval time, not at import time.

## Synthetic Data Generation

When the user has limited real examples, you can help generate test cases. See [synthetic-data.md](synthetic-data.md) for detailed guidance on:

- When to generate cases directly vs. suggest a generation script
- Dimension-based generation for variety
- Validation and mixing with real data

## Building Balanced Datasets

Consider testing both cases where a behavior should occur AND where it shouldn't:

```python
# Only positive cases - may miss over-triggering issues
SEARCH_CASES = [
    {"input": "Latest news?", "metadata": {"should_search": True}},
    {"input": "Weather today?", "metadata": {"should_search": True}},
]

# Including negative cases helps catch over-triggering
SEARCH_CASES = [
    # Should search (current info needed)
    {"input": "Latest news?", "metadata": {"should_search": True}},
    {"input": "Weather today?", "metadata": {"should_search": True}},
    # Should NOT search (static knowledge)
    {"input": "What is 2+2?", "metadata": {"should_search": False}},
    {"input": "Who wrote Romeo and Juliet?", "metadata": {"should_search": False}},
]
```

One-sided datasets tend to produce one-sided optimization. If you only test that the agent searches when it should, you may not notice if it starts searching for everything.

## Avoiding Saturation

When your agent passes 100% of evals, the evals stop providing useful signal.

**Signs of saturation:**
- Pass rate stuck at 100%
- New model versions score identically
- Can't distinguish good agents from great ones

**Some approaches to add signal:**
- Add harder cases (edge cases, adversarial inputs)
- Add negative cases (when should the agent refuse?)
- Raise the bar (from "contains keyword" to "semantically correct")
- Diversify beyond current categories

```python
# Basic cases may saturate quickly
BASIC_QA = [
    {"input": "What is the capital of France?", "reference": "Paris"},
]

# Harder cases maintain signal longer
CHALLENGING_QA = [
    {"input": "What was the capital of France in 1700?", "reference": "Paris"},  # Temporal
    {"input": "What's the capital of the country bordering Spain and Germany?", "reference": "Paris"},  # Reasoning
]
```

## Dataset Organization

As your eval suite grows, you may want to organize test cases for reusability. There's no single right way—here's one approach that works:

```
datasets/
├── core/
│   ├── basic_qa.py          # Core functionality
│   └── regression.py        # Known fixed bugs
├── categories/
│   ├── billing.py
│   ├── technical.py
│   └── returns.py
└── stress/
    ├── adversarial.py
    └── edge_cases.py
```

You can define cases in plain Python lists and compose them:

```python
# datasets/categories/billing.py

BILLING_BASIC = [
    {"input": "What payment methods?", "reference": "credit card"},
    {"input": "Can I pay with PayPal?", "reference": "PayPal"},
]

BILLING_EDGE_CASES = [
    {"input": "I was charged twice", "reference": "refund"},
    {"input": "Card declined but I see a charge", "reference": "pending"},
]

BILLING_ALL = BILLING_BASIC + BILLING_EDGE_CASES
```

Then import and use them in your evals:

```python
from datasets.categories.billing import BILLING_ALL

@eval(dataset="billing", cases=BILLING_ALL)
def test_billing(ctx: EvalContext):
    ctx.store(output=agent(ctx.input))
    assert ctx.reference in ctx.output.lower()
```

That said, many teams keep things simpler—inline cases work fine until you have enough duplication to justify the abstraction.
