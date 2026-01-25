# Evaluating RAG Agents

RAG (Retrieval-Augmented Generation) agents retrieve documents and generate answers grounded in those sources. The primary failure mode is hallucination—stating things that aren't supported by the retrieved documents.

## Key Metrics

| Metric | What It Measures |
|--------|------------------|
| **Groundedness** | Are claims supported by retrieved sources? |
| **Correctness** | Does the answer match the expected reference? |
| **Coverage** | Are key facts/topics included? |
| **Source Quality** | Are sources authoritative and relevant? |

## Basic RAG Eval Pattern

```python
from ezvals import eval, EvalContext

async def run_rag_agent(ctx: EvalContext):
    """Target function that captures retrieval metadata."""
    result = await rag_agent(ctx.input)
    ctx.store(
        output=result["answer"],
        trace_data={
            "sources": result["sources"],
            "retrieved_docs": result["documents"],
        },
    )

@eval(
    target=run_rag_agent,
    dataset="rag_qa",
    cases=[
        {"input": "What is our refund policy?", "reference": "30-day money-back guarantee"},
        {"input": "How do I reset my password?", "reference": "Click 'Forgot Password' on the login page"},
        {"input": "What payment methods do you accept?", "reference": "Visa, Mastercard, and PayPal"},
    ],
)
async def test_rag_accuracy(ctx: EvalContext):
    # Check correctness against reference
    assert ctx.reference.lower() in ctx.output.lower(), \
        f"Expected '{ctx.reference}' in output"
```

## Hallucination Detection

The most critical check for RAG systems. Verify all claims are supported by sources:

```python
from anthropic import Anthropic

client = Anthropic()

def check_groundedness(answer: str, sources: list[str]) -> tuple[bool, str]:
    """Verify all claims are supported by cited sources."""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""Sources the agent cited:
{chr(10).join(sources)}

Agent's answer:
{answer}

List any factual claims in the answer that are NOT directly supported by the sources.
If every factual claim is supported, respond with only: ALL_SUPPORTED"""
        }]
    )

    text = response.content[0].text
    is_grounded = "ALL_SUPPORTED" in text
    return is_grounded, text

@eval(target=run_rag_agent, dataset="rag_qa", input="Summarize our shipping options")
async def test_groundedness(ctx: EvalContext):
    is_grounded, reasoning = check_groundedness(
        ctx.output,
        ctx.trace_data["retrieved_docs"]
    )
    ctx.store(scores={"passed": is_grounded, "key": "groundedness", "notes": reasoning})
    assert is_grounded, f"Ungrounded claims: {reasoning}"
```

## Coverage Verification

Check that key topics are included in the response:

```python
@eval(
    target=run_rag_agent,
    input="What are the key features of our premium plan?",
    metadata={"required_topics": ["unlimited storage", "priority support", "advanced analytics"]}
)
async def test_coverage(ctx: EvalContext):
    covered = []
    for topic in ctx.metadata["required_topics"]:
        if topic.lower() in ctx.output.lower():
            covered.append(topic)

    coverage = len(covered) / len(ctx.metadata["required_topics"])
    ctx.store(scores={
        "value": coverage,
        "key": "coverage",
        "notes": f"Covered {len(covered)}/{len(ctx.metadata['required_topics'])} topics"
    })
    assert coverage >= 0.8, f"Missing topics: {set(ctx.metadata['required_topics']) - set(covered)}"
```

## Source Quality Verification

Check that retrieved sources are authoritative:

```python
def check_source_quality(sources: list[str], query: str) -> tuple[bool, str]:
    """Verify sources are authoritative, not random blogs."""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""Evaluate these sources for a query about "{query}":

Sources: {sources}

Are these authoritative sources (official docs, peer-reviewed, established)?
Or low-quality sources (random blogs, forums, outdated content)?

Answer: HIGH_QUALITY or LOW_QUALITY, then explain briefly."""
        }]
    )

    text = response.content[0].text
    is_quality = "HIGH_QUALITY" in text
    return is_quality, text

@eval(target=run_rag_agent, input="What are the side effects of ibuprofen?")
async def test_source_quality(ctx: EvalContext):
    is_quality, reasoning = check_source_quality(
        ctx.trace_data["sources"],
        ctx.input
    )
    ctx.store(scores={"passed": is_quality, "key": "source_quality", "notes": reasoning})
```

## Factual Accuracy

For questions with verifiable answers:

```python
import re

@eval(
    target=run_rag_agent,
    input="What was Tesla's revenue in Q3 2024?",
    reference="$25.18 billion"
)
async def test_factual_accuracy(ctx: EvalContext):
    # Extract numbers for comparison
    numbers = re.findall(r'\$?[\d.]+\s*billion', ctx.output.lower())

    # Check if correct figure appears
    correct = any("25" in n for n in numbers)
    ctx.store(scores={"passed": correct, "key": "accuracy", "notes": "Reports correct revenue figure"})
    assert correct, f"Expected ~$25 billion, found: {numbers}"
```

## Complete RAG Eval Example

Combining all checks:

```python
from ezvals import eval, EvalContext

async def run_rag_agent(ctx: EvalContext):
    result = await rag_agent(ctx.input)
    ctx.store(
        output=result["answer"],
        trace_data={
            "sources": result["sources"],
            "retrieved_docs": result["documents"],
        },
    )

@eval(
    target=run_rag_agent,
    dataset="rag_comprehensive",
    cases=[
        {
            "input": "What is our refund policy?",
            "reference": "30 days",
            "metadata": {"required_topics": ["30 days", "full refund", "original payment"]}
        },
    ],
)
async def test_rag_comprehensive(ctx: EvalContext):
    # 1. Basic correctness (code-based, fast)
    assert ctx.reference.lower() in ctx.output.lower(), \
        f"Missing reference: {ctx.reference}"

    # 2. Coverage check (code-based)
    if "required_topics" in ctx.metadata:
        covered = sum(1 for t in ctx.metadata["required_topics"]
                     if t.lower() in ctx.output.lower())
        coverage = covered / len(ctx.metadata["required_topics"])
        ctx.store(scores={"value": coverage, "key": "coverage"})

    # 3. Groundedness check (model-based, expensive)
    is_grounded, reasoning = check_groundedness(
        ctx.output,
        ctx.trace_data["retrieved_docs"]
    )
    ctx.store(scores={"passed": is_grounded, "key": "groundedness", "notes": reasoning})
    assert is_grounded, reasoning
```

## Debugging RAG Failures

When evals fail, the metadata contains everything you need to debug:

```python
# In your eval results, you'll see:
{
    "input": "What is our refund policy?",
    "output": "We offer a 30-day money-back guarantee...",
    "metadata": {
        "sources": ["policy.md", "faq.md"],
        "retrieved_docs": ["Full text of retrieved documents..."]
    },
    "scores": {
        "groundedness": {"passed": False, "notes": "Claim about 'lifetime warranty' not in sources"}
    }
}
```

This lets you see:
- What documents were retrieved
- What the agent said
- Exactly which claims weren't grounded
