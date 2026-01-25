# Common Pitfalls

Anti-patterns in eval design and how to avoid them.

## The "Caveman Testing" Anti-Pattern

**The problem:** You iterate on your agent by manually copy-pasting prompts, one by one, eyeballing outputs, then making changes and doing it all again.

At its worst, you have a list of test prompts in a notes file that you paste one by one. Every. Single. Time.

**Why it fails:**

- **Slow iterations**: Change, manually test, find issue, change, manually test again. By the third pass, you've lost the will to live.
- **Low coverage**: You can only test 5-10 queries before your brain turns to mush. Not enough to catch edge cases.
- **Hard to track**: How do you communicate findings? Screenshots in Slack? Good luck reproducing results.
- **Fix one thing, break another**: Without comprehensive testing, fixing one query often breaks another.
- **No data for decisions**: You can't say "this agent works 95% of the time." Decisions are based on gut feel.

**The fix:** Build even a minimal eval. A script that runs your test queries in parallel and shows you a table of inputs/outputs. You still review manually, but you've escaped caveman testing.

```python
from ezvals import eval, EvalContext

# Minimal escape from caveman testing
@eval(dataset="routing", cases=[
    {"input": "Route me to sales", "reference": "555-0100"},
    {"input": "I have a billing question", "reference": "555-0200"},
    {"input": "Technical support", "reference": "555-0300"},
])
def test_routing(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert ctx.reference in ctx.output
```

Run `ezvals run`, see what fails, fix, repeat. You've already 10x'd your iteration speed.

## Over-Engineering Eval Frameworks

**The problem:** You spend weeks building elaborate eval infrastructure before writing a single test case.

**Why it fails:**

- You don't know what you need to test yet
- The framework becomes the project instead of the product
- Complexity slows down the people who need to add evals
- You optimize for features you never use

**The fix:** Start with the minimum viable eval. Add infrastructure only when its absence is blocking you.

**Progression:**

1. A Python script that runs queries and prints results
2. Add assertions for pass/fail
3. Add EZVals for structure and tooling
4. Add LLM-as-judge when code graders aren't enough
5. Add CI integration when you have evals worth protecting

If you're spending more than a day setting up eval infrastructure, stop and reconsider.

## Testing Internals Instead of Outputs

**The problem:** You write evals that check if the agent used tool X at step Y, or followed a specific reasoning pattern.

```python
# Bad: testing internals
@eval(input="What is the refund policy?", dataset="qa")
def test_process(ctx: EvalContext):
    result = agent(ctx.input)
    # Too rigid!
    assert result.tool_calls[0].name == "search"
    assert result.tool_calls[1].name == "analyze"
    assert "therefore" in result.reasoning
```

**Why it fails:**

- Agents find creative solutions you didn't anticipate
- Valid approaches get penalized
- You're testing implementation, not outcomes
- Brittle tests that break on any refactor

**The fix:** Test whether the agent got the right answer, not how it got there.

```python
# Good: testing outputs
@eval(input="What is the refund policy?", reference="30 days", dataset="qa")
def test_accuracy(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    # Did it get the right answer? Don't care how.
    assert ctx.reference in ctx.output or semantically_equivalent(ctx.output, ctx.reference)
```

**Exception:** If you're specifically optimizing tool usage (e.g., reducing unnecessary API calls), a targeted tool-usage eval is fine. But it should be a secondary metric, not your primary quality measure.

## Trusting LLM Judges Blindly

**The problem:** You use an LLM to grade outputs and trust its judgments without verification.

```python
# Dangerous: trusting LLM without calibration
def grade(output):
    response = llm("Is this response good? YES or NO")
    return response == "YES"  # Do you even know what this measures?
```

**Why it fails:**

- The LLM's definition of "good" may not match yours
- Systematic biases you don't notice
- No way to know when the judge is wrong
- Creates false confidence in your metrics

**The fix:** Calibrate LLM judges against human judgment.

1. Have a human grade 50-100 outputs
2. Run your LLM judge on the same outputs
3. Calculate True Positive Rate and True Negative Rate
4. If alignment is poor, refine the judge prompt
5. Re-check periodically

```python
# Better: validated LLM judge
def grade_with_validation(output, human_labels_sample):
    # Regular judge
    judge_result = llm_judge(output)

    # But you've validated this judge shows 90% alignment with human labels
    # on your calibration set
    return judge_result
```

Don't trust generic metrics from eval libraries either. "Helpfulness score" and "coherence rating" measure something, but probably not what matters for your specific use case.

## Not Looking at the Data

**The problem:** You build evals based on what you imagine users might do wrong, without looking at actual failures.

**Why it fails:**

- You test for problems that don't exist
- You miss the problems that do exist
- Your failure taxonomy doesn't match reality
- Wasted effort on irrelevant scenarios

