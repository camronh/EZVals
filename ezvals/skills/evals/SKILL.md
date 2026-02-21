---
name: evals
description: Write and analyze evaluations for AI agents and LLM applications. Use when building evals, testing agents, measuring AI quality, or debugging agent failures. Use this skill when you need to test the performance of an LLM or Agent, or if the user mentions EZVals.
---

<!-- Version: 0.1.8 | Requires: ezvals >=0.1.0 -->

# AI Agent Evaluation Skill

Write, run, and analyze evaluations for AI agents and LLM applications. Assume we will use EZVals as the eval framework unless you are in a non-python project or the user specifies otherwise. 

## What Are Evals?

Traditional ML evals measure model performance on fixed benchmarks with clear accuracy metrics. LLM/agent evals measure something fuzzier, for example: task completion, answer quality, behavioral pass, or whether the agent actually helps users accomplish their goals.

Evals answer evolving questions about your system:

- "Does my agent work?" 
- "When does my agent fail?" 
- "Why does my agent fail and how do I fix it?"
- "How does my agent handle long conversations?"
- "What is the best combination of tools for my agent?" 
- "How well does my agent handle this new feature?"

## Vocabulary

| Term | Definition |
|------|------------|
| **Target** | The function or agent being evaluated. Takes input, produces output. |
| **Grader** | Function that scores the output. Returns 0-1 or pass/fail. |
| **Dataset** | Collection of test cases (inputs + optional expected outputs). |
| **Task** | Single test case: one input to evaluate. |
| **Trial** | One execution of a task. Multiple trials handle non-determinism. |
| **Transcript** | Full record of what happened during a trial (tool calls, reasoning steps, intermediate results). For the Anthropic API, this is the full messages array at the end of an eval run. |
| **Outcome** | The final result/output from the target. A flight-booking agent might say "Your flight has been booked" in the transcript, but the outcome is whether a reservation exists in the database. |
| **pass@k** | Passes if ANY of k trials succeed. Measures "can it ever work?" As k increases, pass@k rises. |
| **pass^k** | Passes only if ALL k trials succeed. Measures reliability. As k increases, pass^k falls. |
| **LLM-as-judge** | Using an LLM to grade another LLM's output. Requires calibration against human judgment. |
| **Saturation** | When evals hit 100%—a sign you need harder test cases, not that your agent is perfect. |
| **Error analysis** | Systematically reviewing traces to identify failure patterns before writing evals. |

## Phoenix Arize -> EZVals Migration Quick Map

If the user is migrating from Phoenix Arize, map old concepts to EZVals primitives first, then implement with normal Python tests.

| Phoenix Arize Pattern | EZVals Equivalent |
|------|------------|
| Dataset in Phoenix | `cases=[...]`, `dataset=`, or `input_loader=` |
| Task/experiment run | `@eval` function execution |
| Span-level trace analysis | `ctx.store(metadata=...)` plus run/result inspection in `ezvals serve` |
| Evaluator templates / rubric prompts | Assertions, `ctx.store(scores=...)`, or LLM-as-judge graders in eval code |
| Pass/fail evaluator output | Assertion success/failure or boolean score via `ctx.store(scores=[...])` |
| Numeric evaluator score | Numeric `score.value` (0-1 or arbitrary scale) via `ctx.store(scores=[...])` |
| Human annotation/correction loops | Web UI edits to scores/annotations (`correction_history` tracks before/after) |
| Compare experiments | Multiple runs in one session + compare view/URL filters |

Common migration approach (adapt as needed):

1. Start by porting a representative Arize dataset slice into EZVals `cases`.
2. Translate an evaluator into assertion logic to establish a baseline.
3. Add model-based grading where code checks are not enough.
4. Run with `ezvals run ...` and inspect trace/metadata in `ezvals serve ...`.
5. Recreate experiment comparison by naming runs and using compare mode.

When helping with migration, prefer direct concept translation over rebuilding Arize-style abstractions. Keep the user's eval logic explicit in Python so it stays easy to debug.

## Anatomy of an Eval

```
┌─────────────────────────────────────────────────────┐
│                      EVAL                           │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │ Dataset │ →  │ Target  │ →  │ Grader  │ → Score │
│  │(inputs) │    │(agent)  │    │(checker)│         │
│  └─────────┘    └─────────┘    └─────────┘        │
└─────────────────────────────────────────────────────┘
```

Three components you need:

