# Testing Agent Internals

Most evals should test outputs, not internals. But there are valid cases for testing agent components: tool calls, multi-agent workflows, and pipeline nodes.

## When to Test Internals

**Valid reasons:**
- Optimizing tool usage (reducing unnecessary API calls)
- Verifying critical tool calls happen (security checks, audit logging)
- Testing multi-agent coordination
- Debugging specific pipeline stages
- Measuring intermediate quality in complex workflows

**Not valid reasons:**
- Checking the agent followed your expected path
- Verifying specific reasoning patterns
- Testing that agents use tools in a particular order

If the output is correct, the path usually doesn't matter.

## Tool Call Verification

When you specifically need to verify tool usage:

```python
from ezvals import eval, EvalContext

async def agent_with_trace(ctx: EvalContext):
    """Target that captures tool calls."""
    result = await my_agent(ctx.input, return_trace=True)
    ctx.store(
        output=result["response"],
        trace_data={
            "tool_calls": result["tool_calls"],
            "tool_names": [tc["name"] for tc in result["tool_calls"]],
        },
    )

@eval(target=agent_with_trace, input="Search for Python tutorials")
async def test_search_triggered(ctx: EvalContext):
    # Primary: Does the output help?
    assert len(ctx.output) > 50, "Response too short"
    assert "python" in ctx.output.lower(), "Should mention Python"

    # Secondary: Was search used? (optimization metric)
    search_calls = [c for c in ctx.trace_data["tool_calls"] if c["name"] == "search"]
    ctx.store(scores={
        "passed": len(search_calls) > 0,
        "key": "used_search",
        "notes": f"Search called {len(search_calls)} times"
    })
```

### Verifying Tool Parameters

```python
@eval(target=agent_with_trace, input="Book a flight from NYC to LAX")
async def test_booking_tool_params(ctx: EvalContext):
    # Find the booking tool call
    booking_calls = [c for c in ctx.trace_data["tool_calls"] if c["name"] == "book_flight"]

    assert len(booking_calls) > 0, "Should call book_flight tool"

    params = booking_calls[0]["parameters"]
    assert params.get("origin") == "NYC", f"Wrong origin: {params.get('origin')}"
    assert params.get("destination") == "LAX", f"Wrong destination: {params.get('destination')}"
```

### Counting Tool Usage

```python
@eval(target=agent_with_trace, input="Research this topic thoroughly")
async def test_tool_efficiency(ctx: EvalContext):
    tool_counts = {}
    for tc in ctx.trace_data["tool_calls"]:
        name = tc["name"]
        tool_counts[name] = tool_counts.get(name, 0) + 1

    # Check efficiency (informational)
    total_calls = sum(tool_counts.values())
    ctx.store(scores=[
        {"value": total_calls, "key": "total_tool_calls"},
        {"value": tool_counts.get("search", 0), "key": "search_calls"},
        {"value": tool_counts.get("read_file", 0), "key": "file_reads"},
    ])

    # Only fail if excessive
    assert total_calls < 50, f"Too many tool calls: {total_calls}"
```

## State Verification for Conversational Agents

Verify the agent actually did what it claimed:

```python
@eval(input="I need to cancel my subscription and get a refund")
async def test_cancellation_state(ctx: EvalContext):
    ctx.store(output=await support_agent(ctx.input, user_id="test_user"))

    # Don't trust the agent's words—verify actual state
    subscription = await db.get_subscription("test_user")
    assert subscription.status == "cancelled", \
        f"Subscription not cancelled: {subscription.status}"

    refund = await db.get_latest_refund("test_user")
    assert refund is not None, "No refund processed"
    assert refund.status == "processed", f"Refund not processed: {refund.status}"
```

## Multi-Agent Workflow Testing

Test coordination between agents:

