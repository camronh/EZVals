from ezvals import eval, EvalResult, EvalContext

def custom_evaluator(result: EvalResult):
    """Custom evaluator to check if the reference output is in the output"""
    if result.reference in result.output.lower():
        return {"key": "correctness", "passed": True}
    else:
        return {"key": "correctness", "passed": False, "notes": f"Expected reference '{result.reference}' not found in output"}


# Example 1: Simple cases with multiple test cases
@eval(
    dataset="sentiment_analysis",
    evaluators=[custom_evaluator],
    cases=[
        {"input": "I love this product!", "reference": "positive"},
        {"input": "This is terrible", "reference": "negative"},
        {"input": "It's okay I guess", "reference": "neutral"},
        {"input": "Amazing experience, highly recommend!", "reference": "positive"},
        {"input": "Waste of money", "reference": "negative"},
    ],
)
def test_sentiment_classification(ctx: EvalContext):
    """Test sentiment analysis with case inputs"""
    print(f"Analyzing: {ctx.input}")

    # Simulate sentiment analysis
    sentiment_map = {
        "love": "positive",
        "amazing": "positive",
        "recommend": "positive",
        "terrible": "negative",
        "waste": "negative",
        "okay": "neutral"
    }

    # Simple mock sentiment detection
    detected = "neutral"
    text_lower = ctx.input.lower()
    for keyword, sentiment in sentiment_map.items():
        if keyword in text_lower:
            detected = sentiment
            break

    ctx.store(
        output=detected,
        scores=detected == ctx.reference,
        trace_data={"features": {"contains_love": "love" in text_lower, "length": len(ctx.input)}}
    )


# Example 2: Cases with dictionaries for complex inputs
@eval(
    dataset="math_operations",
    labels=["unit_test"],
    cases=[
        {"input": {"operation": "add", "a": 2, "b": 3}, "reference": 5},
        {"input": {"operation": "multiply", "a": 4, "b": 7}, "reference": 28},
        {"input": {"operation": "subtract", "a": 10, "b": 3}, "reference": 7},
        {"input": {"operation": "divide", "a": 15, "b": 3}, "reference": 5},
    ],
)
def test_calculator(ctx: EvalContext):
    """Test calculator operations with different inputs"""
    operation = ctx.input["operation"]
    a = ctx.input["a"]
    b = ctx.input["b"]

    # Simulate calculator
    operations = {
        "add": lambda x, y: x + y,
        "multiply": lambda x, y: x * y,
        "subtract": lambda x, y: x - y,
        "divide": lambda x, y: x / y if y != 0 else None
    }

    result = operations.get(operation, lambda x, y: None)(a, b)

    ctx.store(
        output=result,
        scores=result == ctx.reference,
        trace_data={
            "op": operation,
            "args": [a, b],
            "intermediate": {"is_div_by_zero": operation == "divide" and b == 0},
        }
    )

# Example 3: Parametrize + target hook (targets see param data in ctx.input/ctx.metadata)
def target_run_agent(ctx: EvalContext):
    ctx.trace_id = f"trace::{ctx.input['prompt']}"
    ctx.store(
        output=f"agent says: {ctx.input['prompt']}",
        metadata={"trace_id": ctx.trace_id}
    )


@eval(
    dataset="agent_calls",
    target=target_run_agent,
    cases=[
        {"input": {"prompt": "hello"}, "reference": "hello"},
        {"input": {"prompt": "status update"}, "reference": "status"},
    ],
)
def test_agent_target(ctx: EvalContext):
    """Target runs before eval, using case input"""
    assert ctx.reference in ctx.output
    # ctx.metadata includes param data + target metadata
    assert ctx.metadata["trace_id"].startswith("trace::")
    return ctx.build()


# Example 4: Cases with test IDs for better reporting
@eval(
    dataset="qa_system",
    cases=[
        {
            "id": "geography",
            "input": {"question": "What is the capital of France?", "context": "France is a country in Europe."},
            "reference": "Paris",
        },
        {
            "id": "literature",
            "input": {"question": "Who wrote Romeo and Juliet?", "context": "Shakespeare was an English playwright."},
            "reference": "Shakespeare",
        },
        {
            "id": "math",
            "input": {"question": "What is 2+2?", "context": "Basic arithmetic."},
            "reference": "4",
        },
    ],
)
def test_qa_with_ids(ctx: EvalContext):
    """Test Q&A system with named test cases"""
    question = ctx.input["question"]
    context = ctx.input["context"]

    # Simulate Q&A system
    simple_answers = {
        "capital of France": "Paris",
        "Romeo and Juliet": "Shakespeare",
        "2+2": "4"
    }

    answer = "I don't know"
    matched_key = None
    for key, value in simple_answers.items():
        if key in question:
            answer = value
            matched_key = key
            break

    ctx.store(
        output=answer,
        scores=[
            {"passed": answer == ctx.reference},
            {"passed": answer != "I don't know", "key": "relevance"}
        ],
        metadata={"model": "mock_qa_v1"},
        trace_data={"retrieval": {"top_keys": list(simple_answers.keys()), "matched": matched_key}}
    )


# Example 5: Multiple cases (explicit grid)
# Also async for good measure
MODEL_CASES = [
    {"input": {"model": m, "temperature": t}}
    for m in ["gpt-3.5", "gpt-4", "claude"]
    for t in [0.0, 0.5, 1.0]
]

@eval(dataset="model_comparison", cases=MODEL_CASES)
async def test_model_temperatures(ctx: EvalContext):
    """Test different models at different temperatures"""
    model = ctx.input["model"]
    temperature = ctx.input["temperature"]

    # Simulate model behavior at different temperatures
    # Higher temperature = more creative/random
    creativity_score = temperature * 0.8 + (0.2 if "gpt-4" in model else 0.1)

    ctx.store(
        output=f"Response from {model} at temp {temperature}",
        scores={"value": min(creativity_score, 1.0), "key": "quality"},
        metadata={"model": model, "temperature": temperature},
        trace_url="https://ezvals.com",
        trace_data={
            "sampling": {"top_p": 0.95, "temperature": temperature},
            "env": {"model": model},
        }
    )