1. **Target**: The agent function you're testing. It takes inputs from your dataset and produces outputs.
2. **Dataset**: The test cases—what inputs to feed the agent, and optionally what outputs you expect.
3. **Grader** (Optional): The logic that checks if the output is correct. This can be code-based (string matching, JSON validation), model-based (LLM-as-judge), or human review.

## Basic Example: RAG Agent

```python
// evals.py
from ezvals import eval, EvalContext

# The target: a RAG agent that answers questions
def rag_agent(ctx: EvalContext):
    docs = retriever.search(ctx.input)
    ctx.store(output=llm.generate(ctx.input, context=docs))

# The eval: combines target, dataset, and grader
@eval(
    dataset="rag_qa",
    target=rag_agent,
    cases=[
        {"input": "What is the return policy?", "reference": "30 days"},
        {"input": "How do I contact support?", "reference": "support@example.com"},
        {"input": "What payment methods are accepted?", "reference": "credit card"},
    ]
)
def test_rag_accuracy(ctx: EvalContext):
    assert ctx.reference.lower() in ctx.output.lower(), \
        f"Expected '{ctx.reference}' in output"
```

Run with: `ezvals run evals.py --session example-testing`

To rerun a specific list of failing evals, use explicit path selectors instead of temporary labels:
`ezvals run evals.py::test_a,test_b`

For specific case IDs, use `@case_id` selectors:
`ezvals run evals.py::test_a@case_id_1,test_a@case_id_2`

This eval runs your RAG agent against each test case and reports which passed. The `cases` parameter generates three separate evals from one function. Failed assertions become failing scores with the assertion message as notes.

## Eval Planning Flow

When helping a user write new evals, you're designing an experiment. In the experiment plan, you need to include all of the pieces that make a good eval experiment:

### 1. Consider the Question Being Asked

The user's problem statement may not always be a clear question that they want answered by the eval. Its your job to parse out the question they want answered. 

One example, if the user says they want "Evals for their customer service agent", what are the actual questions they want answered? Likely they are interested in how often their agent is able to handle user queries successfully. And maybe they're interested in cost and latency analysis. So the underlying question could be "How helpful is my customer service agent for users most common queries?"

Another example could be something more complex like "I want evals comparing these 3 LLMs for powering my coding agent". The underlying question could be "How is code quality and latency effected by switching between model X,Y, and Z?"

Formulate a practical question(s) and high level problem statement for the eval. Use this as the north star for formulating the experiment. If you're not confident, feel free to clarify things with the user to get a solid understanding of intent. 

### 2. High-Level Planning

Next, you want to plan out at a high level how you can answer the north star questions. You should assume you have access to dataset, or can generate them synthetically. You should assume you have targets available or can build them. And you should assume you have graders available if you need them or you can build them too.

Read through the other documentation available in this skill to make sure you're following best practices, but they are just guides and can/should be deviated from to fit the user's needs and current setup. 

Plan an experiment at a high level that, if ran, would answer the north star questions. Read up on best practices and narrow down your experiment to the most robust methodology you can. Include in the plan a high level description of the target, how/where you will get the dataset, and the evaluation logic if you plan on using an automated grader.


### 3. Take Inventory

Next, you want to see what the current codebase has for evals to see if theres anything you can reuse or expand. If they already have evals, you may find targets, graders, and maybe even datasets you can reuse. If they don't have evals, look around core functionality of the project and make decisions on what a good target may be. 

Put together an inventory with a description of what and why you chose: Target(s), Dataset, and optionally Graders

### 4. Check Environment and Dependencies

First, verify EZVals is available:

```bash
pip show ezvals
```

If not, include installation in the plan. Are there any external dependencies you may need to get started? Like API keys, Public Datasets, or libs to install. Include those in the plan. 

### 5. Produce Plan

You should have everything you need to plan a good eval from here. 

## Guides

### [targets.md](targets.md)
**When to read:** Writing or wrapping your agent/function as an eval target

- Target function pattern with EZVals
- Test outputs, not paths
- Capturing metadata (sources, tool calls)
- Common target patterns

### [datasets.md](datasets.md)
**When to read:** Building test cases, sourcing data

- Error analysis first principle
- Dataset sizing (iteration vs analysis vs regression)
- Sourcing test cases (manual, production, failure analysis)
- Using EZVals `cases=` and `input_loader`
- Building balanced datasets
- Avoiding saturation

