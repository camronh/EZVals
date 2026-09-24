import asyncio
import contextlib
import contextvars
import functools
import importlib.util
import inspect
import sys
import threading
import time
import traceback
import typing
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from ezvals.context import EvalContext, EvalResult, normalize_score

# Parameters that file defaults and individual cases can set.
PARAMS = {"input", "reference", "dataset", "labels", "metadata", "default_score_key", "timeout", "target", "evaluators"}
_UNSET = object()


class EvalFunction:
    def __init__(self, func: Callable, params: dict):
        self.func = func
        self.params = params
        self.ctx_param = next((name for name, hint in _hints(func).items() if _is_context(hint)), None)
        needs_ctx = {"target", "input_loader", "cases"} & params.keys()
        if needs_ctx and self.ctx_param is None:
            raise ValueError(f"{sorted(needs_ctx)[0]} requires the evaluation function to accept a context parameter")
        if "input_loader" in params and {"input", "reference", "cases"} & params.keys():
            raise ValueError("input_loader cannot be used with input=, reference= or cases=")
        functools.update_wrapper(self, func)

    def __call__(self):
        return _run_sync(self.call_async())

    async def call_async(self):
        results = [r for e in expand(self) for r in await e.run()]
        return results[0] if len(results) == 1 else results


def eval(func=None, *, input=_UNSET, reference=_UNSET, dataset=_UNSET, labels=_UNSET, metadata=_UNSET,
         default_score_key=_UNSET, timeout=_UNSET, target=_UNSET, evaluators=_UNSET, input_loader=_UNSET,
         cases=_UNSET):
    """Mark a function as an evaluation. Usable as @eval or @eval(...)."""
    params = {k: v for k, v in locals().items() if k != "func" and v is not _UNSET}
    if func is not None:
        return EvalFunction(func, params)
    return lambda f: EvalFunction(f, params)


@dataclass
class Eval:
    """One runnable evaluation: an EvalFunction resolved against file defaults and a single case."""
    id: str
    name: str
    func: Callable
    ctx_param: Optional[str]
    params: dict
    error: Optional[str] = None

    async def run(self, run_info: Optional[dict] = None) -> list:
        run_info = run_info or {}
        p = self.params
        if self.error:
            return [EvalResult(input=None, output=None, error=self.error)]
        ctx = EvalContext(input=p.get("input"), reference=p.get("reference"), metadata=p.get("metadata"),
                          default_score_key=p["default_score_key"], function_name=self.name,
                          dataset=p["dataset"], labels=p["labels"], **run_info) if self.ctx_param else None
        timeout = run_info.get("timeout") or p.get("timeout")
        start = time.perf_counter()
        try:
            returned = await asyncio.wait_for(self._call_with_target(ctx), timeout)
            if returned is None and ctx is not None:
                returned = ctx
            if isinstance(returned, EvalContext):
                returned = returned.build()
            if not isinstance(returned, (EvalResult, list)):
                raise ValueError("Evaluation function must return EvalResult, List[EvalResult], EvalContext, "
                                 f"or None (with a context parameter), got {type(returned).__name__}")
            results = returned if isinstance(returned, list) else [returned]
            for i in range(len(results)):
                for evaluator in p.get("evaluators") or []:
                    scored = await _call(evaluator, results[i])
                    if isinstance(scored, EvalResult):
                        results[i] = scored
                    elif scored is not None:
                        results[i].scores += [normalize_score(s, "pass") for s in (scored if isinstance(scored, list) else [scored])]
        except asyncio.TimeoutError:
            results = [_errored(ctx, f"TimeoutError: Evaluation timed out after {timeout}s")]
        except AssertionError as e:
            if ctx is None:
                results = [_errored(None, f"AssertionError: {e}\n{traceback.format_exc()}")]
            else:
                ctx.store(scores={"passed": False, "notes": str(e) or "Assertion failed"})
                results = [ctx.build()]
        except Exception as e:
            results = [_errored(ctx, f"{type(e).__name__}: {e}\n{traceback.format_exc()}")]
        for result in results:
            if not result.scores and not result.error:
                result.scores = [{"key": p["default_score_key"], "passed": True}]
            if result.latency is None:
                result.latency = (time.perf_counter() - start) / len(results)
        return results

    async def _call_with_target(self, ctx):
        if self.params.get("target"):
            out = await _call(self.params["target"], ctx)
            if isinstance(out, EvalResult):
                ctx.store(output=out.output, latency=out.latency, trace_data=out.trace_data, metadata=out.metadata)
            elif out is not None and not isinstance(out, EvalContext):
                ctx.store(output=out)
        return await _call(self.func, **({self.ctx_param: ctx} if self.ctx_param else {}))


