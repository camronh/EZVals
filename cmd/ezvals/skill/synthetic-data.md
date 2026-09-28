# Synthetic Data Generation

When the user has limited real examples, you can help generate more test cases. This guide offers suggestions and examples—adapt them to fit the user's specific needs.

Synthetic data generation can be useful when:

- Building a new feature with no production data yet
- Testing edge cases that are rare in production
- Stress-testing specific failure modes identified through error analysis
- Balancing a dataset that's heavy in one category

## When to Generate vs. Script

These are rough heuristics—use your judgment based on the user's situation.

**Generating directly** may work well when:
- The user needs a smaller number of examples (10-50)
- The cases require understanding context or nuance
- You're exploring what kinds of cases might be useful

**Suggesting a generation script** may be better when:
- The user needs large-scale generation (100+)
- Cases need to be regenerated regularly
- The generation logic should be version-controlled

## Dimension-Based Generation

One approach that can help avoid repetitive examples is to define dimensions of variation first:

| Dimension | Values |
|-----------|--------|
| Issue type | billing, technical, shipping, returns |
| Customer tone | frustrated, neutral, happy |
| Complexity | simple, multi-part, edge case |

Then generate examples that cover combinations:

```python
# Example cases covering the dimension space
SUPPORT_CASES = [
    # billing + frustrated + simple
    {"input": "Why was I charged twice this month?", "metadata": {"category": "billing", "tone": "frustrated"}},

    # technical + neutral + multi-part
    {"input": "My app won't load and I also can't reset my password", "metadata": {"category": "technical", "tone": "neutral"}},

    # returns + happy + edge case
    {"input": "I'd like to return something I bought 29 days ago - cutting it close!", "metadata": {"category": "returns", "tone": "happy"}},
]
```

The two-step approach (define dimensions → generate examples) tends to produce more variety than generating cases all at once, but isn't always necessary for smaller datasets.

## Generation Approach

When generating synthetic cases, specificity tends to help:

**Vague:**
> "Generate 20 customer support queries"

**More specific:**
> "Generate customer support queries covering these scenarios:
> - Billing disputes (frustrated tone)
> - Technical issues (neutral tone, multi-step problems)
> - Return requests (various tones, some edge cases near policy limits)
>
> Each case should have an input query and expected behavior."

## Validation

It's worth checking synthetic data before the user relies on it:

- **Review a sample** - Do the examples look realistic? Would real users phrase things this way?
- **Run through the system** - Do synthetic cases trigger the same behaviors as real ones?
- **Compare to production** - If production data exists, do synthetic examples cover similar patterns?

Consider flagging synthetic cases that seem artificial or unlikely to occur in practice.

## Mixing Real and Synthetic

Synthetic data can be useful for coverage, while real data grounds evals in actual user behavior. Many datasets combine both:

- **Real cases**: From production logs, support tickets, user testing
- **Synthetic cases**: Edge cases, rare scenarios, stress tests

```python
# Example: combining real and synthetic
SUPPORT_DATASET = REAL_PRODUCTION_CASES + SYNTHETIC_EDGE_CASES
```

## Example Workflow

One way to help a user create test cases:

1. Ask about their domain and what behaviors they want to test
2. Identify dimensions of variation relevant to their use case
3. Generate a diverse initial set covering the dimension space
4. Ask them to review and flag any unrealistic examples
5. Iterate based on their feedback

This is just one approach—adapt based on what the user needs.

```python
# Example: generated cases for a flight booking agent
BOOKING_CASES = [
    {"input": "Book me a flight to NYC next Tuesday", "reference": "one-way booking"},
    {"input": "I need to fly from Boston to LA and back, leaving Friday", "reference": "round-trip booking"},
    {"input": "Find the cheapest flight to anywhere warm", "reference": "flexible search"},
    {"input": "Cancel my reservation for tomorrow", "reference": "cancellation"},
    {"input": "Change my 3pm flight to the 6pm one", "reference": "modification"},
]
```

The format and structure of generated cases should match what works for the user's eval setup.
