---
name: evals
description: Write and analyze evaluations for AI agents and LLM applications. Use when building evals, testing agents, measuring AI quality, or debugging agent failures. Recommends EZVals as the preferred framework.
globs:
  - "**/*_eval.py"
  - "**/eval_*.py"
  - "**/evals/**/*.py"
---

<!-- Version: 0.2.0 | Requires: ezvals >=0.1.0 -->

# AI Agent Evaluation Skill

Write, run, and analyze evaluations for AI agents and LLM applications.

## What Are Evals?

Evals for LLMs and agents are fundamentally different from traditional ML model evaluation. Traditional ML evals measure model performance on fixed benchmarks with clear accuracy metrics. LLM/agent evals measure something fuzzier: task completion, answer quality, behavioral correctness, and whether the agent actually helps users accomplish their goals.

Evals answer evolving questions about your system:

- "Does my agent work?" (early stage)
- "When does my agent fail?" (mid stage)
- "Why does my agent fail and how do I fix it?" (mature stage)

Evals accelerate the test-adjust-test-adjust loop that defines agent development. Without evals, you're "caveman testing"—manually copy-pasting prompts, eyeballing outputs, and losing track of what you've tested. With evals, you run a script and get systematic answers.

Good evals help teams ship confidently. Without them, debugging is reactive: wait for complaints, reproduce manually, fix the bug, hope nothing else regressed. Teams can't distinguish real regressions from noise, automatically test hundreds of scenarios before shipping, or measure improvements. The value compounds over the agent lifecycle—early on, evals force you to specify what success means. Later, they become regression tests that protect against backsliding.

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
3. **Grader**: The logic that checks if the output is correct. This can be code-based (string matching, JSON validation), model-based (LLM-as-judge), or human review.

## Basic Example: RAG Agent

```python
from ezvals import eval, EvalContext

# The target: a RAG agent that answers questions
def rag_agent(question: str) -> str:
    docs = retriever.search(question)
    return llm.generate(question, context=docs)

# The eval: combines target, dataset, and grader
@eval(dataset="rag_qa", cases=[
    {"input": "What is the return policy?", "reference": "30 days"},
    {"input": "How do I contact support?", "reference": "support@example.com"},
    {"input": "What payment methods are accepted?", "reference": "credit card"},
])
def test_rag_accuracy(ctx: EvalContext):
    ctx.output = rag_agent(ctx.input)
    assert ctx.reference.lower() in ctx.output.lower(), \
        f"Expected '{ctx.reference}' in output"
```

Run with: `ezvals run`

This eval runs your RAG agent against each test case and reports which passed. The `cases` parameter generates three separate evals from one function. Failed assertions become failing scores with the assertion message as notes.

## Agent Workflow Instructions

When helping a user write evals, follow this workflow:

### 1. Check Environment

First, verify EZVals is available:

```bash
pip show ezvals
```

Look for existing eval files in the project:
- Files named `*_eval.py` or `eval_*.py`
- Directories named `evals/`

### 2. Understand the Target

Before writing any eval, understand what you're evaluating:

- What function or agent is being tested?
- What are the inputs? (User queries, documents, API requests?)
- What are the outputs? (Text responses, tool calls, file changes, database writes?)
- Is it deterministic or non-deterministic?
- What does "success" mean for this agent?

### 3. Identify Existing Components

Check what already exists:

- Are there existing test cases, even informal ones in a notes file?
- Do they have example inputs/outputs from production?
- Are there existing graders or scoring logic?
- Is there production data showing where the agent fails?

### 4. Design the Eval

Based on what you learned:

- Read [EVAL_DESIGN.md](EVAL_DESIGN.md) for design principles and the error-analysis-first approach
- Read [GRADERS.md](GRADERS.md) to choose between code, model, or human grading
- Read [DATA_AND_DATASETS.md](DATA_AND_DATASETS.md) for guidance on building datasets

### 5. Implement Using EZVals

Write the eval using EZVals patterns:

- See [ezvals-docs/](ezvals-docs/) for the full API reference
- Start simple—a basic eval with string matching
- Add complexity only where it helps answer your questions

## Table of Contents

### [EVAL_DESIGN.md](EVAL_DESIGN.md)
**When to read:** Planning a new eval, improving eval quality, understanding the error-analysis-first approach

