from ezvals import EvalContext, eval

ezvals_defaults = {"labels": ["file"], "metadata": {"f": 1}}


@eval
def inherits_defaults(ctx: EvalContext):
    ctx.output = {"labels": ctx.labels, "metadata": ctx.metadata}


@eval(labels=["own"], metadata={"g": 2})
def overrides_defaults(ctx: EvalContext):
    ctx.output = {"labels": ctx.labels, "metadata": ctx.metadata}


@eval(dataset="math", labels=["base"], metadata={"m": 1}, cases=[
    {"id": "two", "input": [1, 1], "reference": 2, "labels": ["extra"]},
    {"input": [2, 2], "reference": 5, "dataset": "other", "metadata": {"n": 2}},
    {"input": [0, 0], "reference": 0, "labels": None},
])
def add(ctx: EvalContext):
    ctx.output = sum(ctx.input)
    assert ctx.output == ctx.reference, "sum mismatch"


def load_examples():
    return [{"input": "a"}, {"input": "b", "labels": ["l"]}]


@eval(input_loader=load_examples)
def loaded(ctx: EvalContext):
    ctx.output = ctx.input.upper()


def broken_loader():
    raise ValueError("no data")


@eval(input_loader=broken_loader)
def loader_fails(ctx: EvalContext):
    pass
