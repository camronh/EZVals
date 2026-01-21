# Eval Design

Best practices for designing evaluations that actually help you improve your agent.

## Start with Error Analysis, Not Eval Writing

The most common mistake in eval design is jumping straight to writing test cases without first understanding how your system actually fails. Error analysis should come first—it tells you what evals to write.

**Error analysis process:**

1. **Gather traces**: Collect 50-100 representative interactions with your agent. If you don't have production data yet, use the agent yourself or recruit friends to use it.

2. **Open coding**: Review each trace and write open-ended notes about issues you observe. Focus on the first failure in each trace, since upstream errors often cause downstream problems. Don't try to categorize yet—just journal what you see.

3. **Axial coding**: Group your notes into a failure taxonomy. Similar failures go into categories. Count how many failures fall into each category. An LLM can help with this grouping step.

4. **Iterate until saturation**: Keep reviewing traces until new ones stop revealing new failure modes. As a rule of thumb, review at least 100 traces.

This process ensures your evals target real problems rather than imagined ones. As Hamel Husain puts it: "Error analysis is the most important activity in evals. Error analysis helps you decide what evals to write in the first place."

**Don't skip this step.** Many teams waste effort building elaborate eval frameworks for failure modes that don't actually occur, while missing the failures that matter most to users.

## Test Outputs, Not Internals

A common instinct is to check that agents followed specific steps—a particular sequence of tool calls, certain reasoning patterns, specific intermediate states. This approach is too rigid and produces brittle tests.

Agents regularly find valid approaches that eval designers didn't anticipate. If you test that the agent used `search_docs` before `generate_answer`, you'll fail agents that successfully answered from memory or used a different tool sequence that worked perfectly well.

**Grade what the agent produced, not the path it took.** The question is whether the user got a correct, helpful result—not whether the agent solved it the way you expected.

```python
# Bad: testing internals
@eval(input="What is our refund policy?", dataset="qa")
def test_rag_uses_search(ctx: EvalContext):
    result = run_agent(ctx.input)
    assert "search_docs" in result.tool_calls  # Too rigid!

# Good: testing outputs
@eval(input="What is our refund policy?", reference="30 days", dataset="qa")
def test_rag_accuracy(ctx: EvalContext):
    ctx.output = run_agent(ctx.input)
    assert ctx.reference.lower() in ctx.output.lower()
```

There are exceptions. If you're specifically optimizing tool selection (e.g., reducing unnecessary API calls), you might temporarily add a tool usage eval. But this should be a targeted optimization metric, not your primary quality measure.

## Evals Are Experiments, Not Benchmarks

A benchmark is a fixed measuring stick you use to compare systems. An eval is an experiment you use to learn about your system.

This mindset shift matters because:

- **Benchmarks optimize for a score.** This encourages gaming the metric rather than improving the system.
- **Evals answer questions.** "Where does my agent fail?" "How does prompt X compare to prompt Y?" "What happens with edge case inputs?"

Don't aim for a specific pass rate. In fact, hitting 100% success (saturation) is actually a bad sign—it means your evals aren't challenging enough to reveal problems or measure improvements. A 70% pass rate might indicate a more meaningful eval that's actually stress-testing your system.

**Treat evals like scientific experiments:**

1. Start with a question you want to answer
2. Design an eval that could answer it
3. Run the eval and analyze results
4. Generate new questions based on what you learned
5. Repeat

## When to Use Evals vs Traditional Tests

Evals don't replace traditional software tests—they complement them. Here's when to use each:

| Aspect | Traditional Tests | Evals |
|--------|------------------|-------|
| **Pass rate expectation** | Must be 100% to merge | 70-90% is often fine |
| **Purpose** | "Are all the pieces working correctly?" | "When does my agent fail and why?" |
| **Run frequency** | Every commit (CI/CD) | When needed (model updates, experiments) |
| **Speed** | Fast (milliseconds) | Slower (LLM calls cost time and money) |
| **What they test** | Deterministic logic, integrations | Non-deterministic AI behavior |

Use traditional tests for:
- Tool implementations (does `search_docs` return the right format?)
- API integrations (does authentication work?)
- Data processing pipelines (is retrieval returning documents?)
- Configuration validation (are prompts loading correctly?)

Use evals for:
- Answer quality (is the response helpful?)
- Behavioral correctness (does it follow instructions?)
- Edge case handling (what happens with adversarial inputs?)
- Model comparisons (is Claude Opus better for this task than Sonnet?)

Garbage in, garbage out—if your retrieval function is broken, no amount of eval sophistication will save you. Test your infrastructure with traditional tests, then evaluate your AI behavior with evals.

## The Minimum Viable Eval

You don't need elaborate infrastructure to start evaluating. The minimum viable eval is:

1. A list of test inputs
2. A way to run your agent on each input
3. A way to check if the output is acceptable

```python
from ezvals import eval, parametrize, EvalContext

@eval(dataset="basic_qa")
@parametrize("input,reference", [
    ("What's the return policy?", "30 days"),
    ("How do I cancel?", "account settings"),
])
def test_basic_qa(ctx: EvalContext):
    ctx.output = my_agent(ctx.input)
    assert ctx.reference.lower() in ctx.output.lower()
```

