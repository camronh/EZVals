from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
import inspect

from ezvals.decorators import EvalFunction
from ezvals.context import EvalContext


@dataclass(frozen=True)
class CaseBlock:
    case_sets: List[Dict[str, Any]]
    case_ids: List[Optional[str]]


RESERVED_CASE_KEYS = {
    "input",
    "reference",
    "metadata",
    "dataset",
    "labels",
    "default_score_key",
    "timeout",
    "target",
    "evaluators",
}


def normalize_cases(cases: Any) -> Optional[CaseBlock]:
    if cases is None:
        return None

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
            unknown_list = ", ".join(sorted(unknown))
            raise ValueError(f"Unknown case keys: {unknown_list}")

        case_sets.append(case_dict)

    return CaseBlock(case_sets=case_sets, case_ids=case_ids)


def apply_cases(func: Callable, cases: Any) -> Callable:
    block = normalize_cases(cases)
    if block is None:
        return func
    func.__case_sets__ = block.case_sets
    func.__case_ids__ = block.case_ids
    return func


def _merge_metadata(base: Optional[Dict[str, Any]], override: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if override is None:
        return None
    merged: Dict[str, Any] = {}
    if base:
        merged.update(base)
    if override:
        merged.update(override)
    return merged or None


def _merge_labels(base: List[str], override: Optional[List[str]]) -> List[str]:
    if override is None:
        return []
    return base + [l for l in override if l not in base]


def generate_eval_functions(func: Callable) -> List[EvalFunction]:
    """Generate individual EvalFunction instances for each case."""
    if isinstance(func, EvalFunction):
        eval_settings = func
        base_func = func.func
    else:
        eval_settings = None
        base_func = func

    case_sets = None
    case_ids = None
    if hasattr(base_func, '__case_sets__'):
        case_sets = base_func.__case_sets__
        case_ids = base_func.__case_ids__
    elif hasattr(func, '__case_sets__'):
        case_sets = func.__case_sets__
        case_ids = func.__case_ids__

    if case_sets is None:
        raise ValueError(f"Function {base_func.__name__} does not have __case_sets__ attribute")

    if eval_settings is not None:
        has_context = eval_settings.context_param is not None
    else:
        sig = inspect.signature(base_func)
        has_context = any(p.annotation is EvalContext for p in sig.parameters.values())
    is_async = inspect.iscoroutinefunction(base_func)

    functions = []
    for idx, case in enumerate(case_sets):
        test_id = case_ids[idx] if case_ids and idx < len(case_ids) else None
        func_name = f"{base_func.__name__}[{test_id or idx}]"

        if has_context:
            if is_async:
                async def wrapper(ctx: EvalContext, **kwargs):
                    return await base_func(ctx, **kwargs)
            else:
                def wrapper(ctx: EvalContext, **kwargs):
                    return base_func(ctx, **kwargs)
        else:
            if is_async:
                async def wrapper(*args, **kwargs):
                    return await base_func(*args, **kwargs)
            else:
                def wrapper(*args, **kwargs):
                    return base_func(*args, **kwargs)
        wrapper.__name__ = wrapper.__qualname__ = func_name

        base_dataset = eval_settings.dataset if eval_settings else None
        base_labels = list(eval_settings.labels or []) if eval_settings else []
        base_target = eval_settings.target if eval_settings else None
        base_evaluators = eval_settings.evaluators if eval_settings else None
        base_timeout = eval_settings.timeout if eval_settings else None
        base_input = eval_settings.context_kwargs.get('input') if eval_settings else None
        base_reference = eval_settings.context_kwargs.get('reference') if eval_settings else None
        base_default_score_key = eval_settings.context_kwargs.get('default_score_key') if eval_settings else None
        base_metadata = eval_settings.context_kwargs.get('metadata') if eval_settings else None

        dataset = case.get('dataset') if 'dataset' in case else base_dataset

        if 'labels' in case:
            case_labels = case.get('labels')
            if case_labels is None or case_labels == []:
                labels = []
            else:
                labels = _merge_labels(base_labels, list(case_labels))
        else:
            labels = base_labels

        if 'metadata' in case:
            metadata = _merge_metadata(base_metadata, case.get('metadata'))
        else:
            metadata = base_metadata

        input_value = case.get('input') if 'input' in case else base_input
        reference_value = case.get('reference') if 'reference' in case else base_reference
        default_score_key = case.get('default_score_key') if 'default_score_key' in case else base_default_score_key
        timeout = case.get('timeout') if 'timeout' in case else base_timeout
        target = case.get('target') if 'target' in case else base_target

        if 'evaluators' in case:
            case_evaluators = case.get('evaluators')
            evaluators = [] if case_evaluators is None else case_evaluators
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

        if eval_settings:
            eval_func._provided_labels = getattr(eval_settings, '_provided_labels', None)
            eval_func._provided_evaluators = getattr(eval_settings, '_provided_evaluators', None)

        if 'labels' in case:
            eval_func._provided_labels = []
        if 'evaluators' in case:
            eval_func._provided_evaluators = []

        functions.append(eval_func)

    return functions
