# Agent Evals

Evaluation strategies for different types of AI agents. Each agent type has distinct challenges and proven approaches.

## Agent Evals vs Single-Turn Evals

Single-turn evals are straightforward: a prompt, a response, grading logic.

Agent evals are fundamentally more complex:

- **Multi-turn interactions**: Agents use tools across many turns, modifying state as they go
- **Error propagation**: Mistakes can compound—an early misstep affects all subsequent steps
- **Creative solutions**: Frontier models find valid approaches that eval designers didn't anticipate
- **Environment state**: The "answer" isn't just text—it's changes to databases, files, or external systems

This means agent evals need:
1. Clean environments per trial (no shared state that could correlate failures)
2. Outcome verification (check actual state, not just what the agent said)
3. Flexibility in grading (don't penalize creative solutions that work)

## Coding Agents

Coding agents write, test, and debug code. They navigate codebases and run commands like human developers.

### Key Principle: Test Outputs, Not Paths

Don't check if the agent used a specific sequence of tools or followed a particular reasoning pattern. Agents regularly find valid approaches you didn't anticipate. Grade whether the code works, not how the agent got there.

### Grading Approaches

**Unit tests on generated code** are the natural fit. Does the code run? Do the tests pass? This is deterministic and objective.

```python
@eval(input="Write a function that checks if a number is prime")
def test_prime_function(ctx: EvalContext):
    ctx.output = coding_agent(ctx.input)

    # Execute the generated code in isolated namespace
    local_ns = {}
    exec(ctx.output, {}, local_ns)
    is_prime = local_ns.get("is_prime") or local_ns.get("check_prime")

    # Test correctness with known cases
    assert is_prime(2) == True, "2 is prime"
    assert is_prime(4) == False, "4 is not prime"
    assert is_prime(17) == True, "17 is prime"
    assert is_prime(1) == False, "1 is not prime"
    assert is_prime(0) == False, "0 is not prime"
```

**Fail-to-pass tests** verify bug fixes. The agent receives a failing test and must make it pass without breaking other tests.

```python
@eval(
    input="Fix the authentication bypass when password is empty",
    metadata={"repo": "test-repo", "failing_test": "test_auth.py::test_empty_password"}
)
def test_security_fix(ctx: EvalContext):
    ctx.output = coding_agent(ctx.input, repo=ctx.metadata["repo"])

    # Run the previously failing test
    result = subprocess.run(
        ["pytest", ctx.metadata["failing_test"], "-v"],
        capture_output=True,
        cwd=ctx.metadata["repo"]
    )
    assert result.returncode == 0, f"Fix didn't work: {result.stderr.decode()}"

    # Run full test suite to check for regressions
    full_result = subprocess.run(
        ["pytest", "tests/", "-v"],
        capture_output=True,
        cwd=ctx.metadata["repo"]
    )
    assert full_result.returncode == 0, "Fix broke other tests"
```

**Static analysis** checks code quality beyond just correctness:

```python
@eval(input="Refactor this function for better readability", dataset="code_quality")
def test_code_quality(ctx: EvalContext):
    ctx.output = coding_agent(ctx.input)

    # Type checking
    mypy_result = subprocess.run(
        ["mypy", "--strict", "-"],
        input=ctx.output.encode(),
        capture_output=True
    )

    # Linting
    ruff_result = subprocess.run(
        ["ruff", "check", "-"],
        input=ctx.output.encode(),
        capture_output=True
    )

    # Security scanning
    bandit_result = subprocess.run(
        ["bandit", "-r", "-"],
        input=ctx.output.encode(),
        capture_output=True
    )

    ctx.store(scores=[
        {"passed": mypy_result.returncode == 0, "key": "types", "notes": "Passes type checking"},
        {"passed": ruff_result.returncode == 0, "key": "lint", "notes": "Passes linting"},
        {"passed": bandit_result.returncode == 0, "key": "security", "notes": "No security issues"},
    ])
```

### What to Measure

| Metric | How to Measure |
|--------|----------------|
| Correctness | Unit tests pass |
| No regressions | Full test suite passes |
| Code quality | Static analysis (ruff, mypy, bandit) |
| Efficiency | Turns taken, tokens used, tool calls made |

### Example: Full Coding Agent Eval

```yaml
# Theoretical eval config showing all components
task:
  id: "fix-auth-bypass_1"
  desc: "Fix authentication bypass when password field is empty"
  graders:
    - type: unit_tests
      required: [test_empty_pw_rejected.py, test_null_pw_rejected.py]
    - type: static_analysis
      tools: [ruff, mypy, bandit]
    - type: state_check
      expect:
        security_logs: {event_type: "auth_blocked"}
  tracked_metrics:
    - n_turns
    - n_toolcalls
    - n_total_tokens
```

## Conversational Agents

Conversational agents interact with users in domains like support, sales, or coaching. Unlike coding agents where output quality is primary, here the interaction quality itself is being evaluated.

### Key Principle: Verify State, Not Just Words

A support agent might say "Your refund has been processed" but the eval should verify the refund actually exists in the system. Check outcomes, not promises.

### Grading Approaches

**State verification** confirms the agent took the claimed action:

```python
@eval(input="I need to cancel my subscription and get a refund")
async def test_cancellation(ctx: EvalContext):
    ctx.output = await support_agent(ctx.input, user_id="test_user")

    # Verify actual state changes
    subscription = await db.get_subscription("test_user")
    assert subscription.status == "cancelled", "Should cancel subscription"

    refund = await db.get_latest_refund("test_user")
    assert refund is not None, "Should process refund"
    assert refund.status == "processed", "Refund should be processed"
```

**Interaction quality rubrics** assess how well the agent communicates:

```python
@eval(input="Handle a frustrated customer asking about a delayed order")
def test_support_quality(ctx: EvalContext):
    ctx.output = support_agent(ctx.input)

    # Check required elements
    checks = check_assertions(ctx.output, [
        "Shows empathy for the customer's frustration",
        "Clearly explains the situation or next steps",
        "Maintains professional tone throughout"
    ])

    for assertion, passed in checks.items():
        ctx.store(scores={"passed": passed, "key": assertion[:20], "notes": assertion})
```

**Multi-turn evaluation** tests conversation flow:

```python
@eval(dataset="multi_turn_scenarios")
async def test_order_cancellation_flow(ctx: EvalContext):
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

    ctx.output = history[-1]["content"]  # Final response
    ctx.metadata["turns"] = len(conversation)

    # Verify outcome
    order = await db.get_order("12345")
    assert order.status == "cancelled"

    # Check efficiency
    assert ctx.metadata["turns"] <= 5, "Should resolve within 5 turns"
```

**Simulated users** stress-test the agent with realistic personas:

```python
@eval(dataset="stress_test")
async def test_difficult_customer(ctx: EvalContext):
    user_persona = """You are a frustrated customer. You:
    - Keep asking for things against policy (full refund on used item)
    - Express frustration with phrases like "this is ridiculous"
    - Eventually accept a reasonable alternative if offered politely
    """

    history = []
    for _ in range(10):
        # Agent responds
        agent_msg = await support_agent(history)
        history.append({"role": "assistant", "content": agent_msg})

        # Check if resolved
        if is_resolved(history):
            break

        # Simulated user responds
        user_msg = await simulate_user(user_persona, history)
        history.append({"role": "user", "content": user_msg})

    ctx.output = history
    assert is_resolved(history), "Should eventually resolve the conversation"
```

### What to Measure

| Metric | How to Measure |
|--------|----------------|
| Task completion | State verification (ticket resolved, refund processed) |
| Turn efficiency | Conversation length |
| Interaction quality | LLM rubric for empathy, clarity, professionalism |
| Policy compliance | Check agent followed business rules |

## Research Agents

Research agents gather, synthesize, and analyze information. Unlike coding where tests provide binary pass/fail, research quality is relative to the task and often subjective.

### Key Principle: Groundedness Over Everything

The primary failure mode for research agents is stating things that aren't supported by their sources. Groundedness checks—verifying claims against cited sources—should be your first grading layer.

### Grading Approaches

**Groundedness verification** checks if claims are supported:

```python
def check_groundedness(ctx: EvalContext):
    """Verify all claims are supported by cited sources"""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""Sources the agent cited:
{ctx.metadata['sources']}

Agent's answer:
{ctx.output}

List any factual claims in the answer that are NOT directly supported by the sources.
If every factual claim is supported, respond with only: ALL_SUPPORTED"""
        }]
    )

    is_grounded = "ALL_SUPPORTED" in response.content[0].text
    ctx.store(scores={"passed": is_grounded, "key": "groundedness", "notes": "All claims grounded in sources"})
    if not is_grounded:
        ctx.store(scores={"passed": False, "key": "unsupported_claims", "notes": response.content[0].text})

@eval(input="Summarize recent AI safety developments")
async def test_research_groundedness(ctx: EvalContext):
    result = await research_agent(ctx.input)
    ctx.output = result["answer"]
    ctx.metadata["sources"] = result["sources"]
    check_groundedness(ctx)
```

**Coverage verification** checks if key facts are included:

```python
@eval(
    input="What are the key features of Python 3.12?",
    metadata={"required_topics": ["type hints", "f-strings", "performance"]}
)
async def test_coverage(ctx: EvalContext):
    ctx.output = await research_agent(ctx.input)

    covered = []
    for topic in ctx.metadata["required_topics"]:
        if topic.lower() in ctx.output.lower():
            covered.append(topic)

    coverage = len(covered) / len(ctx.metadata["required_topics"])
    ctx.store(scores={
        "passed": coverage >= 0.8,
        "key": "coverage",
        "notes": f"Covered {len(covered)}/{len(ctx.metadata['required_topics'])} topics"
    })
```

**Source quality verification** checks if sources are authoritative:

```python
def check_source_quality(ctx: EvalContext):
    """Verify sources are authoritative, not random blogs"""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""Evaluate these sources for a research query about "{ctx.input}":

Sources: {ctx.metadata['sources']}

Are these authoritative sources (official docs, peer-reviewed, established news)?
Or are they low-quality sources (random blogs, forums, outdated content)?

Answer: HIGH_QUALITY or LOW_QUALITY, then explain briefly."""
        }]
    )

    is_quality = "HIGH_QUALITY" in response.content[0].text
    ctx.store(scores={"passed": is_quality, "key": "source_quality", "notes": "Uses authoritative sources"})
```

**Factual accuracy** for questions with verifiable answers:

```python
@eval(
    input="What was Tesla's revenue in Q3 2024?",
    reference="$25.18 billion"
)
async def test_factual_accuracy(ctx: EvalContext):
    ctx.output = await research_agent(ctx.input)

    # Extract numbers for comparison
    import re
    numbers = re.findall(r'\$?[\d.]+\s*billion', ctx.output.lower())

    # Check if correct figure appears
    correct = any("25" in n for n in numbers)
    ctx.store(scores={"passed": correct, "key": "accuracy", "notes": "Reports correct revenue figure"})
```

### What to Measure

| Metric | How to Measure |
|--------|----------------|
| Groundedness | LLM check that claims are supported by sources |
| Coverage | Key facts/topics included |
| Source quality | LLM assessment of source authority |
| Factual accuracy | Comparison to known-correct answers |

## Computer Use Agents

Computer use agents interact through GUIs—screenshots, clicks, keyboard input. They can use any application with a visual interface.

### Key Principle: Verify Environment State

What the agent says it did and what actually happened can differ. Always verify the actual state of the environment after the task completes.

### Grading Approaches

**State verification** confirms the task was actually accomplished:

```python
@eval(input="Book a flight from NYC to LAX for March 15")
async def test_flight_booking(ctx: EvalContext):
    ctx.output = await browser_agent(ctx.input)

    # Don't trust the agent's claim—verify actual state
    booking = await flight_api.get_latest_booking(user_id="test")

    assert booking is not None, "No booking found in system"
    assert booking.origin == "NYC", f"Wrong origin: {booking.origin}"
    assert booking.destination == "LAX", f"Wrong destination: {booking.destination}"
    assert booking.date.month == 3 and booking.date.day == 15, "Wrong date"
```

**File system verification** for tasks that create or modify files:

```python
@eval(input="Create a new React project called 'my-app'")
async def test_project_creation(ctx: EvalContext):
    ctx.output = await computer_agent(ctx.input, working_dir="/tmp/test")

    # Verify file structure
    from pathlib import Path
    root = Path("/tmp/test/my-app")

    assert root.exists(), "Project directory not created"
    assert (root / "package.json").exists(), "Missing package.json"
    assert (root / "src").is_dir(), "Missing src directory"
    assert (root / "src" / "App.js").exists() or (root / "src" / "App.tsx").exists(), "Missing App file"
```

**Screenshot comparison** for visual tasks:

```python
@eval(input="Change the website theme to dark mode")
async def test_theme_change(ctx: EvalContext):
    result = await browser_agent(ctx.input, capture_screenshots=True)
    ctx.output = result.final_screenshot

    # Check that dark mode is active (simplified)
    avg_brightness = calculate_brightness(ctx.output)
    assert avg_brightness < 50, "Page doesn't appear to be in dark mode"
```

### What to Measure

| Metric | How to Measure |
|--------|----------------|
| Task completion | State verification (DB, files, API) |
| Accuracy | Correct values in correct places |
| Efficiency | Time to complete, number of actions |
| No side effects | Only intended changes were made |

## Handling Non-Determinism

Agent behavior varies between runs. The same input can produce different outputs, different tool sequences, or different final states. This is fundamental to agents, not a bug to eliminate.

### pass@k: "Can It Ever Work?"

Measures the probability of at least one success in k attempts. As k increases, pass@k rises—more attempts means higher odds of one success.

**Use pass@k when:**
- One working solution is all you need
- You're measuring capability ("can it solve this?")
- The agent proposes multiple solutions and any working one is fine

```python
# Example: Test if agent can solve hard problems (any of 5 attempts)
@eval(input="Solve this complex math problem", reference="42", dataset="difficult_tasks")
def test_hard_task_pass_at_5(ctx: EvalContext):
    successes = 0
    for _ in range(5):
        output = agent(ctx.input)
        if verify_solution(output, ctx.reference):
            successes += 1

    # pass@5: at least one success in 5 attempts
    ctx.store(scores={"passed": successes > 0, "key": "pass_at_5", "notes": f"{successes}/5 succeeded"})
```

### pass^k: "Is It Reliable?"

Measures the probability that ALL k trials succeed. As k increases, pass^k falls—demanding consistency across more trials is harder.

**Use pass^k when:**
- Users expect reliable behavior every time
- Inconsistency is a bug (customer-facing agents)
- You're measuring reliability, not just capability

```python
# Example: Test consistency for customer-facing agent
@eval(input="What is our refund policy?", dataset="critical_tasks")
def test_reliability_pass_to_3(ctx: EvalContext):
    results = []
    for _ in range(3):
        output = agent(ctx.input)
        results.append(verify_correct(output))

    # pass^3: all 3 must succeed
    all_passed = all(results)
    ctx.store(scores={"passed": all_passed, "key": "pass_to_3", "notes": f"{sum(results)}/3 succeeded"})
```

### Practical: Measure Pass Rate

For most use cases, simply measure what percentage of trials pass:

```python
@eval(input="Standard test query", dataset="standard_tasks", metadata={"trials": 10})
def test_with_pass_rate(ctx: EvalContext):
    results = []
    for _ in range(ctx.metadata["trials"]):
        output = agent(ctx.input)
        results.append(verify(output))

    pass_rate = sum(results) / len(results)
    ctx.store(scores={"passed": pass_rate >= 0.8, "key": "pass_rate", "notes": f"Pass rate: {pass_rate:.0%}"})
```

### Choosing the Right Metric

| Scenario | Metric | Threshold Example |
|----------|--------|-------------------|
| "Can the agent solve this at all?" | pass@k | pass@10 ≥ 50% |
| "Is the agent reliable enough to ship?" | pass^k | pass^3 = 100% |
| "How often does it work?" | Pass rate | ≥ 90% |

For customer-facing agents where users expect consistent behavior, prefer pass^k. For research or exploration tasks where you'll manually review outputs, pass@k may suffice.

## Environment Setup

Agent evals require more setup than single-turn evals. Key considerations:

### Isolation

Each trial should start from a clean state. Shared state between runs can:
- Cause correlated failures (not independent measurements)
- Artificially inflate performance (agent uses data from previous trials)
- Create flaky tests (order-dependent results)

```python
@pytest.fixture
def clean_environment():
    # Set up clean state
    db.reset_to_snapshot("test_baseline")
    cleanup_temp_files()

    yield

    # Clean up after test
    db.reset_to_snapshot("test_baseline")
```

### Reproducibility

Make environments as deterministic as possible:
- Pin random seeds where applicable
- Use fixed timestamps for time-sensitive operations
- Snapshot and restore database state
- Use containerized environments for system-level changes

### Resource Constraints

Agent evals are expensive (time, compute, API costs). Plan accordingly:
- Run fewer trials during development, more for release decisions
- Parallelize independent trials
- Set timeouts to catch runaway agents
- Monitor token usage and cost
