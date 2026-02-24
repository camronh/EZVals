import asyncio
import json
import csv
import io
import traceback
from contextlib import redirect_stdout, nullcontext
from pathlib import Path
from threading import Thread
from typing import Any, Dict, List, Optional, Union, Callable, TypedDict

from ezvals.config import load_config, DEFAULT_CONFIG, resolve_run_config, resolve_sessions_dir
from ezvals.decorators import EvalFunction, run_metadata_var
from ezvals.discovery import EvalDiscovery
from ezvals.schemas import EvalResult


def _run_async_with_loop_handling(coro_fn):
    """Run an async function, handling existing event loops by running in a new thread."""
    try:
        asyncio.get_running_loop()
        in_loop = True
    except RuntimeError:
        in_loop = False

    if not in_loop:
        return asyncio.run(coro_fn())

    result_holder, error_holder = {}, {}
    def _runner():
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result_holder["res"] = loop.run_until_complete(coro_fn())
        except BaseException as e:
            error_holder["err"] = e
        finally:
            loop.close()

    t = Thread(target=_runner, daemon=True)
    t.start()
    t.join()
    if "err" in error_holder:
        raise error_holder["err"]
    return result_holder.get("res")


class RunResult(TypedDict):
    summary: Dict[str, Any]
    saved_path: Optional[str]
    run_id: str
    session_name: str
    run_name: Optional[str]


