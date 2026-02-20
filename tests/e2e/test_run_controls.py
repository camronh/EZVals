"""
E2E tests for run control functionality: selection, start, stop, rerun.
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

from ezvals.server import create_app
from ezvals.storage import ResultsStore
from ezvals.discovery import EvalDiscovery
from ezvals.runner import EvalRunner

from conftest import run_server


def create_slow_eval_file(path: Path):
    """Create a test eval file with slow-running evaluations."""
    path.write_text('''
import time
from ezvals import eval, EvalResult

@eval(dataset="test_ds")
def slow_eval_1():
    time.sleep(2)
    return EvalResult(input="input1", output="output1")

@eval(dataset="test_ds")
def slow_eval_2():
    time.sleep(2)
    return EvalResult(input="input2", output="output2")

@eval(dataset="test_ds")
def slow_eval_3():
    time.sleep(2)
    return EvalResult(input="input3", output="output3")
''')


def create_fast_eval_file(path: Path):
    """Create a test eval file with fast evaluations."""
    path.write_text('''
from ezvals import eval, EvalResult

@eval(dataset="fast_ds")
def fast_eval_1():
    return EvalResult(input="in1", output="out1")

@eval(dataset="fast_ds")
def fast_eval_2():
    return EvalResult(input="in2", output="out2")

@eval(dataset="fast_ds")
def fast_eval_3():
    return EvalResult(input="in3", output="out3")

@eval(dataset="fast_ds")
def fast_eval_4():
    return EvalResult(input="in4", output="out4")
''')


def make_completed_summary():
    """Create a summary with all completed results for testing UI controls."""
    return {
        "total_evaluations": 3,
        "total_functions": 3,
        "total_errors": 0,
        "total_passed": 0,
        "total_with_scores": 0,
        "average_latency": 0.1,
        "results": [
            {
                "function": "eval_a",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i1", "output": "o1", "reference": None,
                    "scores": None, "error": None, "latency": 0.1,
                    "metadata": None, "status": "completed",
                },
            },
            {
                "function": "eval_b",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i2", "output": "o2", "reference": None,
                    "scores": None, "error": None, "latency": 0.1,
                    "metadata": None, "status": "completed",
                },
            },
            {
                "function": "eval_c",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i3", "output": "o3", "reference": None,
                    "scores": None, "error": None, "latency": 0.1,
                    "metadata": None, "status": "completed",
                },
            },
        ],
    }


class TestSelectionUI:
    """Tests for checkbox selection functionality."""

    def test_checkboxes_present(self, tmp_path):
        """Verify checkboxes are rendered for each row."""
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_completed_summary(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Verify select-all checkbox exists
                select_all = page.locator("#select-all-checkbox")
                expect(select_all).to_be_visible()

                # Verify row checkboxes exist (should be 3)
                row_checkboxes = page.locator(".row-checkbox")
                assert row_checkboxes.count() == 3

                browser.close()

    def test_individual_selection(self, tmp_path):
        """Test selecting individual rows keeps the run button stable."""
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_completed_summary(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Completed runs still show the stable "Run" label
                play_btn_text = page.locator("#play-btn-text")
                expect(play_btn_text).to_have_text("Run")

                # Select first two rows
                page.locator(".row-checkbox").nth(0).click()
                page.locator(".row-checkbox").nth(1).click()
                page.wait_for_timeout(200)

                # Button should still show "Run"
                expect(play_btn_text).to_have_text("Run")

                # Unselect all
                page.locator(".row-checkbox").nth(0).click()
                page.locator(".row-checkbox").nth(1).click()
                page.wait_for_timeout(200)

                # Button remains stable
                expect(play_btn_text).to_have_text("Run")

                browser.close()

    def test_select_all_checkbox(self, tmp_path):
        """Test select-all checkbox selects/deselects all visible rows."""
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_completed_summary(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Click select-all
                page.locator("#select-all-checkbox").click()
                page.wait_for_timeout(200)

                # All row checkboxes should be checked
                checked = page.locator(".row-checkbox:checked")
                assert checked.count() == 3

                # Button should still show "Run" (no mode switching)
                expect(page.locator("#play-btn-text")).to_have_text("Run")

                # Click select-all again to deselect
                page.locator("#select-all-checkbox").click()
                page.wait_for_timeout(200)

                checked = page.locator(".row-checkbox:checked")
                assert checked.count() == 0

                # Back to stable "Run" button
                expect(page.locator("#play-btn-text")).to_have_text("Run")

                browser.close()


class TestStopFunctionality:
    """Tests for stop button functionality."""

    def test_stop_marks_pending_as_cancelled(self, tmp_path, monkeypatch):
        """Test that clicking stop marks pending evals as cancelled."""
        # Change to tmp_path so load_config() reads from there (not project root)
        monkeypatch.chdir(tmp_path)

        # Create eval file with slow evals
        eval_file = tmp_path / "slow_evals.py"
        create_slow_eval_file(eval_file)

        # Discover functions
        discovery = EvalDiscovery()
        functions = discovery.discover(path=str(eval_file))

        # Create store and app - use default config path (.ezvals/runs)
        results_dir = tmp_path / ".ezvals" / "runs"
        store = ResultsStore(results_dir)
        run_id = store.generate_run_id()

        app = create_app(
            results_dir=str(results_dir),
            active_run_id=run_id,
            path=str(eval_file),
            discovered_functions=functions,
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Initial state should show "not_started" evals
                page.wait_for_selector('[data-status="not_started"]', timeout=5000)

                # Click play to start the run
                play_btn = page.locator("#play-btn")
                expect(play_btn).to_be_visible()
                play_btn.click()
                expect(page.locator("#play-btn-text")).to_have_text("Stop")

                # Click stop (button should now be in stop mode)
                play_btn = page.locator("#play-btn")
                play_btn.click()
                page.wait_for_timeout(500)

                # Refresh to see results
                page.reload()
                page.wait_for_selector("#results-table")

                # Should have cancelled status rows
                cancelled = page.locator('[data-status="cancelled"]')
                assert cancelled.count() > 0

                # Wait and verify no more results come in
                time.sleep(3)
                page.reload()
                page.wait_for_selector("#results-table")

                # Still should have cancelled (not overwritten)
                cancelled_after = page.locator('[data-status="cancelled"]')
                assert cancelled_after.count() > 0

                browser.close()


class TestRerunFunctionality:
    """Tests for rerun functionality."""

    def test_rerun_all_creates_new_run(self, tmp_path, monkeypatch):
        """Test that clicking play with no selection reruns all evals."""
        # Change to tmp_path so load_config() reads from there (not project root)
        monkeypatch.chdir(tmp_path)

        # Create fast eval file
        eval_file = tmp_path / "fast_evals.py"
        create_fast_eval_file(eval_file)

        # Seed completed run - use default config path (.ezvals/runs)
        results_dir = tmp_path / ".ezvals" / "runs"
        store = ResultsStore(results_dir)
        summary = make_completed_summary()
        run_id = store.save_run(summary, "2024-01-01T00-00-00Z")

        app = create_app(
            results_dir=str(results_dir),
            active_run_id=run_id,
            path=str(eval_file),
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # No selection, click play
                page.locator("#play-btn").click()

                # Verify the rerun created a new run with fast eval results.
                new_run_id = None
                deadline = time.time() + 30
                while time.time() < deadline:
                    for candidate_id in store.list_runs():
                        if candidate_id == run_id:
                            continue
                        data = store.load_run(candidate_id)
                        if any(r.get("dataset") == "fast_ds" for r in data.get("results", [])):
                            new_run_id = candidate_id
                            break
                    if new_run_id:
                        break
                    page.wait_for_timeout(500)
                else:
                    raise AssertionError("Timed out waiting for rerun to create a new run containing fast_ds")

                assert new_run_id is not None

                browser.close()

    def test_selective_rerun_updates_in_place(self, tmp_path, monkeypatch):
        """Test that selective rerun updates selected results in place."""
        # Change to tmp_path so load_config() reads from there (not project root)
        monkeypatch.chdir(tmp_path)

        # Create fast eval file
        eval_file = tmp_path / "fast_evals.py"
        create_fast_eval_file(eval_file)

        # Discover to get function names
        discovery = EvalDiscovery()
        functions = discovery.discover(path=str(eval_file))

        # Seed run with completed results - use default config path (.ezvals/runs)
        results_dir = tmp_path / ".ezvals" / "runs"
        store = ResultsStore(results_dir)

        results = [{
            "function": f.func.__name__,
            "dataset": f.dataset,
            "labels": f.labels,
            "result": {
                "input": f.context_kwargs.get("input"),
                "reference": f.context_kwargs.get("reference"),
                "metadata": f.context_kwargs.get("metadata"),
                "output": "old_output", "error": None, "scores": None, "latency": 0.1,
                "trace_data": None, "annotation": None, "annotations": None, "status": "completed",
            },
        } for f in functions]

        summary = EvalRunner._calculate_summary(results)
        summary["results"] = results
        run_id = store.save_run(summary, "2024-01-01T00-00-00Z")

        app = create_app(
            results_dir=str(results_dir),
            active_run_id=run_id,
            path=str(eval_file),
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Should have 4 results (from fast eval file)
                rows = page.locator("tr[data-row='main']")
                assert rows.count() == 4

                # Select first two rows
                page.locator(".row-checkbox").nth(0).click()
                page.locator(".row-checkbox").nth(1).click()
                page.wait_for_timeout(200)

                # Click play (selective rerun)
                page.locator("#play-btn").click()
                page.wait_for_timeout(500)

                # Refresh and verify all 4 results still present
                page.reload()
                page.wait_for_selector("#results-table")

                rows_after = page.locator("tr[data-row='main']")
                assert rows_after.count() == 4

                browser.close()


class TestPlayStopToggle:
    """Tests for play/stop button toggle behavior."""

    def test_button_shows_stop_when_running(self, tmp_path, monkeypatch):
        """Test that play button changes to stop when evals are running."""
        # Change to tmp_path so load_config() reads from there (not project root)
        monkeypatch.chdir(tmp_path)

        # Create slow eval file
        eval_file = tmp_path / "slow_evals.py"
        create_slow_eval_file(eval_file)

        discovery = EvalDiscovery()
        functions = discovery.discover(path=str(eval_file))

        # Use default config path (.ezvals/runs)
        results_dir = tmp_path / ".ezvals" / "runs"
        store = ResultsStore(results_dir)
        run_id = store.generate_run_id()

        app = create_app(
            results_dir=str(results_dir),
            active_run_id=run_id,
            path=str(eval_file),
            discovered_functions=functions,
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Initial state shows not_started
                page.wait_for_selector('[data-status="not_started"]', timeout=5000)

                # Fresh session (not_started) shows "Run"
                play_btn_text = page.locator("#play-btn-text")
                expect(play_btn_text).to_have_text("Run")

                # Click play to start
                play_btn = page.locator("#play-btn")
                play_btn.click()

                page.wait_for_function(
                    "() => {"
                    "  const txt = document.querySelector('#play-btn-text')?.textContent?.trim();"
                    "  const active = document.querySelectorAll(\"tr[data-row='main'][data-status='running'], tr[data-row='main'][data-status='pending']\").length > 0;"
                    "  return txt === 'Stop' || active;"
                    "}",
                    timeout=15000,
                )

                # Button should show "Stop"
                play_btn_text = page.locator("#play-btn-text")
                expect(play_btn_text).to_have_text("Stop")

                # Stop icon should be visible
                stop_icon = page.locator("#play-btn .stop-icon")
                expect(stop_icon).to_be_visible()

                browser.close()

    def test_button_shows_run_when_completed(self, tmp_path):
        """Test that play button stays as Run when run has completed."""
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_completed_summary(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Button should still show "Run"
                play_btn_text = page.locator("#play-btn-text")
                expect(play_btn_text).to_have_text("Run")

                # Play icon should be visible
                play_icon = page.locator("#play-btn .play-icon")
                expect(play_icon).to_be_visible()

                browser.close()

    def test_new_run_icon_creates_not_started_run(self, tmp_path, monkeypatch):
        """Test that stats-panel new-run icon creates a new run with not_started rows."""
        monkeypatch.chdir(tmp_path)
        eval_file = tmp_path / "fast_evals.py"
        create_fast_eval_file(eval_file)

        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_completed_summary(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id, path=str(eval_file))

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                previous_run_name = page.locator(".stats-run").inner_text().strip()
                previous_run_id = run_id

                page.locator("#new-run-btn-expanded").click()
                page.wait_for_timeout(800)
                page.reload()
                page.wait_for_selector("#results-table")

                if page.locator("#run-dropdown-expanded").count() > 0:
                    dropdown_text = (page.locator("#run-dropdown-expanded").inner_text() or "").strip()
                    new_run_name = dropdown_text.rsplit("(", 1)[0].strip()
                    if new_run_name.endswith("v"):
                        new_run_name = new_run_name[:-1].strip()
                else:
                    new_run_name = page.locator(".stats-run").inner_text().strip()
                current_run_id = page.evaluate(
                    "() => fetch('/results').then((r) => r.json()).then((d) => d.run_id)"
                )
                assert current_run_id != previous_run_id
                assert new_run_name != previous_run_name
                assert page.locator("tr[data-row='main']").count() == 4
                assert page.locator("tr[data-row='main'][data-status='not_started']").count() == 4

                browser.close()

    def test_pause_then_resume_flow(self, tmp_path, monkeypatch):
        """Pause should hold pending evals and resume should continue them."""
        monkeypatch.chdir(tmp_path)

        eval_file = tmp_path / "slow_evals.py"
        create_slow_eval_file(eval_file)

        discovery = EvalDiscovery()
        functions = discovery.discover(path=str(eval_file))

        results_dir = tmp_path / ".ezvals" / "runs"
        store = ResultsStore(results_dir)
        run_id = store.generate_run_id()

        app = create_app(
            results_dir=str(results_dir),
            active_run_id=run_id,
            path=str(eval_file),
            discovered_functions=functions,
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                page.locator("#play-btn").click()
                page.wait_for_selector('[data-status="running"], [data-status="pending"]', timeout=15000)

                pause_btn = page.locator("#pause-btn")
                expect(pause_btn).to_be_visible()
                expect(pause_btn).to_have_attribute("aria-label", "Pause")

                pause_btn.click()
                page.wait_for_timeout(2500)
                page.reload()
                page.wait_for_selector("#results-table")

                expect(pause_btn).to_have_attribute("aria-label", "Resume")
                assert page.locator('[data-status="completed"]').count() >= 1
                assert page.locator('[data-status="pending"]').count() >= 1

                page.locator("#pause-btn").click()

                deadline = time.time() + 10
                while time.time() < deadline:
                    page.reload()
                    page.wait_for_selector("#results-table")
                    if page.locator('[data-status="running"], [data-status="pending"]').count() == 0:
                        break
                    time.sleep(0.4)
                else:
                    raise AssertionError("resume did not finish pending evaluations")

                assert page.locator('[data-status="completed"]').count() == 3

                browser.close()