### [synthetic-data.md](synthetic-data.md)
**When to read:** Generating synthetic test cases for the user

- When to generate directly vs. suggest a script
- Dimension-based generation for variety
- Validation and mixing with real data

### [graders.md](graders.md)
**When to read:** Scoring outputs, choosing grader types, calibrating LLM judges

- Code vs model vs human graders
- Assertions and `ctx.store(scores=...)`
- LLM-as-judge patterns and calibration
- Combining graders
- Reducing flakiness

### [running.md](running.md)
**When to read:** Running evals, managing sessions, serving results for review

- `ezvals run` vs `ezvals serve`
- Session and run naming best practices
- Serving results for user review
- Comparing runs and exporting results

## Use Cases

### [use-cases/rag-agents.md](use-cases/rag-agents.md)
**When to read:** Evaluating RAG systems, checking groundedness and retrieval quality

- Hallucination detection
- Pass and coverage verification
- Source quality checks
- Full RAG eval example

### [use-cases/coding-agents.md](use-cases/coding-agents.md)
**When to read:** Evaluating agents that write or modify code

- Unit tests on generated code
- Fail-to-pass tests for bug fixes
- Static analysis (linting, types, security)
- Handling non-determinism (pass@k, pass^k)

### [use-cases/testing-agent-skills.md](use-cases/testing-agent-skills.md)
**When to read:** Evaluating agent skills, CLAUDE.md/AGENTS.md configs, MCP servers, or comparing coding agents (Claude Code, Codex, Cursor, etc.)

- Plan-only evals for testing skills without file mutations
- Headless CLI agents as targets (`claude -p`, `codex exec`)
- CLI agent as LLM judge (subscription-powered, no API key)
- Dataset/target/evaluator reference structure
- Judge alignment and iteration workflow

### [use-cases/testing-internals.md](use-cases/testing-internals.md)
**When to read:** Testing tools, multi-agents, workflow nodes

- When to test internals (and when not to)
- Tool call verification
- Multi-agent coordination
- State verification
- Environment isolation

## Reference

### [ezvals-docs/](ezvals-docs/)
**When to read:** EZVals API reference—decorators, scoring, CLI, web UI

- quickstart.mdx - Getting started
- decorators.mdx - The @eval decorator options
- eval-context.mdx - EvalContext API
- scoring.mdx - Scoring with assertions and ctx.store()
- patterns.mdx - Common eval patterns
- cli.mdx - Command line interface
- web-ui.mdx - Interactive results exploration

## Running Evals

```bash
# Run evals headlessly
ezvals run evals/ --session my-experiment --run-name baseline

# Serve results for user to review in browser
ezvals serve evals/ --session my-experiment

# Start serve without launching a browser window
ezvals serve evals/ --session my-experiment --no-open
```

## Sharing Results via URL (Agent Guidance)

When the user is already serving the UI, prefer sharing a focused URL instead of asking them to rerun serve with extra flags.

Use the running base URL (for example `http://127.0.0.1:8000`) plus query params to open exactly what they should see:

- `run_id=<id>` (single-run views)
- `compare_run_id=<id>` (repeatable)
- `search=<text>`
- `annotation=any|yes|no`
- `has_error=1|0`
- `has_url=1|0`
- `has_messages=1|0`
- `dataset_in`, `dataset_out`, `label_in`, `label_out` (repeatable)
- `score_value=<key,op,value>`, `score_passed=<key,true|false>`

Example response to user:

```text
You can see the passing results for the two final runs here:
http://127.0.0.1:8000/?compare_run_id=1826bc4c&compare_run_id=58741756&score_passed=pass,true
```

See [running.md](running.md) for session management and URL construction examples.

## Human Corrections Guidance (Agent)

If the user says anything like "leaving notes", "making corrections", "manual edits", or "edited scores/annotations", inspect each row's `result.correction_history` first.

Use it to answer:
- What changed (`field`)
- What the judge had before (`before`)
- What the human set after (`after`)
- When the correction happened (`timestamp`)

Treat `correction_history` as the source of truth for manual override context before proposing judge prompt changes or grader fixes.

## Feedback

If the user mentions something about EZVals that isn't working well, seems confusing, or could be better, suggest they file a GitHub issue at https://github.com/camronh/EZVals/issues. Offer to help them draft the issue or file it directly using `gh`.

## Resources

- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Hamel Husain: LLM Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
- [EZVals GitHub](https://github.com/camronh/EZVals)