class EvalRunner:
    def __init__(self, concurrency: int = 1, verbose: bool = False, timeout: Optional[float] = None):
        if concurrency < 1:
            raise ValueError(f"concurrency must be at least 1, got {concurrency}")
        self.concurrency = concurrency  # 1 means sequential, >1 means parallel
        self.verbose = verbose
        self.timeout = timeout
        self.results: List[Dict] = []

    def _map_example_to_context(self, example) -> Dict[str, Any]:
        """Map a loader example (dict or object) to EvalContext fields."""
        result = {}
        keys = ('input', 'reference', 'metadata', 'dataset', 'labels')

        if isinstance(example, dict):
            for key in keys:
                if key in example:
                    result[key] = example[key]
        else:
            for key in keys:
                if hasattr(example, key):
                    result[key] = getattr(example, key)

        return result

    def _create_expanded_eval_func(self, template: EvalFunction, context_kwargs: Dict, idx: int) -> EvalFunction:
        """Create a new EvalFunction with context from loader example."""
        from ezvals.context import EvalContext
        func_name = f"{template.func.__name__}[{idx}]"

        if template.is_async:
            async def wrapper(ctx: EvalContext):
                return await template.func(ctx)
        else:
            def wrapper(ctx: EvalContext):
                return template.func(ctx)

        wrapper.__name__ = wrapper.__qualname__ = func_name

        # Dataset: per-case overrides template
        dataset = context_kwargs.get('dataset') or template.dataset
        # Labels: merge template + per-case (avoid duplicates)
        base_labels = list(template.labels or [])
        per_case_labels = context_kwargs.get('labels') or []
        labels = base_labels + [l for l in per_case_labels if l not in base_labels] or None

        return EvalFunction(
            func=wrapper,
            dataset=dataset,
            labels=labels,
            evaluators=template.evaluators,
            target=template.target,
            input=context_kwargs.get('input'),
            reference=context_kwargs.get('reference'),
            default_score_key=template.context_kwargs.get('default_score_key'),
            metadata=context_kwargs.get('metadata') or template.context_kwargs.get('metadata'),
            timeout=template.timeout,
        )

    async def _expand_with_loader(self, func: EvalFunction) -> List[EvalFunction]:
        """Call input_loader and create expanded EvalFunctions for each example."""
        loader = func.input_loader

        if asyncio.iscoroutinefunction(loader):
            examples = await loader()
        else:
            examples = loader()

        if not examples:
            return []

        expanded = []
        original_id = id(func)
        for idx, example in enumerate(examples):
            context_kwargs = self._map_example_to_context(example)
            expanded_func = self._create_expanded_eval_func(func, context_kwargs, idx)
            expanded_func.original_id = original_id  # Track original for callbacks
            expanded.append(expanded_func)

        return expanded

    def _ensure_default_score(self, result: EvalResult) -> EvalResult:
        """Add default passing score if result has no scores and no error"""
        if not result.scores and not result.error:
            # Create a new result with default passing score
            result_dict = result.model_dump()
            result_dict['scores'] = [{"key": "pass", "passed": True}]
            return EvalResult(**result_dict)
        return result

    def _wrap_results(self, result, func: EvalFunction) -> List[EvalResult]:
        """Convert result to list of EvalResults with default scores."""
        results = [result] if isinstance(result, EvalResult) else result
        return [self._ensure_default_score(r) for r in results]

    def _make_error_result(self, func: EvalFunction, e: Exception) -> List[EvalResult]:
        """Create error result from exception."""
        return [EvalResult(
            input=None, output=None,
            error=f"Error running {func.func.__name__}: {e}\n{traceback.format_exc()}"
        )]

    def _make_loader_error_result_dict(self, func: EvalFunction, e: Exception) -> Dict[str, Any]:
        return {
            "function": func.func.__name__,
            "dataset": func.dataset,
            "labels": func.labels,
            "result": EvalResult(
                input=None,
                output=None,
                error=f"input_loader failed: {e}\n{traceback.format_exc()}",
            ).model_dump(),
        }

    def _to_result_dict(self, func: EvalFunction, result: EvalResult) -> Dict[str, Any]:
        return {
            "function": func.func.__name__,
            "dataset": func.dataset,
            "labels": func.labels,
            "result": result.model_dump(),
        }

    async def _run_single_eval(
        self,
        func: EvalFunction,
        on_start: Optional[Callable[[EvalFunction], None]],
        on_complete: Optional[Callable[[EvalFunction, Dict], None]],
        is_cancelled: Callable[[], bool],
        run_sync_in_thread: bool,
    ) -> List[Dict[str, Any]]:
        if self.timeout is not None:
            func.timeout = self.timeout

        if on_start:
            on_start(func)

        if is_cancelled():
            return []

        if func.is_async:
            results = await self.run_async_eval(func)
        elif run_sync_in_thread:
            results = await asyncio.to_thread(self.run_sync_eval, func)
        else:
            results = self.run_sync_eval(func)

        if is_cancelled():
            return []

        completed: List[Dict[str, Any]] = []
        for result in results:
            if is_cancelled():
                break
            result_dict = self._to_result_dict(func, result)
            completed.append(result_dict)
            if on_complete and not is_cancelled():
                on_complete(func, result_dict)
        return completed

    async def run_async_eval(self, func: EvalFunction) -> List[EvalResult]:
        # Capture stdout when not in verbose mode and running sequentially (concurrency == 1)
        # Note: redirect_stdout doesn't work reliably with concurrent execution (>1)
        should_capture = not self.verbose and self.concurrency == 1
        stdout_capture = io.StringIO() if should_capture else None
        try:
            with redirect_stdout(stdout_capture) if stdout_capture else nullcontext():
                result = await func.call_async()
            return self._wrap_results(result, func)
        except Exception as e:
            return self._make_error_result(func, e)

    def run_sync_eval(self, func: EvalFunction) -> List[EvalResult]:
        # Capture stdout when not in verbose mode and running sequentially (concurrency == 1)
        should_capture = not self.verbose and self.concurrency == 1
        stdout_capture = io.StringIO() if should_capture else None
        try:
            with redirect_stdout(stdout_capture) if stdout_capture else nullcontext():
                result = func()
            return self._wrap_results(result, func)
        except Exception as e:
            return self._make_error_result(func, e)
    
    async def run_all_async(
        self,
        functions: List[EvalFunction],
        on_start: Optional[Callable[[EvalFunction], None]] = None,
        on_complete: Optional[Callable[[EvalFunction, Dict], None]] = None,
        cancel_event: Optional[object] = None,
        pause_event: Optional[object] = None,
    ) -> List[Dict]:
        all_results = []
        is_cancelled = cancel_event.is_set if cancel_event else (lambda: False)
        is_paused = pause_event.is_set if pause_event else (lambda: False)

        async def wait_while_paused():
            while is_paused() and not is_cancelled():
                await asyncio.sleep(0.05)

        async def run_single(
            func: EvalFunction,
            semaphore: Optional[asyncio.Semaphore],
            run_sync_in_thread: bool,
        ) -> List[Dict[str, Any]]:
            await wait_while_paused()
            if is_cancelled():
                return []

            if func.input_loader:
                try:
                    eval_funcs = await self._expand_with_loader(func)
                except Exception as e:
                    return [self._make_loader_error_result_dict(func, e)]
            else:
                eval_funcs = [func]

            completed: List[Dict[str, Any]] = []
            for eval_func in eval_funcs:
                await wait_while_paused()
                if is_cancelled():
                    break

                if semaphore:
                    async with semaphore:
                        if is_cancelled():
                            break
                        completed.extend(
                            await self._run_single_eval(
                                eval_func,
                                on_start=on_start,
                                on_complete=on_complete,
                                is_cancelled=is_cancelled,
                                run_sync_in_thread=run_sync_in_thread,
                            )
                        )
                else:
                    completed.extend(
                        await self._run_single_eval(
                            eval_func,
                            on_start=on_start,
                            on_complete=on_complete,
                            is_cancelled=is_cancelled,
                            run_sync_in_thread=run_sync_in_thread,
                        )
                    )
            return completed

        if self.concurrency == 1:
            for func in functions:
                all_results.extend(await run_single(func, semaphore=None, run_sync_in_thread=False))
                if is_cancelled():
                    break
        else:
            semaphore = asyncio.Semaphore(self.concurrency)

            tasks = []
            func_iter = iter(functions)

            def launch_next():
                if is_cancelled():
                    return False
                try:
                    func = next(func_iter)
                except StopIteration:
                    return False
                tasks.append(asyncio.create_task(run_single(func, semaphore=semaphore, run_sync_in_thread=True)))
                return True

            for _ in range(self.concurrency):
                await wait_while_paused()
                if not launch_next():
                    break

            while tasks:
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for d in done:
                    try:
                        results = d.result()
                    except asyncio.CancelledError:
                        results = []
                    if is_cancelled():
                        continue
                    for result_dict in results or []:
                        all_results.append(result_dict)
                if is_cancelled():
                    for t in pending:
                        t.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)
                    break
                tasks = list(pending)
                while len(tasks) < self.concurrency:
                    await wait_while_paused()
                    if not launch_next():
                        break

        return all_results
    
    def run(
        self,
        path: str,
        dataset: Optional[str] = None,
        labels: Optional[List[str]] = None,
        function_name: Optional[str] = None,
        function_names: Optional[List[str]] = None,
        output_file: Optional[str] = None,
        csv_file: Optional[str] = None,
        verbose: bool = False,
        on_start: Optional[Callable[[EvalFunction], None]] = None,
        on_complete: Optional[Callable[[EvalFunction, Dict], None]] = None,
        limit: Optional[int] = None,
        cancel_event: Optional[object] = None,
    ) -> Dict:
        # Discover functions
        discovery = EvalDiscovery()
        functions = discovery.discover(
            path=path,
            dataset=dataset,
            labels=labels,
            function_name=function_name,
            function_names=function_names,
        )

        if limit is not None:
            functions = functions[:limit]
        
        if not functions:
            return {
                "total_evaluations": 0,
                "total_functions": 0,
                "results": []
            }
        
        all_results = _run_async_with_loop_handling(
            lambda: self.run_all_async(functions, on_start=on_start, on_complete=on_complete, cancel_event=cancel_event)
        )
        
        # Calculate summary statistics
        summary = self._calculate_summary(all_results)
        
        # Save to file if requested
        if output_file:
            self._save_results(summary, output_file)
        if csv_file:
            self._save_results_csv(summary, csv_file)
        
        return summary
    
    @staticmethod
    def _calculate_summary(results: List[Dict]) -> Dict:
        total_results = len(results)
        total_errors = sum(1 for r in results if r["result"].get("error"))
        total_passed = 0
        total_with_scores = 0
        avg_latency = 0
        
        latencies = []
        for r in results:
            result = r["result"]
            if result.get("latency"):
                latencies.append(result["latency"])
            
            if result.get("scores"):
                total_with_scores += 1
                for score in result["scores"]:
                    if score.get("passed") is True:
                        total_passed += 1
                        break
        
        if latencies:
            avg_latency = sum(latencies) / len(latencies)
        
        # Get unique functions
        unique_functions = len(set(r["function"] for r in results))
        
        return {
            "total_evaluations": total_results,
            "total_functions": unique_functions,
            "total_errors": total_errors,
            "total_passed": total_passed,
            "total_with_scores": total_with_scores,
            "average_latency": avg_latency,
            "results": results
        }
    
    def _save_results(self, summary: Dict, output_file: str):
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(summary, f, indent=2, default=str)

    def _save_results_csv(self, summary: Dict, csv_file: str):
        csv_path = Path(csv_file)
        csv_path.parent.mkdir(parents=True, exist_ok=True)

        fieldnames = [
            "function",
            "dataset",
            "labels",
            "input",
            "output",
            "reference",
            "scores",
            "error",
            "latency",
            "metadata",
        ]

        with open(csv_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for r in summary.get("results", []):
                result = r["result"]
                writer.writerow({
                    "function": r.get("function"),
                    "dataset": r.get("dataset"),
                    "labels": ";".join(r.get("labels") or []),
                    "input": json.dumps(result.get("input")),
                    "output": json.dumps(result.get("output")),
                    "reference": json.dumps(result.get("reference")),
                    "scores": json.dumps(result.get("scores")),
                    "error": result.get("error"),
                    "latency": result.get("latency"),
                    "metadata": json.dumps(result.get("metadata")),
                })


def run_evals(
    evals: List[Union[EvalFunction, str]],
    concurrency: int = 1,
    verbose: bool = False,
    timeout: Optional[float] = None,
    dataset: Optional[str] = None,
    labels: Optional[List[str]] = None,
    limit: Optional[int] = None,
) -> List[EvalResult]:
    """Run evals programmatically. Accepts a list of eval functions and/or paths."""
    from .cases import generate_eval_functions

    functions: List[EvalFunction] = []
    for item in evals:
        if isinstance(item, EvalFunction):
            if hasattr(item.func, '__case_sets__'):
                functions.extend(generate_eval_functions(item))
            else:
                functions.append(item)
        elif isinstance(item, str):
            functions.extend(EvalDiscovery().discover(item, dataset, labels))

    if limit is not None:
        functions = functions[:limit]
    if not functions:
        return []

    runner = EvalRunner(concurrency=concurrency, verbose=verbose, timeout=timeout)
    raw_results = _run_async_with_loop_handling(lambda: runner.run_all_async(functions))
    return [EvalResult(**r["result"]) for r in raw_results]


def run(
    path: str,
    dataset: Optional[str] = None,
    labels: Optional[List[str]] = None,
    function_name: Optional[str] = None,
    function_names: Optional[List[str]] = None,
    limit: Optional[int] = None,
    output: Optional[str] = None,
    concurrency: Optional[int] = None,
    timeout: Optional[float] = None,
    verbose: bool = False,
    session: Optional[str] = None,
    run_name: Optional[str] = None,
    no_save: bool = False,
    results_dir: Optional[str] = None,
    overwrite: Optional[bool] = None,
    use_config: bool = False,
    config_name: Optional[str] = None,
    on_start: Optional[Callable[[EvalFunction], None]] = None,
    on_complete: Optional[Callable[[EvalFunction, Dict], None]] = None,
) -> RunResult:
    """Programmatic equivalent of `ezvals run`."""
    from ezvals.storage import ResultsStore

    config = load_config() if use_config else DEFAULT_CONFIG.copy()
    effective_concurrency = concurrency if concurrency is not None else config.get("concurrency", 1)
    effective_timeout = timeout if timeout is not None else config.get("timeout")
    effective_results_dir = results_dir if results_dir is not None else resolve_sessions_dir(config)
    effective_overwrite = overwrite if overwrite is not None else config.get("overwrite", True)

    selectors: List[str] = []
    resolved_path = path
    if "::" in resolved_path:
        resolved_path, path_selector = resolved_path.rsplit("::", 1)
        selectors.extend(name.strip() for name in path_selector.split(",") if name.strip())

    if function_name:
        selectors.extend(name.strip() for name in function_name.split(",") if name.strip())
    if function_names:
        selectors.extend(name.strip() for name in function_names if name and name.strip())

    path_obj = Path(resolved_path)
    if not path_obj.exists():
        raise ValueError(f"Path {resolved_path} does not exist")

    runner = EvalRunner(concurrency=effective_concurrency, verbose=verbose, timeout=effective_timeout)
    store = ResultsStore(effective_results_dir)
    run_id = store.generate_run_id()
    session_name = session if session else "default"

    run_config = resolve_run_config(config_name)

    token = run_metadata_var.set(
        {
            "run_id": run_id,
            "session_name": session_name,
            "run_name": run_name,
            "eval_path": resolved_path,
            "config": run_config,
        }
    )
    try:
        summary = runner.run(
            path=resolved_path,
            dataset=dataset,
            labels=labels,
            function_names=selectors or None,
            on_start=on_start,
            on_complete=on_complete,
            limit=limit,
        )
        summary["path"] = resolved_path
        if config_name:
            summary["config_name"] = config_name
    finally:
        run_metadata_var.reset(token)

    saved_path = None
    if not no_save:
        if output:
            runner._save_results(summary, output)
            saved_path = output
        else:
            store.save_run(
                summary,
                run_id=run_id,
                session_name=session_name,
                run_name=run_name,
                overwrite=effective_overwrite,
            )
            saved_path = str(store._find_run_file(run_id))

    return {
        "summary": summary,
        "saved_path": saved_path,
        "run_id": run_id,
        "session_name": session_name,
        "run_name": run_name,
    }
