from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple, get_type_hints
import inspect

from ezvals.decorators import EvalFunction
from ezvals.context import EvalContext
from ezvals.types import EvalCase

# Derive allowed case keys from EvalCase TypedDict (excludes 'id' which is handled separately)
RESERVED_CASE_KEYS = set(get_type_hints(EvalCase).keys()) - {"id"}


def _normalize_cases(cases: List[EvalCase]) -> Tuple[List[Dict[str, Any]], List[Optional[str]]]:
    if not isinstance(cases, (list, tuple)):
        raise ValueError("cases must be a list of dicts")

    case_sets: List[Dict[str, Any]] = []
    case_ids: List[Optional[str]] = []

    for idx, case in enumerate(cases):
        if not isinstance(case, dict):
            raise ValueError(f"Case {idx} must be a dict")

        case_dict = dict(case)
        case_id = case_dict.pop("id", None)
        case_ids.append(None if case_id is None else str(case_id))

        unknown = set(case_dict.keys()) - RESERVED_CASE_KEYS
        if unknown:
            raise ValueError(f"Unknown case keys: {', '.join(sorted(unknown))}")

        case_sets.append(case_dict)

    return case_sets, case_ids


def apply_cases(func: Callable, cases: List[EvalCase]) -> Callable:
    if cases is None:
        return func
    case_sets, case_ids = _normalize_cases(cases)
    func.__case_sets__ = case_sets
    func.__case_ids__ = case_ids
    return func


def generate_eval_functions(func: Callable) -> List[EvalFunction]:
    """Generate individual EvalFunction instances for each case."""
    if isinstance(func, EvalFunction):
        eval_settings = func
        base_func = func.func
    else:
        eval_settings = None
        base_func = func

    if not hasattr(base_func, '__case_sets__'):
        raise ValueError(f"Function {base_func.__name__} does not have __case_sets__ attribute")

    case_sets = base_func.__case_sets__
    case_ids = base_func.__case_ids__
    is_async = inspect.iscoroutinefunction(base_func)

    # Extract base values from eval_settings once
    if eval_settings:
        base_dataset = eval_settings.dataset
        base_labels = list(eval_settings.labels or [])
        base_target = eval_settings.target
        base_evaluators = eval_settings.evaluators
        base_timeout = eval_settings.timeout
        base_input = eval_settings.context_kwargs.get('input')
        base_reference = eval_settings.context_kwargs.get('reference')
        base_default_score_key = eval_settings.context_kwargs.get('default_score_key')
        base_metadata = eval_settings.context_kwargs.get('metadata')
    else:
        base_dataset = base_labels = base_target = base_evaluators = None
        base_timeout = base_input = base_reference = base_default_score_key = base_metadata = None
        base_labels = []

    functions = []
    for idx, case in enumerate(case_sets):
        test_id = case_ids[idx] if case_ids else None
        func_name = f"{base_func.__name__}[{test_id or idx}]"

        if is_async:
            async def wrapper(ctx: EvalContext, _bf=base_func, **kwargs):
                return await _bf(ctx, **kwargs)
        else:
            def wrapper(ctx: EvalContext, _bf=base_func, **kwargs):
                return _bf(ctx, **kwargs)
        wrapper.__name__ = wrapper.__qualname__ = func_name

        # Resolve per-case overrides (explicit key present means override, even if None)
        dataset = case['dataset'] if 'dataset' in case else base_dataset
        input_value = case['input'] if 'input' in case else base_input
        reference_value = case['reference'] if 'reference' in case else base_reference
        default_score_key = case['default_score_key'] if 'default_score_key' in case else base_default_score_key
        timeout = case['timeout'] if 'timeout' in case else base_timeout
        target = case['target'] if 'target' in case else base_target

        # Labels: merge base + case (avoiding duplicates), or clear if explicitly None/[]
        if 'labels' in case:
            case_labels = case['labels']
            if not case_labels:
                labels = []
            else:
                labels = base_labels + [l for l in case_labels if l not in base_labels]
        else:
            labels = base_labels

        # Metadata: merge base + case, or clear if explicitly None
        if 'metadata' in case:
            case_metadata = case['metadata']
            if case_metadata is None:
                metadata = None
            else:
                metadata = {**(base_metadata or {}), **case_metadata} or None
        else:
            metadata = base_metadata

        # Evaluators: override or clear if explicitly set
        if 'evaluators' in case:
            evaluators = case['evaluators'] or []
        else:
            evaluators = base_evaluators

        eval_func = EvalFunction(
            func=wrapper,
            dataset=dataset,
            labels=labels,
            evaluators=evaluators,
            target=target,
            input=input_value,
            reference=reference_value,
            default_score_key=default_score_key,
            metadata=metadata,
            timeout=timeout,
        )

        # EvalFunction infers dataset from func name when passed None. If the case
        # explicitly sets dataset (even to None), override the inferred value.
        if 'dataset' in case:
            eval_func.dataset = dataset

        if eval_settings:
            eval_func._provided_labels = getattr(eval_settings, '_provided_labels', None)
            eval_func._provided_evaluators = getattr(eval_settings, '_provided_evaluators', None)

        # When a case explicitly sets labels/evaluators, mark them as "provided" (even as empty)
        # to prevent file defaults from being re-applied during discovery.
        if 'labels' in case:
            eval_func._provided_labels = []
        if 'evaluators' in case:
            eval_func._provided_evaluators = []

        functions.append(eval_func)

    return functions
