# Agent Evaluation Patterns

Evaluation strategies for different types of AI agents.

## Coding Agents

Coding agents write, test, and debug code. They navigate codebases and run commands like a human developer.

### Key Grading Approach

Unit tests on generated code are the natural fit - does the code run and do the tests pass?

### Patterns

**Basic Code Generation:**
```python
@eval(input="Write a function that reverses a string", dataset="coding")
def test_reverse_string(ctx: EvalContext):
    ctx.output = await coding_agent(ctx.input)

    # Execute the generated code
    local_vars = {}
    exec(ctx.output, {}, local_vars)
    reverse = local_vars.get("reverse") or local_vars.get("reverse_string")

    # Test correctness
    assert reverse("hello") == "olleh"
    assert reverse("") == ""
    assert reverse("a") == "a"
```

**Bug Fix Verification:**
```python
@eval(
    input="Fix the authentication bypass when password is empty",
    dataset="security",
    metadata={"repo": "test-repo", "branch": "main"}
)
def test_auth_fix(ctx: EvalContext):
    ctx.output = await coding_agent(ctx.input, repo=ctx.metadata["repo"])

    # Run the test suite
    import subprocess
    result = subprocess.run(
        ["pytest", "tests/test_auth.py", "-v"],
        capture_output=True,
        cwd=ctx.metadata["repo"]
    )

    assert result.returncode == 0, f"Tests failed: {result.stderr.decode()}"
```

**Code Quality Checks:**
```python
@eval(input="Refactor this function for readability")
def test_refactoring(ctx: EvalContext):
    ctx.output = await coding_agent(ctx.input)

    # Static analysis
    import subprocess

    # Type checking
    mypy_result = subprocess.run(["mypy", "--strict", "-"], input=ctx.output.encode())
    ctx.add_score(mypy_result.returncode == 0, "Passes type checking", key="types")

    # Linting
    ruff_result = subprocess.run(["ruff", "check", "-"], input=ctx.output.encode())
    ctx.add_score(ruff_result.returncode == 0, "Passes linting", key="lint")
```

### What to Measure

- **Correctness**: Do tests pass?
- **No regressions**: Does existing functionality still work?
- **Code quality**: Static analysis, linting, type checking
- **Efficiency**: Transcript metrics (turns, tokens, tool calls)

## Conversational Agents

Conversational agents interact with users in domains like support, sales, or coaching. They maintain state, use tools, and take actions mid-conversation.

### Key Grading Approach

Combine verifiable end-state outcomes with rubrics for interaction quality.

### Patterns

**Support Agent:**
```python
@eval(
    input="I need to cancel my subscription and get a refund",
    dataset="support"
)
async def test_cancellation(ctx: EvalContext):
    ctx.output = await support_agent(ctx.input, user_id="test_user")

    # State checks - did the agent actually do it?
    subscription = await db.get_subscription("test_user")
    assert subscription.status == "cancelled", "Should cancel subscription"

    refund = await db.get_latest_refund("test_user")
    assert refund is not None, "Should process refund"

    # Quality checks
    assert len(ctx.output) > 50, "Response too brief"
    assert "sorry" in ctx.output.lower() or "apologize" in ctx.output.lower()
```

**Multi-Turn Conversation:**
```python
@eval(dataset="multi_turn")
async def test_multi_turn_support(ctx: EvalContext):
    conversation = [
        "I'm having trouble with my order",
        "Order #12345",
        "Yes, please cancel it",
    ]

    history = []
    for message in conversation:
        response = await support_agent(message, history=history)
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": response})

    ctx.output = history
    ctx.metadata["turns"] = len(conversation)

    # Check final state
    order = await db.get_order("12345")
    assert order.status == "cancelled"

    # Check conversation stayed on track
    assert ctx.metadata["turns"] <= 5, "Should resolve in few turns"
```

**Simulated User:**
```python
from anthropic import Anthropic

client = Anthropic()

@eval(dataset="stress_test")
async def test_difficult_customer(ctx: EvalContext):
    user_persona = """
    You are a frustrated customer. You:
    - Keep asking for things against policy
    - Express frustration frequently
    - Eventually accept a reasonable solution
    """

    history = []
    max_turns = 10

    for _ in range(max_turns):
        # Agent responds
        agent_response = await support_agent(history)
        history.append({"role": "assistant", "content": agent_response})

        # Check if resolved
        if "resolved" in agent_response.lower():
            break

        # Simulated user responds
        user_response = client.messages.create(
            model="claude-sonnet-4-20250514",
            system=user_persona,
            messages=history
        )
        history.append({"role": "user", "content": user_response.content[0].text})

    ctx.output = history
    ctx.metadata["turns"] = len(history) // 2

    assert ctx.metadata["turns"] < max_turns, "Should resolve conversation"
```

