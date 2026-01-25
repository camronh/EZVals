"""Type definitions for ezvals."""

from typing import Any, Callable, Dict, List

try:
    from typing import TypedDict
except ImportError:
    from typing_extensions import TypedDict


class EvalCase(TypedDict, total=False):
    """Schema for items in the @eval(cases=[...]) array.

    All fields are optional. Most fields match the @eval decorator parameters
    and override the decorator-level values for that specific case.
    """

    # Case-specific field (not available on decorator)
    id: str  # Test case identifier, used in function name: func[id]

    # Fields matching @eval decorator params (override per-case)
    input: Any
    reference: Any
    metadata: Dict[str, Any]
    dataset: str
    labels: List[str]
    default_score_key: str
    timeout: float
    target: Callable
    evaluators: List[Callable]