That's it. Run `ezvals run`, see what fails, fix your agent, run again. You've escaped caveman testing.

**Start simple, then add complexity where it helps:**

1. Start with string matching (`expected in output`)
2. Add regex patterns for flexible matching
3. Add LLM-as-judge for subjective quality
4. Add multiple graders for different dimensions
5. Add synthetic data generation for scale

Only add complexity when the simpler approach isn't answering your questions.

## Build Reusable Components

Instead of building monolithic evals, build reusable pieces you can mix and match:

**Reusable datasets:**
```python
# datasets/support_questions.py
SUPPORT_QUESTIONS = [
    {"question": "Return policy?", "expected": "30 days", "category": "returns"},
    {"question": "Cancel subscription?", "expected": "account settings", "category": "billing"},
    # ... more cases
]
```

**Reusable graders:**
```python
# graders/string_match.py
def contains_any(output: str, keywords: list[str]) -> float:
    output_lower = output.lower()
    return 1.0 if any(kw.lower() in output_lower for kw in keywords) else 0.0

def json_valid(output: str) -> float:
    try:
        json.loads(output)
        return 1.0
    except:
        return 0.0
```

**Composing evals from components:**
```python
from datasets.support_questions import SUPPORT_QUESTIONS
from graders.string_match import contains_any

@eval(dataset="support")
@parametrize("input,reference", [(q["question"], q["expected"]) for q in SUPPORT_QUESTIONS])
def test_support_accuracy(ctx: EvalContext):
    ctx.output = support_agent(ctx.input)
    assert contains_any(ctx.output, [ctx.reference])
```

The components compound. Your first eval is the hardest. Your second reuses the dataset. Your third reuses the grader. Before you know it, you have a testing suite that helps you ship faster.

## Scale Complexity Gradually

The path from "no evals" to "production-grade eval suite" isn't one big jump. It's a series of small steps:

**Level 1: Manual review with structure**
- Run 20-50 inputs through your agent
- Review outputs manually in a notebook or spreadsheet
- Note patterns in failures

**Level 2: Automated runs with manual review**
- Script that runs inputs and collects outputs
- You still review manually, but iteration is faster
- EZVals at this stage: just `@eval` with no grader, manually reviewing

**Level 3: Basic automated grading**
- String matching, regex, JSON validation
- Pass/fail rates give you a number to track
- EZVals: `assert` statements and simple graders

**Level 4: LLM-as-judge for subjective quality**
- Model-based grading for things code can't check
- Requires calibration against human judgment
- EZVals: custom evaluators with LLM calls

**Level 5: Full suite with CI integration**
- Multiple eval types for different dimensions
- Runs on every significant change
- Regression detection, capability tracking

Don't jump to Level 5 on day one. Each level should feel like a natural extension of the previous one.

## The Eval-Driven Development Question

Some advocate "eval-driven development"—writing evals before implementing features, like test-driven development. This can work for specific, well-defined constraints ("never mention competitors"), but generally creates more problems than it solves.

**Why eval-driven development often fails:**

Unlike traditional software where failure modes are predictable, LLMs have infinite surface area for potential failures. You can't anticipate what will break before you see the system in action.

**Better approach:**

1. Build the feature
2. Do error analysis to see how it actually fails
3. Write evals for the failures you discover
4. Iterate

This avoids getting blocked on what to evaluate and prevents wasted effort on metrics that have no impact on actual system quality.

**Exception:** If you have a specific constraint you know matters ("responses must be under 500 tokens", "never recommend competitors"), writing that eval early is fine. But these should be targeted constraints, not your entire eval strategy.

## Writing Unambiguous Tasks

A good eval task is one where two domain experts would independently reach the same pass/fail verdict. Ambiguity in task specifications becomes noise in metrics.

**Bad task (ambiguous):**
```python
{"input": "Help me with my account", "expected": "helpful response"}
```

**Good task (unambiguous):**
```python
{"input": "How do I reset my password?", "expected_contains": ["settings", "password", "reset"]}
```

Everything the grader checks should be clear from the task description. Agents shouldn't fail due to ambiguous specs.

**Create reference solutions:** For each task, create a known-working output that passes all graders. This proves the task is solvable and verifies graders are correctly configured.

**Watch for 0% pass rates:** With frontier models, a 0% pass rate across many trials (pass@100 = 0%) usually signals a broken task or grader, not an incapable agent. Double-check your task specification and grading logic.

## Build Balanced Problem Sets

Test both the cases where a behavior should occur and where it shouldn't. One-sided evals create one-sided optimization.

If you only test whether the agent searches when it should, you might end up with an agent that searches for everything (over-triggering). If you only test that it answers from knowledge, you might get an agent that never searches (under-triggering).

**Example: Web search triggering**
```python
# Should search
{"input": "What's the weather in Miami today?", "should_search": True},
{"input": "Latest news about the election?", "should_search": True},

# Should NOT search
{"input": "What is 2+2?", "should_search": False},
{"input": "Who founded Apple?", "should_search": False},  # Common knowledge
```

Striking the right balance takes iteration. As you find cases where the balance is wrong, add them to your eval to prevent regression.
