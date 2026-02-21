
from click.testing import CliRunner
from ezvals.cli import cli

class TestCLIConcurrencyOutput:
    def setup_method(self):
        self.runner = CliRunner()

    def test_concurrent_output_not_swallowed(self):
        """
        Regression test: Ensure running with concurrency > 0 still prints completion output.
        """
        with self.runner.isolated_filesystem():
            with open('test_conc.py', 'w') as f:
                f.write("""
import asyncio
from ezvals import eval, EvalResult

@eval()
async def test_async_1():
    await asyncio.sleep(0.01)
    return EvalResult(input="1", output="1")

@eval()
async def test_async_2():
    await asyncio.sleep(0.01)
    return EvalResult(input="2", output="2")
""")

            result = self.runner.invoke(cli, ['run', 'test_conc.py', '--concurrency', '2'])

            assert result.exit_code == 0
            assert 'Running test_conc.py' in result.output
            assert 'Results saved to' in result.output
