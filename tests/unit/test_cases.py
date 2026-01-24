"""Tests for the cases functionality"""
import pytest
from ezvals import eval, EvalResult, EvalContext
from ezvals.discovery import EvalDiscovery
from ezvals.cases import generate_eval_functions
from ezvals.decorators import EvalFunction


class TestCases:

    def test_cases_data_visible_to_target(self):
        captured_inputs = []
        captured_metadata = []

        def target(ctx: EvalContext):
            captured_inputs.append(ctx.input)
            captured_metadata.append(ctx.metadata)
            ctx.store(output=ctx.input["prompt"] + "-out")

        @eval(
            target=target,
            cases=[
                {"id": "hello", "input": {"prompt": "hello"}, "metadata": {"expected": "hello-out"}},
                {"id": "world", "input": {"prompt": "world"}, "metadata": {"expected": "world-out"}},
            ],
        )
        def test_func(ctx: EvalContext):
            assert ctx.metadata["expected"].endswith("-out")
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        results = [f() for f in funcs]

        assert [r.output for r in results] == ["hello-out", "world-out"]
        assert captured_inputs == [
            {"prompt": "hello"},
            {"prompt": "world"},
        ]
        assert captured_metadata == [
            {"expected": "hello-out"},
            {"expected": "world-out"},
        ]

    def test_cases_uses_default_input_when_missing(self):
        @eval(input="base", cases=[{}])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        result = funcs[0]()
        assert result.input == "base"

    def test_cases_input_can_clear(self):
        @eval(input="base", cases=[{"input": None}])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        result = funcs[0]()
        assert result.input is None

    def test_cases_with_ids(self):
        @eval(cases=[
            {"id": "ten", "input": 10},
            {"id": "twenty", "input": 20},
        ])
        def test_func(ctx: EvalContext):
            ctx.store(output=ctx.input * 2)

        funcs = generate_eval_functions(test_func)
        assert len(funcs) == 2
        assert "[ten]" in funcs[0].__name__
        assert "[twenty]" in funcs[1].__name__

    def test_cases_preserves_metadata(self):
        @eval(dataset="my_dataset", labels=["test", "unit"], metadata={"a": 1}, cases=[
            {"input": "x"},
            {"input": "y"},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)

        for func in funcs:
            assert func.dataset == "my_dataset"
            assert func.labels == ["test", "unit"]
            assert func.context_kwargs.get("metadata") == {"a": 1}

    def test_per_case_dataset_overrides(self):
        @eval(dataset="default_ds", cases=[
            {"input": "a", "dataset": "custom_ds"},
            {"input": "b", "dataset": None},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert funcs[0].dataset == "custom_ds"
        assert funcs[1].dataset is None

    def test_per_case_labels_merge_and_clear(self):
        @eval(labels=["base"], cases=[
            {"input": "a", "labels": ["extra"]},
            {"input": "b", "labels": None},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert funcs[0].labels == ["base", "extra"]
        assert funcs[1].labels == []

    def test_per_case_labels_no_duplicates(self):
        @eval(labels=["base", "shared"], cases=[
            {"input": "a", "labels": ["shared", "new"]},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert funcs[0].labels == ["base", "shared", "new"]

    def test_metadata_merge_and_clear(self):
        @eval(metadata={"a": 1, "b": 2}, cases=[
            {"input": "x", "metadata": {"b": 3, "c": 4}},
            {"input": "y", "metadata": None},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert funcs[0].context_kwargs.get("metadata") == {"a": 1, "b": 3, "c": 4}
        assert funcs[1].context_kwargs.get("metadata") is None

    def test_per_case_target_and_evaluators(self):
        def target_one(ctx: EvalContext):
            ctx.store(output="one")

        def target_two(ctx: EvalContext):
            ctx.store(output="two")

        def eval_one(result: EvalResult):
            return {"key": "one", "passed": result.output == "one"}

        def eval_two(result: EvalResult):
            return {"key": "two", "passed": result.output == "two"}

        @eval(
            target=target_one,
            evaluators=[eval_one],
            cases=[
                {"input": "x"},
                {"input": "y", "target": target_two, "evaluators": [eval_two]},
            ],
        )
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        results = [f() for f in funcs]
        assert results[0].output == "one"
        assert any(s.key == "one" for s in results[0].scores)
        assert results[1].output == "two"
        assert any(s.key == "two" for s in results[1].scores)

    def test_per_case_timeout_override(self):
        @eval(timeout=5.0, cases=[
            {"input": "x"},
            {"input": "y", "timeout": 1.0},
        ])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert funcs[0].timeout == 5.0
        assert funcs[1].timeout == 1.0

    def test_unknown_case_key_raises(self):
        with pytest.raises(ValueError):
            @eval(cases=[{"input": "x", "bogus": 1}])
            def test_func(ctx: EvalContext):
                return ctx.build()

    def test_cases_require_context_param(self):
        with pytest.raises(ValueError, match="context parameter"):
            @eval(cases=[{"input": "x"}])
            def test_func():
                return EvalResult(input="x", output="y")

    def test_empty_cases_list(self):
        @eval(cases=[])
        def test_func(ctx: EvalContext):
            return ctx.build()

        funcs = generate_eval_functions(test_func)
        assert len(funcs) == 0

    @pytest.mark.asyncio
    async def test_async_cases(self):
        @eval(cases=[{"input": 1}, {"input": 2}, {"input": 3}])
        async def test_func(ctx: EvalContext):
            return EvalResult(input=ctx.input, output=ctx.input * 10)

        funcs = generate_eval_functions(test_func)
        assert len(funcs) == 3

        result0 = await funcs[0].call_async()
        assert result0.output == 10

        result1 = await funcs[1].call_async()
        assert result1.output == 20

        result2 = await funcs[2].call_async()
        assert result2.output == 30

    def test_discovery_with_cases(self):
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write("""
from ezvals import eval, EvalResult, EvalContext

@eval(dataset=\"test_discovery\", cases=[
    {\"input\": 1},
    {\"input\": 2},
    {\"input\": 3},
])
def test_param(ctx: EvalContext):
    return EvalResult(input=ctx.input, output=ctx.input * 2)

@eval()
def test_normal():
    return EvalResult(input=\"normal\", output=\"test\")
""")
            temp_path = f.name

        try:
            discovery = EvalDiscovery()
            funcs = discovery.discover(temp_path)

            assert len(funcs) == 4
            param_funcs = [f for f in funcs if f.dataset == "test_discovery"]
            assert len(param_funcs) == 3

            results = [f() for f in param_funcs]
            outputs = sorted([r.output for r in results])
            assert outputs == [2, 4, 6]
        finally:
            os.unlink(temp_path)

    def test_case_functions_are_eval_functions(self):
        @eval(cases=[{"input": "x"}])
        def test_func(ctx: EvalContext):
            return ctx.build()

        assert isinstance(test_func, EvalFunction)
        assert hasattr(test_func.func, '__case_sets__')