**The fix:** Do error analysis first. Look at 50-100 actual traces before writing evals.

**The process:**

1. Gather real traces (production data or your own testing)
2. Review each one, noting issues (open coding)
3. Group issues into categories (axial coding)
4. Count frequency per category
5. Write evals for the categories that actually matter

Many teams discover their agent fails in ways they never anticipated. A support agent that's brilliant at refunds might completely fumble shipping questions. You won't know until you look at the data.

## Saturation: 100% Pass Rate

**The problem:** Your evals all pass. You feel great. But you've stopped learning.

**Why it fails:**

- No signal for improvement
- Can't distinguish good agents from great ones
- New model versions score identically
- False confidence that your agent is "done"

**Signs of saturation:**

- Pass rate stuck at 100%
- Upgraded models don't improve scores
- You can't find cases that fail

**The fix:** Make evals harder.

- Add edge cases and adversarial inputs
- Add negative cases (when should the agent refuse?)
- Raise the bar (from "contains keyword" to "semantically correct")
- Diversify beyond your current categories

A 70-80% pass rate often indicates a more useful eval than 100%. The struggling cases are where you learn.

## Building Generic Evals

**The problem:** You use off-the-shelf metrics like "helpfulness", "coherence", "toxicity" without understanding what they measure.

**Why it fails:**

- Generic metrics may not capture what matters for your use case
- High scores on generic metrics don't mean your product works
- Creates false confidence
- Obscures actual failure modes

**The fix:** Build evals from your specific failure modes.

1. Do error analysis to find YOUR problems
2. Define what "good" means for YOUR use case
3. Build custom graders that check YOUR criteria
4. Only use generic metrics for exploration, not evaluation

If a real estate assistant fails to mention pet policies, no amount of "helpfulness" scoring will catch that. You need a specific check: "Did the response mention pet policies when relevant?"

## Eval-Driven Development (Usually)

**The problem:** You try to write evals before building the feature, like test-driven development.

**Why it usually fails:**

- LLMs have infinite surface area for failures
- You can't anticipate what will break
- You end up blocked on "what should I test?"
- Evals become outdated before the feature is done

**When it works:** For specific, known constraints.

```python
# This is fine: known constraint
@eval(input="Recommend a project management tool", dataset="competitor_mentions")
def test_never_mention_competitors(ctx: EvalContext):
    ctx.output = agent(ctx.input)
    assert "CompetitorName" not in ctx.output
```

**Better approach:**

1. Build the feature
2. Do error analysis
3. Write evals for discovered failures
4. Iterate

This way your evals reflect actual problems, not hypothetical ones.

## Ignoring Grader Flakiness

**The problem:** Your LLM-based grader gives different results on repeated runs, but you treat each result as ground truth.

**Why it fails:**

- Noisy metrics make it hard to detect real improvements
- You might ship regressions hidden by noise
- Or reject improvements that got unlucky in grading

**The fix:** Accept and manage flakiness.

1. **Use temperature=0** for more consistent (not perfect) results
2. **Constrain output format**: "PASS or FAIL" is more consistent than open-ended
3. **Run multiple trials** and aggregate (majority vote, average)
4. **Track confidence intervals** when making decisions

```python
# Better: aggregate multiple runs
def grade_with_confidence(output, trials=3):
    results = [llm_judge(output) for _ in range(trials)]
    pass_rate = sum(results) / len(results)
    # Use pass_rate instead of single binary result
    return pass_rate >= 0.67  # Majority passed
```

## Not Reading Transcripts

**The problem:** You run evals, see the scores, and make decisions without reading what actually happened.

**Why it fails:**

- You don't know if graders are working correctly
- You miss patterns in how the agent fails
- You can't distinguish genuine failures from grading bugs
- Scores become meaningless numbers

**The fix:** Read the transcripts. Especially:

- Failures: Is this a real problem or a grader issue?
- Edge cases: What creative solutions is the agent finding?
- Close calls: Why did this barely pass or barely fail?

At Anthropic, teams invested in tooling for viewing eval transcripts and regularly take time to read them. Reading transcripts is how you verify your eval measures what matters.

**Rule of thumb:** If you haven't read at least 20 transcripts from your latest eval run, you don't actually know what your scores mean.

## Building for Hypothetical Features

**The problem:** You build eval infrastructure for features that don't exist yet. "We'll need this when we add X."

**Why it fails:**

- X may never happen
- When X happens, you'll understand it better and build something different
- Complexity slows down current work
- YAGNI (You Ain't Gonna Need It)

**The fix:** Build for what you need now. When you need more, add it then.

The team that ships quickly with minimal evals and iterates beats the team that builds the perfect eval framework and never ships.
