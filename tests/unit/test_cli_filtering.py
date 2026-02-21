from click.testing import CliRunner
import json
from ezvals.cli import cli


class TestCLIFiltering:
    def test_cli_run_specific_function(self):
        """Test CLI can run a specific function using file::func syntax"""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_filter.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult
@eval()
def func_a(): return EvalResult(input='a', output='a')
@eval()
def func_b(): return EvalResult(input='b', output='b')
""")

            result = runner.invoke(cli, ['run', 'test_cli_filter.py::func_a', '--output', 'out.json'])
            assert result.exit_code == 0
            with open('out.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 1
            assert data['total_evaluations'] == 1

    def test_cli_run_specific_case_function(self):
        """Test CLI can run case variants"""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_param.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult, EvalContext

@eval(cases=[
    {"input": 1},
    {"input": 2},
])
def param_func(ctx: EvalContext): return EvalResult(input=str(ctx.input), output=str(ctx.input))
""")

            # Test running base name (should run all variants)
            result = runner.invoke(cli, ['run', 'test_cli_param.py::param_func', '--output', 'all.json'])
            assert result.exit_code == 0
            with open('all.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 2
            assert data['total_evaluations'] == 2

            # Test running specific variant
            result = runner.invoke(cli, ['run', 'test_cli_param.py::param_func[0]', '--output', 'single.json'])
            assert result.exit_code == 0
            with open('single.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 1
            assert data['total_evaluations'] == 1

    def test_cli_run_nonexistent_function(self):
        """Test CLI handles non-existent function name gracefully"""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_nonexistent.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult
@eval()
def existing_func(): return EvalResult(input='a', output='b')
""")

            result = runner.invoke(cli, ['run', 'test_cli_nonexistent.py::non_existent'])
            assert result.exit_code == 0
            assert 'No evaluations found' in result.output

    def test_cli_run_nonexistent_file(self):
        """Test CLI handles non-existent file path in file::func syntax"""
        runner = CliRunner()
        result = runner.invoke(cli, ['run', 'nonexistent.py::func'])
        assert result.exit_code == 1
        assert 'does not exist' in result.output

    def test_cli_run_with_function_filter_and_dataset(self):
        """Test CLI function filter combined with dataset filter"""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_combo.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(dataset="ds1")
def func_a(): return EvalResult(input='a', output='a')

@eval(dataset="ds2")
def func_b(): return EvalResult(input='b', output='b')
""")

            result = runner.invoke(cli, [
                'run', 'test_cli_combo.py::func_a',
                '--dataset', 'ds1',
                '--output', 'out.json',
            ])
            assert result.exit_code == 0
            with open('out.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 1

    def test_combined_dataset_and_label_filter(self):
        """--dataset X --label Y uses AND logic (must match both)"""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_and_filter.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(dataset="prod", labels=["fast"])
def func_a(): return EvalResult(input='a', output='a')

@eval(dataset="prod", labels=["slow"])
def func_b(): return EvalResult(input='b', output='b')

@eval(dataset="staging", labels=["fast"])
def func_c(): return EvalResult(input='c', output='c')
""")

            # Only func_a matches both dataset=prod AND label=fast
            result = runner.invoke(cli, [
                'run', 'test_and_filter.py',
                '--dataset', 'prod',
                '--label', 'fast',
                '--output', 'out.json',
            ])
            assert result.exit_code == 0
            with open('out.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 1
            assert data['total_evaluations'] == 1

    def test_cli_run_multiple_eval_selectors(self):
        """Test CLI can run a specific list of evals via PATH::a,b selectors."""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_multi_select.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def func_a(): return EvalResult(input='a', output='a')

@eval()
def func_b(): return EvalResult(input='b', output='b')

@eval()
def func_c(): return EvalResult(input='c', output='c')
""")

            result = runner.invoke(
                cli,
                ['run', 'test_cli_multi_select.py::func_a,func_c', '--output', 'out.json'],
            )
            assert result.exit_code == 0
            with open('out.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 2
            assert data['total_evaluations'] == 2

    def test_cli_run_case_ids_with_at_selector(self):
        """Test CLI supports function@case_id selectors."""
        runner = CliRunner()
        with runner.isolated_filesystem():
            with open('test_cli_case_ids.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult, EvalContext

@eval(cases=[
    {"id": "case_id_1", "input": "a"},
    {"id": "case_id_2", "input": "b"},
    {"id": "case_id_3", "input": "c"},
])
def test_a(ctx: EvalContext): return EvalResult(input=ctx.input, output=ctx.input)
""")

            result = runner.invoke(
                cli,
                ['run', 'test_cli_case_ids.py::test_a@case_id_1,test_a@case_id_2', '--output', 'out.json'],
            )
            assert result.exit_code == 0
            with open('out.json') as f:
                data = json.load(f)
            assert data['total_functions'] == 2
            assert data['total_evaluations'] == 2
