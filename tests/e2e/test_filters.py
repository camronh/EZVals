import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

from ezvals.server import create_app
from ezvals.storage import ResultsStore

# Import run_server from conftest in same directory
sys.path.insert(0, str(Path(__file__).parent))
from conftest import run_server
sys.path.pop(0)


def make_summary_with_scores():
    return {
        "total_evaluations": 3,
        "total_functions": 3,
        "total_errors": 0,
        "total_passed": 0,
        "total_with_scores": 3,
        "average_latency": 0.0,
        "results": [
            {
                "function": "f1",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i1",
                    "output": "o1",
                    "reference": None,
                    "scores": [
                        {"key": "accuracy", "value": 0.91, "passed": True},
                        {"key": "fluency", "value": 0.8},
                    ],
                    "error": None,
                    "latency": 1.2,
                    "metadata": None,
                    "annotation": "good",
                },
            },
            {
                "function": "f2",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i2",
                    "output": "o2",
                    "reference": None,
                    "scores": [
                        {"key": "accuracy", "value": 0.7, "passed": False},
                    ],
                    "error": None,
                    "latency": 0.4,
                    "metadata": None,
                    "annotation": None,
                },
            },
            {
                "function": "f3",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i3",
                    "output": "o3",
                    "reference": None,
                    "scores": [
                        {"key": "fluency", "value": 0.95},
                    ],
                    "error": None,
                    "latency": 0.2,
                    "metadata": None,
                    "annotation": "note",
                },
            },
        ],
    }


def test_advanced_filters_ui(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary_with_scores(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Open filters from Scores header icon
            btn = page.locator("#filters-toggle")
            btn.click()
            # Menu visible (React UI uses .active class when open)
            page.wait_for_selector("#filters-menu.active")
            menu_box = page.eval_on_selector('#filters-menu', 'el => el.getBoundingClientRect()')
            vp = page.viewport_size
            assert menu_box['left'] >= 0
            assert menu_box['right'] <= vp['width']

            # Clicking again should close
            btn.click()
            page.wait_for_selector("#filters-menu:not(.active)", state='attached')

            # Open again for adding rules
            btn.click()
            page.wait_for_selector("#filters-menu.active")
            # Wait for options to be populated (attached, not visible - options are inside select)
            page.wait_for_selector("#key-select option[value='accuracy']", state='attached')
            page.select_option("#key-select", value="accuracy")
            page.select_option("#fv-op", value=">")
            page.fill("#fv-val", "0.8")
            page.click("#add-fv")

            # Expect only f1 (accuracy=0.91) visible among rows with accuracy
            mains = page.locator("tbody tr[data-row='main']").filter(has_text="f1")
            expect(mains.first).to_be_visible()
            # Row with accuracy=0.7 should be filtered out (not in DOM)
            hidden_row = page.locator("tbody tr[data-row='main']").filter(has_text="f2")
            expect(hidden_row).to_have_count(0)

            # Has Annotation = yes should further filter to f1 and f3
            # Click the "Has Note" button to enable annotation filter (cycles: any -> yes)
            page.click("#filter-has-annotation")
            # Filters are active - stats panel should show filtered/total format
            # Check that the metric divisor appears (indicates filtered state)
            expect(page.locator(".stats-metric-divisor")).to_be_visible()

            # Dynamic key type detection: fluency has numeric only -> value section visible, passed hidden
            # Ensure menu is visible before interacting with selects
            page.wait_for_selector("#filters-menu.active")
            page.wait_for_selector("#key-select option[value='fluency']", state='attached')
            page.select_option("#key-select", value="fluency")
            expect(page.locator("#value-section")).to_be_visible()
            expect(page.locator("#passed-section")).to_be_hidden()
            # accuracy has both value and passed (in this fixture) -> passed visible at least
            page.select_option("#key-select", value="accuracy")
            expect(page.locator("#passed-section")).to_be_visible()
            browser.close()


def test_filters_from_launch_query(tmp_path):
    """Readable query params should apply search + filters before first render."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary_with_scores(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    query = "search=f3&annotation=yes"

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(f"{url}?{query}")
            page.wait_for_selector("#results-table")

            rows = page.locator("tbody tr[data-row='main']")
            expect(rows).to_have_count(1)
            expect(rows.first).to_contain_text("f3")
            browser.close()
