# Targets

The target is the function or agent being evaluated. It takes input from your dataset and produces output that gets graded.

## The Target Function Pattern

A target function runs your agent and populates the eval context. This separates agent invocation from grading logic:

```python
from ezvals import eval, EvalContext

async def my_agent_target(ctx: EvalContext):
    """Run the agent and capture results."""
    result = await run_my_agent(ctx.input)

    ctx.store(
        output=result["response"],
        latency=result.get("latency"),
        messages=result.get("messages", []),
        trace_data={
            "tool_calls": result.get("tool_calls", []),
            "sources": result.get("sources", []),
        },
    )

@eval(
    input="What is the return policy?",
    target=my_agent_target,
    dataset="customer_service"
)
async def test_policy_question(ctx: EvalContext):
    # ctx.output already populated by target
    assert "30 days" in ctx.output.lower(), "Should mention return window"
```

### Benefits

- **Reusability**: Write one target, use across many evals
- **Latency tracking**: Target latency is tracked separately from grading
- **Clean separation**: Agent logic vs. assertion logic stay separate
- **Data capture**: Store conversation history, tool calls, sources for debugging and grading

## Where to Store Data

Use `ctx.store()` to set context fields. It accepts these parameters:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `output` | Agent's final response | The text/data to grade |
| `latency` | Execution time | Tracked automatically or set manually |
| `messages` | Conversation history | Sets `trace_data.messages` |
| `trace_url` | Link to observability platform | Sets `trace_data.trace_url` |
| `trace_data` | Additional debug/trace info | Tool calls, retrieval scores (merges) |
| `metadata` | Custom tags/metadata | User type, scenario name (merges) |

**Use first-class parameters when they exist.** Don't put your agent's response in `metadata["response"]`—use the `output` parameter.

**Use `trace_data` for debug info you want to inspect.** Tool call sequences, retrieval scores, confidence values—anything you'd look at when debugging a failure.

**Use `metadata` for organizational data.** Test categorization, user personas, experiment tags.

## Designing Effective Targets

Think of a target like a `beforeEach` in test frameworks—it sets up everything the grader needs. The more relevant data you capture, the richer your grading options become.

**Capture generously.** You don't know what you'll want to grade later. If your agent returns intermediate state, tool calls, or confidence scores—store them. You can always ignore data you don't need, but you can't grade on data you didn't capture.

```python
async def comprehensive_target(ctx: EvalContext):
    result = await my_agent(ctx.input)

    ctx.store(
        output=result["response"],
        messages=result["conversation"],
        trace_data={
            "tool_calls": result["tools_used"],
            "confidence": result["confidence_score"],
            "sources": result["retrieved_docs"],
        },
    )
```

**Keep targets focused on data capture.** The target's job is to run the agent and store results. Grading logic belongs in the eval function or evaluators—not the target.

**Make targets reusable.** A good target works for many evals. If you're writing target-specific grading logic into the target itself, you're mixing concerns.

## Test Outputs, Not Paths

Grade what the agent produced, not the path it took to get there.

```python
# Bad: Testing internals
@eval(input="What is the refund policy?")
def test_rag_uses_search(ctx: EvalContext):
    result = run_agent(ctx.input)
    assert "search_docs" in result.tool_calls  # Too rigid!

# Good: Testing outputs
@eval(input="What is the refund policy?", reference="30 days")
def test_rag_accuracy(ctx: EvalContext):
    ctx.store(output=run_agent(ctx.input))
    assert ctx.reference.lower() in ctx.output.lower()
```

Agents find creative solutions you didn't anticipate. If you test that the agent used `search_docs` before `generate_answer`, you'll fail agents that answered correctly through different means.

**Exception**: If you're specifically optimizing tool usage (e.g., reducing unnecessary API calls), a targeted tool-usage eval is fine. But it should be a secondary metric, not your primary quality measure.

## Common Target Patterns

### Simple Agent Call

```python
async def call_agent(ctx: EvalContext):
    ctx.store(output=await my_agent(ctx.input))
```

### Agent with Trace Capture

```python
async def rag_target(ctx: EvalContext):
    result = await rag_agent(ctx.input)
    ctx.store(
        output=result["answer"],
        trace_data={
            "sources": result["sources"],
            "retrieval_scores": result["scores"],
        },
    )
```

### Agent with State Verification Setup

```python
async def support_agent_target(ctx: EvalContext):
    # Run agent
    output = await support_agent(ctx.input, user_id="test_user")

    # Capture state for verification in grader
    ctx.store(
        output=output,
        trace_data={
            "subscription": await db.get_subscription("test_user"),
            "refund": await db.get_latest_refund("test_user"),
        },
    )
```

### Multi-Turn Conversation Target

```python
async def conversation_target(ctx: EvalContext):
    history = []
    for message in ctx.input["messages"]:
        response = await agent(message, history=history)
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": response})

    ctx.store(
        output=history[-1]["content"],
        messages=history,
        metadata={"turns": len(ctx.input["messages"])},
    )
```

## Handling Non-Determinism

Agent behavior varies between runs. For reliability testing, run multiple trials:

```python
async def multi_trial_target(ctx: EvalContext, trials: int = 3):
    """Run agent multiple times and track consistency."""
    results = []
    for _ in range(trials):
        output = await agent(ctx.input)
        results.append(output)

    ctx.store(
        output=results[0],  # Primary result
        trace_data={
            "all_results": results,
            "unique_answers": len(set(results)),
        },
    )
```

See the [use-cases/coding-agents.md](use-cases/coding-agents.md) guide for pass@k and pass^k patterns.

## Environment Setup

For agents that modify state (databases, files, external systems), ensure clean state:

```python
async def stateful_agent_target(ctx: EvalContext):
    # Reset to clean state
    await db.reset_to_snapshot("test_baseline")

    # Run agent and capture final state for verification
    ctx.store(
        output=await booking_agent(ctx.input),
        trace_data={"booking": await db.get_latest_booking()},
    )
```

Each trial should start from the same clean state to ensure independent measurements.

## Choosing a Target Strategy

When to use a shared target vs. inline agent calls:

**Use a shared target when:**
- Multiple evals test the same agent with different grading criteria
- You need consistent data capture across evals
- Agent invocation involves setup (auth, state reset, config)
- You want target latency tracked separately from grading

**Use inline agent calls when:**
- The eval is one-off or exploratory
- Agent invocation is trivial (`ctx.output = agent(ctx.input)`)
- Different evals need different agent configurations

**Start simple.** You can always extract a shared target later when patterns emerge. Premature abstraction slows iteration.

```python
# Simple inline call - fine for starting out
@eval(input="What is 2 + 2?", reference="4")
def test_arithmetic(ctx: EvalContext):
    ctx.store(output=calculator_agent(ctx.input))
    assert ctx.output == ctx.reference

# Extract to shared target when you have multiple evals
# that all need the same agent setup and data capture
```