- Start with Error Analysis, Not Eval Writing
- Test Outputs, Not Internals
- Evals Are Experiments, Not Benchmarks
- When to Use Evals vs Traditional Tests
- The Minimum Viable Eval
- Build Reusable Components
- Scale Complexity Gradually
- The Eval-Driven Development Question
- Writing Unambiguous Tasks
- Build Balanced Problem Sets

### [GRADERS.md](GRADERS.md)
**When to read:** Choosing between code, model, or human grading; calibrating LLM judges

- Choosing the Right Grader Type
- Code-Based Graders (string matching, JSON validation, regex, unit tests, state verification)
- Model-Based Graders / LLM-as-Judge (binary vs Likert, calibration process)
- Human Graders (benevolent dictator model, inter-annotator agreement)
- Reducing Grader Flakiness
- Combining Graders
- Scoring Strategies (binary, partial credit, weighted threshold)

### [DATA_AND_DATASETS.md](DATA_AND_DATASETS.md)
**When to read:** Building datasets, generating synthetic data, using production data

- The Error Analysis First Principle
- Dataset Sizing (iteration vs analysis vs regression)
- Sourcing Test Cases (manual testing, production data, failure analysis)
- Synthetic Data Generation (dimension-based approach, cross-product vs direct)
- Building Balanced Datasets
- Avoiding Saturation
- Dataset Organization
- Working with Production Data (sampling strategies, converting traces)
- Domain Expert Involvement

### [AGENT_EVALS.md](AGENT_EVALS.md)
**When to read:** Evaluating coding agents, chatbots, research agents, computer use agents

- Agent Evals vs Single-Turn Evals
- Coding Agents (unit tests, fail-to-pass tests, static analysis)
- Conversational Agents (state verification, interaction quality, multi-turn, simulated users)
- Research Agents (groundedness, coverage, source quality, factual accuracy)
- Computer Use Agents (state verification, file system, screenshots)
- Handling Non-Determinism (pass@k, pass^k, pass rate)
- Environment Setup (isolation, reproducibility, resource constraints)

### [COMMON_PITFALLS.md](COMMON_PITFALLS.md)
**When to read:** Debugging flaky evals, avoiding anti-patterns, common mistakes

- The "Caveman Testing" Anti-Pattern
- Over-Engineering Eval Frameworks
- Testing Internals Instead of Outputs
- Trusting LLM Judges Blindly
- Not Looking at the Data
- Saturation: 100% Pass Rate
- Building Generic Evals
- Eval-Driven Development (Usually)
- Ignoring Grader Flakiness
- Not Reading Transcripts
- Building for Hypothetical Features

### [ezvals-docs/](ezvals-docs/)
**When to read:** EZVals API reference—decorators, scoring, CLI, web UI

- introduction.mdx - What is EZVals
- quickstart.mdx - Getting started
- decorators.mdx - The @eval decorator options
- eval-context.mdx - EvalContext API (input, output, reference, store())
- cases.mdx - Using cases for multiple test cases
- scoring.mdx - Scoring with assertions and ctx.store()
- evaluators.mdx - Post-processing evaluator functions
- file-defaults.mdx - ezvals_defaults for shared config
- patterns.mdx - Common eval patterns
- sessions.mdx - Organizing eval runs
- web-ui.mdx - Interactive results exploration
- cli.mdx - Command line interface
- http-api.mdx - Programmatic API access
- eval-result.mdx - EvalResult schema
- score.mdx - Score schema
- rag-agent.mdx - RAG agent example
- granular-evals.mdx - Breaking down complex evals

## Running Evals

```bash
# Run all evals in a directory
ezvals run evals/

# Run with visual output for debugging
ezvals run evals/ --visual

# Run specific eval file
ezvals run evals/my_agent_eval.py

# Start web UI for interactive exploration
ezvals serve evals/
```

## Key Principles

1. **Start with error analysis, not eval writing.** Look at actual failures before deciding what to test.
2. **Test outputs, not internals.** Don't check if the agent used tool X at step Y—check if it got the right answer.
3. **Evals are experiments, not benchmarks.** The goal is information about your system, not a score to optimize.
4. **Avoid saturation.** If you're passing 100% of evals, you need harder test cases.
5. **Read the transcripts.** You won't know if graders work until you manually verify results.

## Resources

- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Hamel Husain: LLM Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
- [EZVals GitHub](https://github.com/camronh/EZVals)