### What to Measure

- **Task completion**: Is the ticket resolved?
- **State changes**: Was the action actually taken?
- **Turn efficiency**: Resolved in reasonable turns?
- **Interaction quality**: Tone, empathy, clarity (via LLM rubric)

## Research Agents

Research agents gather, synthesize, and analyze information, producing answers or reports.

### Key Grading Approach

Check groundedness (claims supported by sources), coverage (key facts included), and source quality.

### Patterns

**Basic Research:**
```python
@eval(
    input="What are the latest developments in quantum computing?",
    dataset="research"
)
async def test_research(ctx: EvalContext):
    result = await research_agent(ctx.input)
    ctx.output = result["answer"]
    ctx.metadata["sources"] = result.get("sources", [])

    # Coverage
    assert len(ctx.output) > 200, "Should provide comprehensive answer"

    # Sources cited
    assert len(ctx.metadata["sources"]) >= 3, "Should cite multiple sources"
```

**Groundedness Check:**
```python
def check_groundedness(ctx: EvalContext):
    """Verify claims are supported by cited sources."""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""
            Sources: {ctx.metadata['sources']}

            Answer: {ctx.output}

            List any claims in the answer that are NOT supported by the sources.
            If all claims are supported, say "ALL SUPPORTED".
            """
        }]
    )

    is_grounded = "ALL SUPPORTED" in response.content[0].text.upper()
    ctx.add_score(is_grounded, "Claims grounded in sources", key="groundedness")

@eval(input="Summarize recent AI regulation", evaluators=[check_groundedness])
async def test_grounded_research(ctx: EvalContext):
    result = await research_agent(ctx.input)
    ctx.output = result["answer"]
    ctx.metadata["sources"] = result["sources"]
```

**Factual Accuracy:**
```python
@eval(
    input="What was Apple's Q3 2024 revenue?",
    reference="94.9 billion",
    dataset="factual"
)
async def test_factual(ctx: EvalContext):
    ctx.output = await research_agent(ctx.input)

    # Extract numbers for comparison
    import re
    numbers = re.findall(r'[\d.]+\s*billion', ctx.output.lower())
    assert any("94" in n for n in numbers), "Should report correct figure"
```

### What to Measure

- **Groundedness**: Are claims supported by sources?
- **Coverage**: Are key facts included?
- **Source quality**: Are sources authoritative?
- **Accuracy**: For factual questions, is the answer correct?

## Computer Use Agents

Computer use agents interact through GUI - screenshots, clicks, keyboard input.

### Key Grading Approach

Verify environment state after task completion.

### Patterns

**Browser Task:**
```python
@eval(input="Book a flight from NYC to LAX for next Monday", dataset="browser")
async def test_flight_booking(ctx: EvalContext):
    ctx.output = await browser_agent(ctx.input)

    # Check actual state - not just what agent said
    booking = await flight_api.get_latest_booking(user_id="test")

    assert booking is not None, "Booking should exist"
    assert booking.origin == "NYC"
    assert booking.destination == "LAX"
    assert booking.date == next_monday()
```

**File System Task:**
```python
@eval(input="Create a project structure for a Python web app", dataset="filesystem")
async def test_project_creation(ctx: EvalContext):
    ctx.output = await computer_agent(ctx.input, working_dir="/tmp/test")

    # Verify file system state
    from pathlib import Path
    root = Path("/tmp/test")

    assert (root / "app").is_dir(), "Should create app directory"
    assert (root / "requirements.txt").exists(), "Should create requirements"
    assert (root / "README.md").exists(), "Should create README"
```

### What to Measure

- **Task completion**: Did the intended action happen?
- **Environment state**: Verify actual changes (files, DB, API state)
- **Efficiency**: Token usage, time to complete
- **No side effects**: Only intended changes made

## Handling Non-Determinism

Agent behavior varies between runs. Use multiple trials to get reliable measurements.

### pass@k

Probability of at least one success in k attempts. Use when one success matters.

```python
# Run 5 trials, pass if any succeed
@eval(dataset="difficult", metadata={"trials": 5})
async def test_hard_task(ctx: EvalContext):
    # This will be run multiple times
    ctx.output = await agent(ctx.input)
    assert meets_criteria(ctx.output)
```

### pass^k

Probability of all k trials succeeding. Use when consistency matters.

For customer-facing agents, use pass^k - users expect reliable behavior every time.

### Practical Approach

```python
# Run multiple trials and aggregate
results = []
for _ in range(5):
    result = await run_eval(task)
    results.append(result.passed)

pass_rate = sum(results) / len(results)
assert pass_rate >= 0.8, f"Should pass 80%+ of trials, got {pass_rate}"
```
