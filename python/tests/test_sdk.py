from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Optional

import pytest

from ezvals import EvalContext, EvalResult, TraceData, eval, run, run_evals


def test_context_is_injected_by_annotation_under_any_name():
    @eval(input="q")
    def a(anything: EvalContext):
        anything.output = anything.input + "!"

    @eval
    def b(ctx: Optional[EvalContext]):
        ctx.output = "optional works"

    @eval
    def c(ctx: "EvalContext"):
        ctx.output = "forward ref works"

    assert a().output == "q!"
    assert b().output == "optional works"
    assert c().output == "forward ref works"


def test_eval_without_context_returns_results_directly():
    @eval
    def plain():
        return EvalResult(input=1, output=2)

    assert plain().output == 2


def test_async_evals_and_call_async():
    @eval
    async def slow_add(ctx: EvalContext):
        await asyncio.sleep(0.01)
        ctx.output = 3

    assert slow_add().output == 3
    assert asyncio.run(slow_add.call_async()).output == 3


def test_calling_an_eval_with_cases_returns_every_case():
    @eval(cases=[{"id": "one", "input": 1}, {"input": 2}])
    def double(ctx: EvalContext):
        ctx.output = ctx.input * 2

    assert [r.output for r in double()] == [2, 4]


def test_sync_timeout_returns_without_waiting_for_the_eval():
    @eval(timeout=0.1)
    def hangs(ctx: EvalContext):
        time.sleep(3)

    start = time.perf_counter()
    result = hangs()
    assert time.perf_counter() - start < 1
    assert result.error == "TimeoutError: Evaluation timed out after 0.1s"


@pytest.mark.parametrize("kwargs, message", [
    ({"target": lambda ctx: None}, "target requires the evaluation function to accept a context parameter"),
    ({"cases": [{"input": 1}]}, "cases requires the evaluation function to accept a context parameter"),
])
def test_features_that_need_a_context_parameter(kwargs, message):
    with pytest.raises(ValueError, match=message):
        eval(**kwargs)(lambda: None)


def test_input_loader_is_exclusive_with_input():
    with pytest.raises(ValueError, match="input_loader cannot be used"):
        @eval(input="x", input_loader=lambda: [])
        def f(ctx: EvalContext):
            pass


def test_unknown_case_keys_fail_loudly():
    @eval(cases=[{"input": 1, "promt": "typo"}])
    def f(ctx: EvalContext):
        pass

    with pytest.raises(ValueError, match="Unknown case keys: promt"):
        f()


def test_score_validation():
    with pytest.raises(ValueError, match=r"Invalid score \{'key': 'x'\}: use True/False, a number, or"):
        EvalResult(input=1, output=2, scores={"key": "x"})
    with pytest.raises(ValueError, match="Invalid score 'good'"):
        EvalContext().store(scores="good")
    with pytest.raises(ValueError, match=r"Scores \[True, 0.5\] would share the key 'pass': give each a 'key'"):
        EvalContext().store(scores=[True, 0.5])
    assert len(EvalResult(input=1, output=2, scores=[True, {"key": "len", "value": 0.5}]).scores) == 2
    with pytest.raises(ValueError, match="Must specify score key or set default_score_key"):
        EvalContext(default_score_key=None).store(scores=True)
    assert EvalResult(input=1, output=2, scores={"passed": True}).scores == [{"passed": True, "key": "pass"}]


def test_trace_data_attribute_and_item_access():
    trace = TraceData()
    assert trace.messages == [] and trace.trace_url is None
    trace.messages.append({"role": "user"})
    trace.custom_metric = 0.9
    trace["tokens"] = 5
    trace.add_messages([{"role": "assistant"}])
    assert trace == {"messages": [{"role": "assistant"}], "custom_metric": 0.9, "tokens": 5}


def test_run_metadata_is_read_only():
    ctx = EvalContext(run_id="r1", config={"model": "m"})
    assert (ctx.run_id, ctx.config, ctx.session_name) == ("r1", {"model": "m"}, None)
    with pytest.raises(AttributeError):
        ctx.run_id = "other"


