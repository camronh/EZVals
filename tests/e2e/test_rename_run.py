"""E2E tests for run rename functionality."""

import json

from playwright.sync_api import sync_playwright, expect

from conftest import run_server
from ezvals.server import create_app
from ezvals.storage import ResultsStore


def make_test_run():
    return {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 0.5,
        "session_name": "test-session",
        "run_name": "original-name",
        "results": [
            {
                "function": "test_func",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i1",
                    "output": "o1",
                    "reference": None,
                    "scores": [{"key": "accuracy", "passed": True}],
                    "error": None,
                    "latency": 0.5,
                    "metadata": None,
                    "status": "completed",
                },
            },
        ],
    }


def test_rename_run_via_pencil_button(tmp_path):
    """Clicking pencil icon allows inline editing of run name."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_test_run(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Use expanded view (default) - React UI uses .stats-run class
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("original-name")

            # Hover over the run row to reveal edit button
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            edit_btn = page.locator(".edit-run-btn-expanded")
            edit_btn.click()

            # Input should appear (React uses inline input in stats-info-row)
            input_field = page.locator(".stats-info-row input")
            expect(input_field).to_be_visible()

            # Clear and type new name
            input_field.fill("renamed-run")
            input_field.press("Enter")

            # Wait for UI to refresh and verify new name
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("renamed-run")

            browser.close()

    # Verify the JSON file was updated (file is in "default" session since no session_name param)
    session_dir = tmp_path / "runs" / "default"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "renamed-run"
    assert "renamed-run" in json_files[0].name


def test_rename_run_escape_cancels(tmp_path):
    """Pressing Escape cancels the rename operation."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_test_run(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Use expanded view (default)
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            page.locator(".edit-run-btn-expanded").click()

            # Type new name but press Escape
            input_field = page.locator(".stats-info-row input")
            input_field.fill("should-not-save")
            input_field.press("Escape")

            # Wait for UI to refresh and verify original name remains
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("original-name")

            browser.close()

    # Verify the JSON file was NOT changed (file is in "default" session)
    session_dir = tmp_path / "runs" / "default"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "original-name"


def test_rename_run_via_checkmark_button(tmp_path):
    """Pressing Enter saves the rename."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_test_run(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Use expanded view (default)
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            edit_btn = page.locator(".edit-run-btn-expanded")
            edit_btn.click()

            # Type new name and press Enter to save
            input_field = page.locator(".stats-info-row input")
            input_field.fill("checkmark-saved")
            input_field.press("Enter")

            # Wait for UI to refresh and verify new name
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("checkmark-saved")

            browser.close()

    # Verify JSON file was updated
    session_dir = tmp_path / "runs" / "default"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "checkmark-saved"


def test_rename_run_blur_cancels(tmp_path):
    """Clicking away (blur) cancels the rename."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_test_run(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Use expanded view (default)
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            page.locator(".edit-run-btn-expanded").click()

            # Type new name then click elsewhere to blur
            input_field = page.locator(".stats-info-row input")
            input_field.fill("should-not-save-blur")
            page.locator("body").click()  # Click elsewhere to trigger blur

            # Wait for UI to refresh and verify original name remains
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("original-name")

            browser.close()

    # Verify JSON file was NOT changed
    session_dir = tmp_path / "runs" / "default"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "original-name"


def test_rename_run_expanded_view(tmp_path):
    """Rename works in expanded stats view."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_test_run(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Expanded view is the default - hover over run row to reveal edit button
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            edit_btn = page.locator(".edit-run-btn-expanded")
            edit_btn.click()

            # Type new name and press Enter
            input_field = page.locator(".stats-info-row input")
            expect(input_field).to_be_visible()
            input_field.fill("expanded-renamed")
            input_field.press("Enter")

            # Wait for UI to refresh and verify new name
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("expanded-renamed")

            browser.close()

    # Verify JSON file was updated
    session_dir = tmp_path / "runs" / "default"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "expanded-renamed"


def test_set_pending_run_name_before_run(tmp_path):
    """Can set run name before any run exists via pending-run-name endpoint."""
    from starlette.testclient import TestClient

    # Create app with no existing run (just discovered functions)
    app = create_app(
        results_dir=str(tmp_path / "runs"),
        active_run_id="",  # No active run
        session_name="test-session",
        run_name="auto-generated",
    )

    client = TestClient(app)

    # Set pending run name via API
    response = client.put(
        "/api/pending-run-name",
        json={"run_name": "my-custom-name"},
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["run_name"] == "my-custom-name"

    # Verify app.state was updated
    assert app.state.run_name == "my-custom-name"


def test_rename_run_before_running_via_ui(tmp_path):
    """E2E test: Edit run name in UI before any run, then run and verify the name is used."""
    from pathlib import Path
    from ezvals.discovery import EvalDiscovery
    from ezvals.storage import ResultsStore

    # Create a simple eval file
    eval_dir = tmp_path / "evals"
    eval_dir.mkdir()
    eval_file = eval_dir / "test_eval.py"
    eval_file.write_text('''
from ezvals import eval, EvalResult

@eval(dataset="test_ds")
def simple_eval():
    return EvalResult(input="test", output="result")
''')

    # Discover functions
    discovery = EvalDiscovery()
    functions = discovery.discover(path=str(eval_file))

    # Create store and generate run_id
    store = ResultsStore(tmp_path / "runs")
    run_id = store.generate_run_id()

    # Create app with discovered functions but no run on disk yet
    app = create_app(
        results_dir=str(tmp_path / "runs"),
        active_run_id=run_id,
        path=str(eval_file),
        session_name="test-session",
        run_name="auto-generated",
        discovered_functions=functions,
    )

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Verify initial run name in expanded view (React uses .stats-run)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("auto-generated")

            # Edit the run name before running
            run_row = page.locator(".stats-info-row:has(.stats-run)")
            run_row.hover()
            edit_btn = page.locator(".edit-run-btn-expanded")
            edit_btn.click()

            # Type new name and save
            input_field = page.locator(".stats-info-row input")
            expect(input_field).to_be_visible()
            input_field.fill("my-custom-name")
            input_field.press("Enter")

            # Wait for UI to refresh and verify new name is shown
            page.wait_for_timeout(500)
            run_text = page.locator(".stats-run")
            expect(run_text).to_contain_text("my-custom-name")

            # Now click Run to trigger the first run
            play_btn = page.locator("#play-btn")
            play_btn.click()

            # Wait for run to complete
            page.wait_for_timeout(2000)

            browser.close()

    # Verify the run file was created with the custom name
    session_dir = tmp_path / "runs" / "test-session"
    json_files = list(session_dir.glob("*.json"))
    assert len(json_files) == 1
    data = json.loads(json_files[0].read_text())
    assert data["run_name"] == "my-custom-name"
    assert "my-custom-name" in json_files[0].name
