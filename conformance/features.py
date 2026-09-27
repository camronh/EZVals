import os

from ezvals import EvalContext, eval


def call_model(ctx: EvalContext):
    return os.environ.get("TARGET_OUTPUT", "a")


@eval(input="q", target=call_model)
def graded(ctx: EvalContext):
    assert ctx.output == os.environ.get("EXPECTED", "a"), "unexpected output"


@eval(trials=2)
def repeated(ctx: EvalContext):
    ctx.output = "same"


@eval(trials=2, cases=[{"id": "x", "input": 1}])
def repeated_case(ctx: EvalContext):
    ctx.output = ctx.input