def expand(fn: EvalFunction, file_defaults: Optional[dict] = None, file: Optional[str] = None) -> list:
    """Resolve an EvalFunction into runnable Evals: builtins < file defaults < decorator < each case."""
    file = file or inspect.getfile(fn.func)
    unknown = set(file_defaults or {}) - PARAMS
    if unknown:
        raise ValueError(f"Unknown keys in ezvals_defaults: {', '.join(sorted(unknown))}")
    builtins = {"dataset": Path(file).stem, "labels": [], "metadata": {}, "default_score_key": "pass"}
    base = _layer(_layer(builtins, file_defaults or {}, merge_labels=False),
                  {k: v for k, v in fn.params.items() if k in PARAMS}, merge_labels=False)
    name = fn.func.__name__

    def make(case_name, params, error=None):
        return Eval(f"{file}::{case_name}", case_name, fn.func, fn.ctx_param, params, error)

    if "input_loader" in fn.params:
        try:
            examples = _run_sync(_call(fn.params["input_loader"]))
        except Exception as e:
            return [make(name, base, f"input_loader failed: {e}\n{traceback.format_exc()}")]
        cases = [ex if isinstance(ex, dict) else {k: getattr(ex, k) for k in PARAMS if hasattr(ex, k)} for ex in examples]
    elif "cases" in fn.params:
        cases = fn.params["cases"]
    else:
        return [make(name, base)]

    evals = []
    for i, case in enumerate(cases):
        unknown = set(case) - PARAMS - {"id"}
        if unknown:
            raise ValueError(f"Unknown case keys: {', '.join(sorted(unknown))}")
        overrides = {k: v for k, v in case.items() if k != "id"}
        evals.append(make(f"{name}[{case.get('id', i)}]", _layer(base, overrides, merge_labels=True)))
    return evals


def discover(files: list) -> list:
    """Import eval files and return their Evals in source order."""
    evals = []
    for file in files:
        sys.path.insert(0, str(Path(file).resolve().parent))
        spec = importlib.util.spec_from_file_location(Path(file).stem, file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        found = [obj for obj in vars(module).values()
                 if isinstance(obj, EvalFunction) and obj.func.__module__ == module.__name__]
        for fn in sorted(found, key=lambda f: f.func.__code__.co_firstlineno):
            evals += expand(fn, getattr(module, "ezvals_defaults", None), file)
    return evals


def run_evals(evals: list, concurrency: int = 1, timeout: Optional[float] = None, dataset: Optional[str] = None,
              labels: Optional[list] = None, limit: Optional[int] = None) -> list:
    """Run eval functions and/or paths in-process and return their EvalResults (nothing is saved)."""
    resolved = []
    for item in evals:
        resolved += expand(item) if isinstance(item, EvalFunction) else discover(_eval_files(item))
    if dataset:
        resolved = [e for e in resolved if e.params["dataset"] in dataset.split(",")]
    if labels:
        resolved = [e for e in resolved if set(labels) & set(e.params["labels"])]
    semaphore = asyncio.Semaphore(concurrency)

    async def one(e):
        async with semaphore:
            return await e.run({"timeout": timeout})

    async def all_():
        return await asyncio.gather(*(one(e) for e in resolved[:limit]))

    return [r for results in _run_sync(all_()) for r in results]


def _eval_files(path: str) -> list:
    p = Path(path)
    if p.is_file():
        return [str(p)]
    return [str(f) for f in sorted(p.rglob("*.py"))
            if not f.name.startswith("_") and not any(part.startswith((".", "__")) for part in f.relative_to(p).parts)]


def _layer(base: dict, over: dict, merge_labels: bool) -> dict:
    """Overlay params. Metadata merges (None clears); case labels merge with base labels (None/[] clears)."""
    out = {**base, **over}
    if over.get("metadata") is not None:
        out["metadata"] = {**(base.get("metadata") or {}), **over["metadata"]}
    if merge_labels and "labels" in over:
        out["labels"] = base["labels"] + [l for l in over["labels"] or [] if l not in base["labels"]] if over["labels"] else []
    return out


def _errored(ctx: Optional[EvalContext], error: str) -> EvalResult:
    return ctx.build_with_error(error) if ctx else EvalResult(input=None, output=None, error=error)


async def _call(fn, *args, **kwargs):
    """Await async callables; run sync ones on a daemon thread so a timeout can abandon them."""
    if inspect.iscoroutinefunction(fn):
        return await fn(*args, **kwargs)
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    call = functools.partial(contextvars.copy_context().run, fn, *args, **kwargs)

    def settle(result=None, error=None):
        if not future.done():
            future.set_exception(error) if error else future.set_result(result)

    def target():
        try:
            outcome = (call(), None)
        except BaseException as e:
            outcome = (None, e)
        with contextlib.suppress(RuntimeError):  # the loop is gone if this call was abandoned after a timeout
            loop.call_soon_threadsafe(settle, *outcome)

    threading.Thread(target=target, daemon=True).start()
    return await future


def _run_sync(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _hints(func) -> dict:
    params = inspect.signature(func).parameters
    try:
        hints = typing.get_type_hints(func)
    except Exception:
        hints = {}
    return {name: hints.get(name, p.annotation) for name, p in params.items()}


def _is_context(hint) -> bool:
    if hint is EvalContext:
        return True
    if isinstance(hint, (str, typing.ForwardRef)):
        return str(getattr(hint, "__forward_arg__", hint)).split(".")[-1] == "EvalContext"
    return any(_is_context(arg) for arg in typing.get_args(hint))
