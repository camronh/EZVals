# Data and Datasets

Building evaluation datasets that reveal meaningful problems in your AI system.

## The Error Analysis First Principle

Before writing any eval dataset, look at your actual data. Error analysis should come before eval writing because it tells you what's actually failing versus what you imagine might fail.

**The process:**

1. **Gather traces**: Collect 50-100 representative interactions with your agent. If pre-production, use the agent yourself or recruit others.

2. **Open coding**: Review each trace and write open-ended notes about issues. Focus on the first failure in each trace (upstream errors cause downstream problems). Don't categorize yet—just observe.

3. **Axial coding**: Group notes into a failure taxonomy. Count failures per category. Use an LLM to help with grouping.

4. **Reach saturation**: Keep reviewing until new traces stop revealing new failure modes. Typically 100+ traces.

This ensures your dataset targets real problems. Many teams waste effort testing for issues that don't occur while missing the failures users actually experience.

## Dataset Sizing

**For iteration (small tweaks):** 5-20 test cases

When you're making focused changes—adjusting a prompt, fixing a specific bug—a small dataset is fine. You want quick feedback on whether the change helped or hurt.

```python
from ezvals import eval, EvalContext

# Quick iteration dataset
@eval(dataset="returns", cases=[
    {"input": "What's the return policy?", "reference": "30 days"},
    {"input": "Can I return opened items?", "reference": "unopened only"},
    {"input": "Do I need a receipt?", "reference": "receipt required"},
])
def test_returns_quick(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.reference in ctx.output.lower()
```

**For analysis (understanding your system):** 100+ test cases

When you're evaluating overall system quality, comparing approaches, or preparing for launch, you need enough data to see patterns.

**For regression testing (ongoing):** 50-200 curated cases

Cases drawn from real failures plus critical scenarios. Run on significant changes.

## Sourcing Test Cases

### From Manual Testing

Start with the queries you already test manually—the behaviors you verify before each release. These are your "caveman testing" prompts, now formalized.

```python
# Convert informal test notes to dataset
MANUAL_TEST_CASES = [
    # Things you check before every release
    {"input": "Hello", "expected_behavior": "Greets user"},
    {"input": "What can you help with?", "expected_behavior": "Explains capabilities"},
    {"input": "I want to cancel", "expected_behavior": "Routes to cancellation"},
]
```

### From Production Data

If you're in production, your bug tracker and support queue are gold mines. Convert user-reported failures into test cases.

```python
# From support ticket #1234: User reported wrong phone number
{"input": "Connect me to billing", "expected": "555-0100", "source": "ticket-1234"},

# From production log: Agent gave outdated info
{"input": "What are your hours?", "expected": "9am-5pm", "source": "prod-20240115"},
```

Prioritize by user impact. A failure affecting 1000 users matters more than an edge case affecting 1.

### From Failure Analysis

After error analysis, convert your failure taxonomy into test cases:

```python
# Taxonomy: "Agent doesn't handle ambiguous location names"
LOCATION_AMBIGUITY_CASES = [
    {"input": "Weather in Springfield", "note": "Which Springfield?"},
    {"input": "Restaurants in Portland", "note": "OR or ME?"},
    {"input": "News from Washington", "note": "State or DC?"},
]
```

## Synthetic Data Generation

When you have a few examples, use LLMs to generate more. This scales coverage without hours of manual prompt writing.

### The Dimension-Based Approach

The key to good synthetic data is structure. Instead of asking "give me test queries," define dimensions that describe variation in user behavior.

**Example dimensions for a customer support agent:**

| Dimension | Values |
|-----------|--------|
| Issue type | billing, technical, shipping, returns |
| Customer tone | frustrated, neutral, happy |
| Complexity | simple question, multi-part, edge case |
| Context | new customer, returning customer, VIP |

**Step 1: Create dimension tuples manually**

Write 10-20 tuples by hand to understand your problem space:

```python
SEED_TUPLES = [
    ("billing", "frustrated", "simple", "returning"),
    ("technical", "neutral", "multi-part", "new"),
    ("returns", "happy", "edge case", "VIP"),
    # ... more combinations
]
```

**Step 2: Generate more tuples**

Use an LLM to expand your combinations:

```python
prompt = """Given these dimensions for customer support queries:
- Issue: billing, technical, shipping, returns
- Tone: frustrated, neutral, happy
- Complexity: simple, multi-part, edge case
- Context: new, returning, VIP

Generate 20 diverse combinations as tuples. Include edge cases.
Example: (billing, frustrated, simple, returning)"""
```

**Step 3: Convert tuples to natural language**

In a separate step, transform each tuple into a realistic query:

```python
prompt = """Convert this tuple to a realistic customer message:
Tuple: (billing, frustrated, multi-part, VIP)

Generate a natural customer query that matches these dimensions.
Make it sound like a real person would write it."""

# Output: "I've been a premium member for 3 years and I'm extremely
# disappointed. My last two invoices were wrong AND I was charged
# twice for the annual fee. Someone needs to fix this immediately."
```

The two-step approach (tuples then language) avoids repetitive phrasing.

### Cross-Product vs Direct Generation

**Cross-product then filter:** Generate all dimension combinations, then filter invalid ones with an LLM. Guarantees coverage including edge cases. Use when most combinations are valid.

**Direct LLM generation:** Ask the LLM to generate tuples directly. More realistic but tends toward common cases, missing rare scenarios. Use when many combinations are invalid.

### Validating Synthetic Data

Synthetic data can be unreliable. Validate it:

1. **Spot-check samples**: Read 20 generated examples. Do they look realistic?
2. **Run through your system**: Generate full traces, then do error analysis
3. **Compare to production**: If you have real data, do synthetic examples cover the same patterns?

**When synthetic data fails:**

- **Complex domain-specific content**: LLMs miss the structure of legal filings, medical records, etc.
- **Low-resource languages**: Generated samples are often unrealistic
- **When you can't validate**: If you don't know what realistic looks like, you can't verify synthetic is right
- **High-stakes domains**: Synthetic data may lack subtlety in medicine, law, emergency response

## Building Balanced Datasets

Test both the cases where a behavior should occur and where it shouldn't. One-sided datasets create one-sided optimization.

**Example: Search triggering**

If you only test cases where the agent should search, you'll train an agent that searches for everything:

```python
# Unbalanced (bad)
SEARCH_CASES = [
    {"input": "Latest news?", "should_search": True},
    {"input": "Weather today?", "should_search": True},
    {"input": "Stock price of AAPL?", "should_search": True},
]

# Balanced (good)
SEARCH_CASES = [
    # Should search (current info needed)
    {"input": "Latest news?", "should_search": True},
    {"input": "Weather today?", "should_search": True},
    {"input": "Stock price of AAPL?", "should_search": True},
    # Should NOT search (static knowledge)
    {"input": "What is 2+2?", "should_search": False},
    {"input": "Who wrote Romeo and Juliet?", "should_search": False},
    {"input": "How do I tie a shoe?", "should_search": False},
]
```

## Avoiding Saturation

When your agent passes 100% of your evals, you stop learning. Saturation means your test cases are too easy or too narrow.

**Signs of saturation:**

- Pass rate consistently at or close to 100%
- New model versions score identically
- You can't distinguish between good and great agents

**Fixing saturation:**

1. **Add harder cases**: Edge cases, adversarial inputs, multi-step problems
2. **Add negative cases**: Inputs where the agent should refuse or ask for clarification
3. **Raise the bar**: If "contains keyword" passes everything, switch to semantic correctness
4. **Diversify**: Add cases from underrepresented categories in your taxonomy

```python
# Easy cases (may saturate)
BASIC_QA = [
    {"input": "What is the capital of France?", "expected": "Paris"},
]

# Harder cases to prevent saturation
CHALLENGING_QA = [
    {"input": "What was the capital of France in 1700?", "expected": "Paris"},  # Temporal
    {"input": "What's the capital of the country that borders both Spain and Germany?", "expected": "Paris"},  # Reasoning
    {"input": "Capital of France and population?", "expected": ["Paris", "million"]},  # Multi-part
]
```

## Dataset Organization

Structure datasets for reusability:

```
datasets/
├── core/
│   ├── basic_qa.py          # Core functionality tests
│   └── regression.py        # Known fixed bugs
├── categories/
│   ├── billing.py           # Billing-related queries
│   ├── technical.py         # Technical support queries
│   └── returns.py           # Return/refund queries
└── stress/
    ├── adversarial.py       # Edge cases, unusual inputs
    └── load.py              # High-volume scenarios
```

**Example dataset module:**

```python
# datasets/categories/billing.py

BILLING_BASIC = [
    {"input": "What payment methods do you accept?", "expected": "credit card"},
    {"input": "Can I pay with PayPal?", "expected": "PayPal"},
]

BILLING_EDGE_CASES = [
    {"input": "I was charged twice", "expected": "refund"},
    {"input": "My card was declined but I see a charge", "expected": "pending"},
]

# All billing cases
BILLING_ALL = BILLING_BASIC + BILLING_EDGE_CASES
```

**Using in evals:**

```python
from ezvals import eval, EvalContext
from datasets.categories.billing import BILLING_ALL

@eval(dataset="billing", cases=[
    {"input": c["input"], "reference": c["expected"]} for c in BILLING_ALL
])
def test_billing_accuracy(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.reference in ctx.output.lower()
```

## Working with Production Data

Production data is the ultimate source of truth. Here's how to use it effectively:

### Sampling Strategies

You can't review every trace. Sample strategically:

1. **Random sampling**: Start here. If you find few issues, move to targeted sampling.
2. **Outlier detection**: Sort by response length, latency, tool calls—review extremes
3. **User feedback signals**: Prioritize traces with negative feedback or support tickets
4. **Metric-based sorting**: Review both high and low automated scores
5. **Stratified sampling**: Sample from each user type, feature, or category

### Converting Traces to Test Cases

When you find a failure in production:

1. Extract the minimal reproduction case
2. Verify it still fails
3. Add expected behavior
4. Include source metadata for traceability

```python
# From production trace analysis 2024-01-15
PRODUCTION_FAILURES = [
    {
        "input": "I need to return my order but I lost the receipt",
        "expected": "store credit",  # Should offer store credit option
        "source": "prod-analysis-20240115",
        "failure_mode": "missed-alternative-policy",
    },
]
```

## Domain Expert Involvement

Domain experts understand what "good" looks like better than engineers. Involve them in dataset creation:

**What domain experts provide:**

- Realistic query patterns from actual users
- Edge cases that matter in practice
- Correct expected outputs
- Quality judgments for ambiguous cases

**How to involve them:**

1. **Dataset review**: Have experts review and correct generated test cases
2. **Failure categorization**: Use experts for error analysis axial coding
3. **Ground truth labeling**: Experts create the labels used to calibrate LLM judges
4. **Rubric definition**: Experts define what "good" means for each dimension

The domain expert should be the "benevolent dictator" who makes final calls on quality standards. If you feel you need five experts to judge a single interaction, your product scope may be too broad.
