from typing import Any, Callable, TypedDict

from ezvals.cli import run
from ezvals.context import EvalContext, EvalResult, TraceData
from ezvals.evals import eval, run_evals


class EvalCase(TypedDict, total=False):
    """An item of @eval(cases=[...]). Fields override the decorator's values for that case."""
    id: str
    input: Any
    reference: Any
    metadata: dict
    dataset: str
    labels: list
    default_score_key: str
    timeout: float
    target: Callable
    evaluators: list


__all__ = ["eval", "EvalContext", "EvalResult", "TraceData", "EvalCase", "run_evals", "run"]
