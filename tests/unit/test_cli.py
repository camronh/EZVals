import pytest
from click.testing import CliRunner
import tempfile
import json
from pathlib import Path

import click

from ezvals.cli import cli, _resolve_run_name_in_session, _parse_compare_run_names, _build_serve_query_params
from ezvals.storage import ResultsStore


class TestCLI:
    
    def setup_method(self):
        self.runner = CliRunner()
    
    def test_cli_help(self):
        result = self.runner.invoke(cli, ['--help'])
        assert result.exit_code == 0
        assert 'EZVals' in result.output
        assert 'lightweight evaluation framework' in result.output
    
    def test_run_command_help(self):
        result = self.runner.invoke(cli, ['run', '--help'])
        assert result.exit_code == 0
        assert '--dataset' in result.output
        assert '--label' in result.output
        assert '--output FILE' in result.output
        assert '--concurrency' in result.output
        assert '--verbose' in result.output
        assert '--visual' in result.output
    
    def test_run_with_file(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_eval.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_cli():
    return EvalResult(input="cli", output="test")
""")

            # Default mode: minimal output
            result = self.runner.invoke(cli, ['run', 'test_eval.py'])
            assert result.exit_code == 0
            assert 'Running test_eval.py' in result.output
            assert 'Results saved to' in result.output

            # Visual mode: full output with summary
            result = self.runner.invoke(cli, ['run', 'test_eval.py', '--visual'])
            assert result.exit_code == 0
            assert 'Total Functions: 1' in result.output
            assert 'Total Evaluations: 1' in result.output

    def test_run_with_dataset_filter(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_dataset.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(dataset="dataset1")
def test_one():
    return EvalResult(input="1", output="1")

@eval(dataset="dataset2")
def test_two():
    return EvalResult(input="2", output="2")
""")

            result = self.runner.invoke(cli, ['run', 'test_dataset.py', '--dataset', 'dataset1', '--visual'])
            assert result.exit_code == 0
            assert 'Total Functions: 1' in result.output
            assert 'Total Evaluations: 1' in result.output
    
    def test_run_with_label_filter(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_labels.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(labels=["prod"])
def test_prod():
    return EvalResult(input="p", output="p")

@eval(labels=["dev"])
def test_dev():
    return EvalResult(input="d", output="d")
""")

            result = self.runner.invoke(cli, ['run', 'test_labels.py', '--label', 'prod', '--visual'])
            assert result.exit_code == 0
            assert 'Total Functions: 1' in result.output

    def test_run_with_multiple_labels(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_multi_labels.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(labels=["a"])
def test_a():
    return EvalResult(input="a", output="a")

@eval(labels=["b"])
def test_b():
    return EvalResult(input="b", output="b")

@eval(labels=["c"])
def test_c():
    return EvalResult(input="c", output="c")
""")

            result = self.runner.invoke(cli, [
                'run', 'test_multi_labels.py',
                '--label', 'a',
                '--label', 'b',
                '--visual'
            ])
            assert result.exit_code == 0
            assert 'Total Functions: 2' in result.output

    def test_run_with_json_output(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_json.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_json():
    return EvalResult(
        input="test",
        output="result",
        scores={"key": "metric", "value": 0.9}
    )
""")

            result = self.runner.invoke(cli, [
                'run', 'test_json.py',
                '--output', 'results.json'
            ])
            assert result.exit_code == 0
            assert 'Results saved to results.json' in result.output

            # Verify JSON file
            assert Path('results.json').exists()
            with open('results.json') as f:
                data = json.load(f)
            assert data['total_evaluations'] == 1
            assert data['total_functions'] == 1
    
    def test_run_with_verbose(self):
        with self.runner.isolated_filesystem():
            # Create test file with print statements
            with open('test_verbose.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_verbose():
    print("This should show with verbose")
    return EvalResult(input="v", output="verbose", scores={"key": "test", "passed": True})
""")

            # Verbose shows print statements from eval functions
            result = self.runner.invoke(cli, ['run', 'test_verbose.py', '--verbose'])
            assert result.exit_code == 0
            assert 'This should show with verbose' in result.output
            assert 'Results saved to' in result.output

            # Without verbose, print statements are hidden
            result = self.runner.invoke(cli, ['run', 'test_verbose.py'])
            assert result.exit_code == 0
            assert 'This should show with verbose' not in result.output
    
    def test_run_with_concurrency(self):
        with self.runner.isolated_filesystem():
            # Create test file
            with open('test_concurrent.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_1():
    return EvalResult(input="1", output="1")

@eval()
def test_2():
    return EvalResult(input="2", output="2")
""")

            result = self.runner.invoke(cli, [
                'run', 'test_concurrent.py',
                '--concurrency', '2',
                '--visual'
            ])
            assert result.exit_code == 0
            assert 'Total Functions: 2' in result.output
            assert 'Total Evaluations: 2' in result.output

    def test_run_no_evaluations_found(self):
        with self.runner.isolated_filesystem():
            # Create test file without eval functions
            with open('test_empty.py', 'w') as f:
                f.write("""
def regular_function():
    return "not an eval"
""")

            result = self.runner.invoke(cli, ['run', 'test_empty.py', '--visual'])
            assert result.exit_code == 0
            assert 'No evaluations found' in result.output

    def test_run_with_error(self):
        with self.runner.isolated_filesystem():
            # Create test file with error
            with open('test_error.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_error():
    raise ValueError("Test error")
""")

            result = self.runner.invoke(cli, ['run', 'test_error.py', '--visual'])
            assert result.exit_code == 0  # Should still complete
            assert 'Errors: 1' in result.output

    def test_run_nonexistent_path(self):
        result = self.runner.invoke(cli, ['run', 'nonexistent.py'])
        assert result.exit_code == 1  # Error code for missing file
        assert 'does not exist' in result.output

    def test_limit_flag(self):
        """--limit N runs at most N evaluations"""
        with self.runner.isolated_filesystem():
            with open('test_limit.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(dataset="test")
def test_1():
    return EvalResult(input="1", output="1")

@eval(dataset="test")
def test_2():
    return EvalResult(input="2", output="2")

@eval(dataset="test")
def test_3():
    return EvalResult(input="3", output="3")

@eval(dataset="test")
def test_4():
    return EvalResult(input="4", output="4")

@eval(dataset="test")
def test_5():
    return EvalResult(input="5", output="5")
""")

            result = self.runner.invoke(cli, ['run', 'test_limit.py', '--limit', '2', '--visual'])
            assert result.exit_code == 0
            assert 'Total Evaluations: 2' in result.output

    def test_no_save_stdout(self):
        """--no-save outputs JSON to stdout"""
        with self.runner.isolated_filesystem():
            with open('test_nosave.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_nosave():
    return EvalResult(input="x", output="y")
""")

            result = self.runner.invoke(cli, ['run', 'test_nosave.py', '--no-save'])
            assert result.exit_code == 0
            # Output should contain valid JSON
            import json
            # The JSON is in the output, parse it
            assert '"total_evaluations"' in result.output
            assert '"results"' in result.output

    def test_no_save_no_file(self):
        """--no-save prevents file from being written to .ezvals/sessions/"""
        with self.runner.isolated_filesystem():
            with open('test_nosave2.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_nosave():
    return EvalResult(input="x", output="y")
""")

            result = self.runner.invoke(cli, ['run', 'test_nosave2.py', '--no-save'])
            assert result.exit_code == 0
            # No file should be saved
            assert not Path('.ezvals/sessions').exists() or len(list(Path('.ezvals/sessions').rglob('*.json'))) == 0

    def test_session_flag(self):
        """--session sets session_name in stored JSON"""
        with self.runner.isolated_filesystem():
            with open('test_session.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_session():
    return EvalResult(input="x", output="y")
""")

            result = self.runner.invoke(cli, ['run', 'test_session.py', '--session', 'my-session'])
            assert result.exit_code == 0

            # Load from new hierarchical storage location
            session_dir = Path('.ezvals/sessions/my-session')
            run_files = list(session_dir.glob('*.json'))
            assert len(run_files) == 1
            with open(run_files[0]) as f:
                data = json.load(f)
            assert data['session_name'] == 'my-session'

    def test_run_name_flag(self):
        """--run-name sets run_name in stored JSON"""
        with self.runner.isolated_filesystem():
            with open('test_runname.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_runname():
    return EvalResult(input="x", output="y")
""")

            result = self.runner.invoke(cli, ['run', 'test_runname.py', '--run-name', 'baseline'])
            assert result.exit_code == 0

            # Load from default session (CLI uses "default" session)
            session_dir = Path('.ezvals/sessions/default')
            run_files = list(session_dir.glob('baseline_*.json'))
            assert len(run_files) == 1
            with open(run_files[0]) as f:
                data = json.load(f)
            assert data['run_name'] == 'baseline'

    def test_comma_separated_datasets(self):
        """--dataset a,b filters with OR logic"""
        with self.runner.isolated_filesystem():
            with open('test_comma_ds.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval(dataset="alpha")
def test_alpha():
    return EvalResult(input="a", output="a")

@eval(dataset="beta")
def test_beta():
    return EvalResult(input="b", output="b")

@eval(dataset="gamma")
def test_gamma():
    return EvalResult(input="g", output="g")
""")

            # Comma-separated datasets should match alpha OR beta
            result = self.runner.invoke(cli, ['run', 'test_comma_ds.py', '--dataset', 'alpha,beta', '--visual'])
            assert result.exit_code == 0
            assert 'Total Functions: 2' in result.output
            assert 'Total Evaluations: 2' in result.output

    def test_exit_code_success_regardless_of_pass_fail(self):
        """Exit code 0 on completion regardless of pass/fail status"""
        with self.runner.isolated_filesystem():
            with open('test_exitcode.py', 'w') as f:
                f.write("""
from ezvals import eval, EvalResult

@eval()
def test_failing():
    return EvalResult(input="x", output="y", scores=[{"key": "check", "passed": False}])
""")

            result = self.runner.invoke(cli, ['run', 'test_exitcode.py', '--visual'])
            # Exit code should be 0 even when evals fail
            assert result.exit_code == 0
            assert 'FAIL' in result.output

    def test_serve_nonexistent_json_fails(self):
        """serve command with nonexistent JSON path should fail"""
        result = self.runner.invoke(cli, ['serve', 'nonexistent.json'])
        assert result.exit_code == 1
        assert 'does not exist' in result.output

    def test_serve_help_shows_path_argument(self):
        """serve help should show PATH argument"""
        result = self.runner.invoke(cli, ['serve', '--help'])
        assert result.exit_code == 0
        assert 'PATH' in result.output
        assert '--port' in result.output
        assert '--run-name' in result.output
        assert '--compare-runs' in result.output
        assert '--search' in result.output
        assert '--has-error' in result.output
        assert '--has-url' in result.output
        assert '--has-messages' in result.output
        assert '--annotation' in result.output

    def test_parse_compare_run_names_validation(self):
        """compare-runs parser validates count and duplicates"""
        with pytest.raises(click.ClickException):
            _parse_compare_run_names("single")
        with pytest.raises(click.ClickException):
            _parse_compare_run_names("a,a")
        with pytest.raises(click.ClickException):
            _parse_compare_run_names("a,b,c,d,e")
        assert _parse_compare_run_names("a,b") == ["a", "b"]

    def test_build_serve_query_params(self):
        """serve query params are readable and explicit"""
        params = _build_serve_query_params(
            active_run_id="run123",
            comparison_run_ids=["run123", "run456"],
            search="slow",
            has_error=True,
            has_url=False,
            has_messages=None,
            annotation="yes",
        )
        assert ("run_id", "run123") in params
        assert params.count(("compare_run_id", "run123")) == 1
        assert params.count(("compare_run_id", "run456")) == 1
        assert ("search", "slow") in params
        assert ("has_error", "1") in params
        assert ("has_url", "0") in params
        assert ("annotation", "yes") in params

    def test_resolve_run_name_in_session(self):
        """run-name resolver finds exact run name within session"""
        with self.runner.isolated_filesystem():
            store = ResultsStore(".ezvals/sessions")
            summary = {"results": [], "total_evaluations": 0}
            run_id = store.save_run(summary, run_id="run001", session_name="s1", run_name="baseline")
            resolved = _resolve_run_name_in_session(store, "s1", "baseline", required=True)
            assert resolved["run_id"] == run_id
            assert resolved["run_data"]["run_name"] == "baseline"

    def test_resolve_run_name_in_session_missing_optional(self):
        """optional run-name lookup returns None when not found"""
        with self.runner.isolated_filesystem():
            store = ResultsStore(".ezvals/sessions")
            summary = {"results": [], "total_evaluations": 0}
            store.save_run(summary, run_id="run001", session_name="s1", run_name="baseline")
            resolved = _resolve_run_name_in_session(store, "s1", "missing", required=False)
            assert resolved is None

    def test_resolve_run_name_in_session_missing_required(self):
        """required run-name lookup fails loudly when missing"""
        with self.runner.isolated_filesystem():
            store = ResultsStore(".ezvals/sessions")
            summary = {"results": [], "total_evaluations": 0}
            store.save_run(summary, run_id="run001", session_name="s1", run_name="baseline")
            with pytest.raises(click.ClickException):
                _resolve_run_name_in_session(store, "s1", "missing", required=True)

    def test_resolve_run_name_in_session_ambiguous(self):
        """run-name lookup fails on ambiguous names in same session"""
        with self.runner.isolated_filesystem():
            store = ResultsStore(".ezvals/sessions")
            summary = {"results": [], "total_evaluations": 0}
            store.save_run(summary, run_id="run001", session_name="s1", run_name="baseline", overwrite=False)
            store.save_run(summary, run_id="run002", session_name="s1", run_name="baseline", overwrite=False)
            with pytest.raises(click.ClickException):
                _resolve_run_name_in_session(store, "s1", "baseline", required=True)

    def test_serve_uses_existing_run_name(self, monkeypatch):
        """serve --run-name opens existing run metadata when present"""
        captured = {}

        def fake_serve(**kwargs):
            captured.update(kwargs)

        monkeypatch.setattr('ezvals.cli._serve', fake_serve)

        with self.runner.isolated_filesystem():
            Path('evals.py').write_text('def x():\n    return 1\n')
            store = ResultsStore(".ezvals/sessions")
            summary = {
                "results": [],
                "total_evaluations": 0,
                "path": "evals.py",
                "dataset": "qa",
                "labels": ["prod"],
                "function_name": "target_eval",
                "session_name": "my-session",
                "run_name": "baseline",
            }
            run_id = store.save_run(summary, run_id="run001", session_name="my-session", run_name="baseline")

            result = self.runner.invoke(
                cli,
                ['serve', 'evals.py', '--session', 'my-session', '--run-name', 'baseline'],
            )
            assert result.exit_code == 0
            assert captured["active_run_id"] == run_id
            assert captured["path"] == "evals.py"
            assert captured["dataset"] == "qa"
            assert captured["labels"] == ["prod"]
            assert captured["function_name"] == "target_eval"
            assert ("run_id", run_id) in captured["query_params"]

    def test_serve_run_name_missing_sets_pending_name(self, monkeypatch):
        """serve --run-name uses pending name when no saved run exists"""
        captured = {}

        def fake_serve(**kwargs):
            captured.update(kwargs)

        monkeypatch.setattr('ezvals.cli._serve', fake_serve)

        with self.runner.isolated_filesystem():
            Path('evals.py').write_text('def x():\n    return 1\n')
            result = self.runner.invoke(
                cli,
                ['serve', 'evals.py', '--session', 'my-session', '--run-name', 'next-attempt'],
            )
            assert result.exit_code == 0
            assert captured["active_run_id"] is None
            assert captured["run_name"] == "next-attempt"
            assert captured["query_params"] == []

    def test_serve_compare_runs_requires_two_names(self):
        """serve --compare-runs validates minimum names"""
        with self.runner.isolated_filesystem():
            Path('evals.py').write_text('def x():\n    return 1\n')
            result = self.runner.invoke(cli, ['serve', 'evals.py', '--compare-runs', 'baseline'])
            assert result.exit_code != 0
            assert 'at least 2' in result.output

    def test_serve_compare_runs_missing_name_fails(self):
        """serve --compare-runs fails loudly when a run name is missing"""
        with self.runner.isolated_filesystem():
            Path('evals.py').write_text('def x():\n    return 1\n')
            store = ResultsStore(".ezvals/sessions")
            store.save_run({"results": [], "total_evaluations": 0}, run_id="run001", session_name="s1", run_name="baseline")
            result = self.runner.invoke(
                cli,
                ['serve', 'evals.py', '--session', 's1', '--compare-runs', 'baseline,missing'],
            )
            assert result.exit_code != 0
            assert "not found in session 's1'" in result.output


