import pytest
from ezvals.discovery import EvalDiscovery
from ezvals.decorators import EvalFunction


class TestFunctionFiltering:
    def test_filter_exact_match(self, tmp_path):
        """Test filtering by exact function name match"""
        # Setup mock file
        d = tmp_path / "test_filter.py"
        d.write_text("""
from ezvals import eval, EvalResult
@eval()
def target_func(): return EvalResult(input='a', output='b')
@eval()
def other_func(): return EvalResult(input='c', output='d')
""")
        
        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_name="target_func")
        
        assert len(funcs) == 1
        assert funcs[0].func.__name__ == "target_func"

    def test_filter_case_base_name(self, tmp_path):
        """Test filtering case-expanded function by base name returns all variants"""
        d = tmp_path / "test_param.py"
        d.write_text("""
from ezvals import eval, EvalResult, EvalContext

@eval(cases=[
    {"input": 1},
    {"input": 2},
])
def param_func(ctx: EvalContext): return EvalResult(input=str(ctx.input), output=str(ctx.input))
""")
        
        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_name="param_func")
        
        assert len(funcs) == 2
        names = {f.func.__name__ for f in funcs}
        assert names == {"param_func[0]", "param_func[1]"}

    def test_filter_case_specific_variant(self, tmp_path):
        """Test filtering case-expanded function by specific variant name"""
        d = tmp_path / "test_param_specific.py"
        d.write_text("""
from ezvals import eval, EvalResult, EvalContext

@eval(cases=[
    {"input": 1},
    {"input": 2},
])
def param_func(ctx: EvalContext): return EvalResult(input=str(ctx.input), output=str(ctx.input))
""")
        
        discovery = EvalDiscovery()
        # Note: default IDs use index
        funcs = discovery.discover(str(d), function_name="param_func[0]")
        
        assert len(funcs) == 1
        assert funcs[0].func.__name__ == "param_func[0]"

    def test_filter_no_match(self, tmp_path):
        """Test filtering with non-existent function name returns empty list"""
        d = tmp_path / "test_none.py"
        d.write_text("""
from ezvals import eval, EvalResult
@eval()
def my_func(): return EvalResult(input='a', output='b')
""")
        
        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_name="non_existent")
        
        assert len(funcs) == 0

    def test_filter_combined_with_dataset(self, tmp_path):
        """Test function name filter combined with dataset filter"""
        d = tmp_path / "test_combined.py"
        d.write_text("""
from ezvals import eval, EvalResult

@eval(dataset="ds1")
def func_a(): return EvalResult(input='a', output='a')

@eval(dataset="ds2")
def func_b(): return EvalResult(input='b', output='b')

@eval(dataset="ds1")
def func_c(): return EvalResult(input='c', output='c')
""")
        
        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), dataset="ds1", function_name="func_a")
        
        assert len(funcs) == 1
        assert funcs[0].func.__name__ == "func_a"
        assert funcs[0].dataset == "ds1"

    def test_filter_combined_with_labels(self, tmp_path):
        """Test function name filter combined with label filter"""
        d = tmp_path / "test_labels.py"
        d.write_text("""
from ezvals import eval, EvalResult

@eval(labels=["prod"])
def func_prod(): return EvalResult(input='p', output='p')

@eval(labels=["dev"])
def func_dev(): return EvalResult(input='d', output='d')

@eval(labels=["prod"])
def func_prod2(): return EvalResult(input='p2', output='p2')
""")
        
        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), labels=["prod"], function_name="func_prod")
        
        assert len(funcs) == 1
        assert funcs[0].func.__name__ == "func_prod"
        assert "prod" in funcs[0].labels

    def test_filter_multiple_function_names(self, tmp_path):
        """Test filtering by multiple function names."""
        d = tmp_path / "test_multi.py"
        d.write_text("""
from ezvals import eval, EvalResult

@eval()
def func_a(): return EvalResult(input='a', output='a')

@eval()
def func_b(): return EvalResult(input='b', output='b')

@eval()
def func_c(): return EvalResult(input='c', output='c')
""")

        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_names=["func_a", "func_c"])

        assert len(funcs) == 2
        assert [f.func.__name__ for f in funcs] == ["func_a", "func_c"]

    def test_filter_multiple_function_names_from_comma_string(self, tmp_path):
        """Test filtering by comma-separated function names."""
        d = tmp_path / "test_multi_comma.py"
        d.write_text("""
from ezvals import eval, EvalResult

@eval()
def func_a(): return EvalResult(input='a', output='a')

@eval()
def func_b(): return EvalResult(input='b', output='b')

@eval()
def func_c(): return EvalResult(input='c', output='c')
""")

        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_name="func_a,func_b")

        assert len(funcs) == 2
        assert [f.func.__name__ for f in funcs] == ["func_a", "func_b"]

    def test_filter_case_ids_with_at_selector(self, tmp_path):
        """Test function@case_id selector maps to function[case_id]."""
        d = tmp_path / "test_case_ids.py"
        d.write_text("""
from ezvals import eval, EvalResult, EvalContext

@eval(cases=[
    {"id": "case_id_1", "input": 1},
    {"id": "case_id_2", "input": 2},
    {"id": "case_id_3", "input": 3},
])
def test_a(ctx: EvalContext): return EvalResult(input=str(ctx.input), output=str(ctx.input))
""")

        discovery = EvalDiscovery()
        funcs = discovery.discover(str(d), function_name="test_a@case_id_1,test_a@case_id_3")

        assert len(funcs) == 2
        assert [f.func.__name__ for f in funcs] == ["test_a[case_id_1]", "test_a[case_id_3]"]