```python
async def multi_agent_target(ctx: EvalContext):
    """Run multi-agent workflow and capture each agent's contribution."""
    result = await orchestrator.run(ctx.input)

    ctx.store(
        output=result["final_response"],
        trace_data={
            "agent_outputs": result["agent_outputs"],
            "handoffs": result["handoffs"],
        },
    )

@eval(target=multi_agent_target, input="Research and summarize AI safety developments")
async def test_multi_agent_coordination(ctx: EvalContext):
    # Check final output quality
    assert len(ctx.output) > 200, "Summary too short"

    # Verify each agent contributed
    agent_outputs = ctx.trace_data["agent_outputs"]
    assert "researcher" in agent_outputs, "Researcher agent didn't run"
    assert "summarizer" in agent_outputs, "Summarizer agent didn't run"

    # Check handoff sequence
    handoffs = ctx.trace_data["handoffs"]
    ctx.store(scores=[
        {"value": len(handoffs), "key": "handoff_count"},
        {"passed": "researcher->summarizer" in str(handoffs), "key": "correct_sequence"},
    ])
```

## Pipeline Node Testing

Test individual nodes in a complex pipeline:

```python
from ezvals import eval, EvalContext

# Test retrieval node in isolation
@eval(input="What is the return policy?", dataset="retrieval_tests")
async def test_retrieval_node(ctx: EvalContext):
    # Run just the retrieval step
    docs = await retrieval_node(ctx.input)
    ctx.store(output=docs)

    assert len(docs) > 0, "No documents retrieved"
    assert any("return" in doc.lower() for doc in docs), \
        "Retrieved docs don't mention returns"

    ctx.store(scores={"value": len(docs), "key": "docs_retrieved"})

# Test generation node with fixed retrieval
@eval(
    input="What is the return policy?",
    metadata={"docs": ["Our return policy allows returns within 30 days..."]}
)
async def test_generation_node(ctx: EvalContext):
    # Run generation with controlled input
    ctx.store(output=await generation_node(ctx.input, docs=ctx.metadata["docs"]))

    assert "30 days" in ctx.output.lower(), "Should mention 30 days"

# Test full pipeline
@eval(input="What is the return policy?")
async def test_full_pipeline(ctx: EvalContext):
    ctx.store(output=await full_rag_pipeline(ctx.input))
    assert "30 days" in ctx.output.lower()
```

## Environment Setup and Isolation

For stateful tests, ensure clean state:

```python
import pytest

@pytest.fixture
async def clean_environment():
    """Set up clean state before each test."""
    await db.reset_to_snapshot("test_baseline")
    await cleanup_temp_files()

    yield

    # Cleanup after test
    await db.reset_to_snapshot("test_baseline")

@eval(input="Create a new user account")
async def test_user_creation(ctx: EvalContext):
    # Run agent
    ctx.store(output=await account_agent(ctx.input))

    # Verify state change
    users = await db.get_users()
    new_users = [u for u in users if u.created_after(test_start_time)]

    assert len(new_users) == 1, f"Expected 1 new user, found {len(new_users)}"
    assert new_users[0].email is not None, "User missing email"
```

## Debugging with Transcripts

Capture full transcripts for debugging:

```python
async def verbose_target(ctx: EvalContext):
    result = await agent(ctx.input, verbose=True)

    ctx.store(
        output=result["response"],
        messages=result["messages"],
        trace_data={
            "tool_calls": result["tool_calls"],
            "reasoning": result.get("reasoning_trace", []),
        },
    )

@eval(target=verbose_target, input="Complex multi-step task")
async def test_with_full_trace(ctx: EvalContext):
    assert quality_check(ctx.output), "Output quality check failed"
    # On failure, ctx.trace_data contains full debugging info
```

## When Internal Tests Fail

If an internal test fails but the output is correct, consider:

1. Is this check actually necessary?
2. Should it be an informational metric instead of a hard failure?
3. Is the agent finding a valid alternative approach?

```python
@eval(target=agent_with_trace, input="Search for information")
async def test_with_soft_internal_check(ctx: EvalContext):
    # Hard requirement: output must be good
    assert quality_check(ctx.output), "Output quality failed"

    # Soft metric: track tool usage but don't fail
    used_search = "search" in ctx.trace_data["tool_names"]
    ctx.store(scores={
        "passed": used_search,
        "key": "used_search",
        "notes": "Informational - agent may have valid alternatives"
    })
    # Note: no assert on used_search
```