class TestSkillsCommands:
    """Tests for ezvals skills subcommands"""

    def setup_method(self):
        self.runner = CliRunner()

    def test_skills_help(self):
        result = self.runner.invoke(cli, ['skills', '--help'])
        assert result.exit_code == 0
        assert 'Manage evals agent skill' in result.output
        assert 'add' in result.output
        assert 'remove' in result.output
        assert 'doctor' in result.output

    def test_skills_add_help(self):
        result = self.runner.invoke(cli, ['skills', 'add', '--help'])
        assert result.exit_code == 0
        assert '--global' in result.output
        assert '--agents' in result.output

    def test_skills_add_creates_canonical_and_symlinks(self):
        """skills add should create canonical copy and symlinks"""
        with self.runner.isolated_filesystem():
            # Create a .claude directory to be detected as canonical
            Path('.claude').mkdir()

            result = self.runner.invoke(cli, ['skills', 'add'])
            assert result.exit_code == 0
            assert 'installed' in result.output
            assert '.claude/skills/evals/' in result.output

            # Verify canonical location exists
            canonical = Path('.claude/skills/evals/SKILL.md')
            assert canonical.exists()
            assert 'evals' in canonical.read_text()

            # Verify symlinks created
            for agent in ['codex', 'cursor', 'windsurf', 'kiro', 'roo']:
                symlink = Path(f'.{agent}/skills/evals')
                assert symlink.exists() or symlink.is_symlink()

    def test_skills_add_creates_agents_fallback(self):
        """skills add creates .agents/ when no agent dirs exist"""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(cli, ['skills', 'add'])
            assert result.exit_code == 0
            assert '.agents/skills/evals/' in result.output

            # Verify .agents/ was created
            assert Path('.agents/skills/evals/SKILL.md').exists()

    def test_skills_add_with_specific_agents(self):
        """skills add --agents only links specified agents"""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(cli, ['skills', 'add', '--agents', 'claude', '--agents', 'cursor'])
            assert result.exit_code == 0

            # Should only create specified agents
            assert Path('.claude/skills/evals').exists() or Path('.agents/skills/evals').exists()
            assert Path('.cursor/skills/evals').exists()
            # Should not create others
            assert not Path('.codex/skills/evals').exists()

    def test_skills_remove_cleans_up(self):
        """skills remove should remove skill from all agents"""
        with self.runner.isolated_filesystem():
            # First add
            self.runner.invoke(cli, ['skills', 'add'])

            # Then remove
            result = self.runner.invoke(cli, ['skills', 'remove'])
            assert result.exit_code == 0
            assert 'Removed' in result.output

            # Verify skill dirs removed
            assert not Path('.claude/skills/evals').exists()
            assert not Path('.agents/skills/evals').exists()

    def test_skills_remove_when_not_installed(self):
        """skills remove when nothing installed should report that"""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(cli, ['skills', 'remove'])
            assert result.exit_code == 0
            assert 'No evals skill installation found' in result.output

    def test_skills_doctor_shows_status(self):
        """skills doctor should show installation status"""
        with self.runner.isolated_filesystem():
            # Not installed
            result = self.runner.invoke(cli, ['skills', 'doctor'])
            assert result.exit_code == 0
            assert 'No evals skill found' in result.output

            # Install
            self.runner.invoke(cli, ['skills', 'add'])

            # Now should show installed
            result = self.runner.invoke(cli, ['skills', 'doctor'])
            assert result.exit_code == 0
            assert 'skills/evals/' in result.output
            assert 'linked' in result.output

    def test_skills_doctor_shows_version(self):
        """skills doctor should show skill version"""
        with self.runner.isolated_filesystem():
            self.runner.invoke(cli, ['skills', 'add'])

            result = self.runner.invoke(cli, ['skills', 'doctor'])
            assert result.exit_code == 0
            # Should show version from SKILL.md
            assert 'v0.1.1' in result.output or 'Package version:' in result.output

    def test_skills_add_overwrites_existing(self):
        """skills add should overwrite existing installation"""
        with self.runner.isolated_filesystem():
            # First install
            self.runner.invoke(cli, ['skills', 'add'])

            # Modify the skill file
            skill_path = None
            for p in [Path('.claude/skills/evals/SKILL.md'), Path('.agents/skills/evals/SKILL.md')]:
                if p.exists():
                    skill_path = p
                    break
            original_content = skill_path.read_text()
            skill_path.write_text('modified content')

            # Reinstall
            result = self.runner.invoke(cli, ['skills', 'add'])
            assert result.exit_code == 0

            # Should be restored
            assert skill_path.read_text() == original_content
