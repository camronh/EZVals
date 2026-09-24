import time

from ezvals import EvalContext, EvalResult, eval


@eval(input="hi")
def passes(ctx: EvalContext):
    ctx.output = "hello"


@eval(input="x")
def assertion_fails(ctx: EvalContext):
    ctx.output = "y"
    assert ctx.output == ctx.input, "wrong output"


@eval
def raises(ctx: EvalContext):
    ctx.output = "partial"
    raise ValueError("broke")


@eval
def stores_scores(ctx: EvalContext):
    ctx.store(scores=True)
    ctx.store(scores={"key": "format", "passed": False})
    ctx.store(scores=[{"key": "quality", "value": 0.5}, {"key": "format", "passed": True, "notes": "fixed"}])


@eval(default_score_key="overall")
def custom_score_key(ctx: EvalContext):
    ctx.store(output=1, scores=0.9)


@eval(metadata={"a": 1})
def metadata_and_trace(ctx: EvalContext):
    ctx.store(metadata={"b": 2}, messages=[{"role": "user", "content": "hi"}], trace_url="https://trace", trace_data={"tokens": 3})


@eval(labels=["x"])
def run_info(ctx: EvalContext):
    ctx.output = {"function": ctx.function_name, "dataset": ctx.dataset, "labels": ctx.labels, "run_name": ctx.run_name, "config": ctx.config}


@eval
def returns_results():
    return [EvalResult(input=1, output=2), EvalResult(input=3, output=4, scores={"key": "custom", "passed": False})]


@eval(timeout=0.2)
def times_out(ctx: EvalContext):
    ctx.output = "started"
    time.sleep(5)


def call_agent(ctx: EvalContext):
    return "from target"


@eval(target=call_agent)
def uses_target(ctx: EvalContext):
    assert ctx.output == "from target", "target output missing"


def length_check(result: EvalResult):
    return {"key": "long", "passed": len(result.output) > 3}


@eval(evaluators=[length_check])
def uses_evaluator(ctx: EvalContext):
    ctx.output = "ok"