def test_context_manager_and_spread_store():
    with EvalContext(input="in") as ctx:
        ctx.store(**{"output": "out", "latency": 0.5, "trace_data": {"model": "x"}}, scores=True)
    result = ctx.build()
    assert (result.output, result.latency, result.trace_data, result.scores) == ("out", 0.5, {"model": "x"}, [{"passed": True, "key": "pass"}])


EVAL_FILE = '''
from ezvals import eval, EvalContext
from helper import shout

@eval(dataset="qa", labels=["prod"])
def loud(ctx: EvalContext):
    ctx.output = shout("hi")

@eval(dataset="other")
def quiet(ctx: EvalContext):
    ctx.output = "hi"
'''


def test_run_evals_discovers_paths_with_sibling_imports(tmp_path: Path):
    (tmp_path / "helper.py").write_text("def shout(s):\n    return s.upper()\n")
    (tmp_path / "evals.py").write_text(EVAL_FILE)
    assert [r.output for r in run_evals([str(tmp_path)], dataset="qa")] == ["HI"]
    assert [r.output for r in run_evals([str(tmp_path / "evals.py")], labels=["prod"], concurrency=2)] == ["HI"]


def test_run_matches_the_cli(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "helper.py").write_text("def shout(s):\n    return s.upper()\n")
    (tmp_path / "evals.py").write_text(EVAL_FILE)
    report = run("evals.py", session="sdk", run_name="baseline")
    assert (report["session_name"], report["run_name"], report["total_evaluations"]) == ("sdk", "baseline", 2)
    assert run("evals.py", trials=2, no_save=True)["trials"] == 2
    assert Path(report["saved_path"]).exists()
    assert not (tmp_path / "ezvals.json").exists()
    with pytest.raises(ValueError, match="Path missing.py does not exist"):
        run("missing.py")


def test_every_eval_reports_a_result_even_when_its_output_cannot_be_sent(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "evals.py").write_text('''
import threading
from ezvals import eval, EvalContext

@eval
def circular(ctx: EvalContext):
    ctx.output = {}
    ctx.output["self"] = ctx.output

@eval
def lock(ctx: EvalContext):
    ctx.output = threading.Lock()

@eval
def not_results():
    return [1, 2]
''')
    rows = {row["function"]: row["result"] for row in run("evals.py", no_save=True, timeout=10)["results"]}
    assert rows["circular"]["error"].startswith("ValueError: Circular reference detected")
    assert rows["lock"]["output"].startswith("<unlocked _thread.lock")
    assert rows["not_results"]["error"].startswith("ValueError: Evaluation function must return")
    assert run("evals.py::missing", no_save=True)["results"] == []


def test_bare_assert_notes_are_its_source_line(tmp_path: Path):
    # a separate file: pytest rewrites the asserts in test modules
    (tmp_path / "evals.py").write_text("""
from ezvals import eval, EvalContext

@eval(input="x", reference="y")
def compares(ctx: EvalContext):
    ctx.output = ctx.input
    assert ctx.output == ctx.reference
""")
    [result] = run_evals([str(tmp_path / "evals.py")])
    assert result.scores == [{"passed": False, "notes": "assert ctx.output == ctx.reference", "key": "pass"}]


def test_forgotten_await_is_an_error():
    async def agent(x):
        return x

    @eval(input="hi")
    def forgets(ctx: EvalContext):
        ctx.output = agent(ctx.input)

    result = forgets()
    assert (result.output, result.error) == (None, "TypeError: ctx.output was never awaited. Did you forget await?")


def test_error_tracebacks_show_only_user_frames():
    def helper():
        raise RuntimeError("upstream 500")

    @eval
    def crashes(ctx: EvalContext):
        helper()

    @eval
    async def crashes_async(ctx: EvalContext):
        helper()

    for result in (crashes(), crashes_async()):
        lines = result.error.splitlines()
        assert lines[0] == lines[-1] == "RuntimeError: upstream 500"
        assert "test_sdk.py" in result.error and "helper()" in result.error
        assert "ezvals" not in result.error.replace("test_sdk.py", "") and "asyncio" not in result.error and "threading" not in result.error
