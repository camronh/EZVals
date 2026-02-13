import re

from playwright.sync_api import sync_playwright, expect
import requests

from ezvals.server import create_app
from ezvals.storage import ResultsStore

from conftest import run_server


def make_summary():
    return {
        "total_evaluations": 2,
        "total_functions": 2,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 0.0,
        "results": [
            {
                "function": "a",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "long input " * 80,
                    "output": "long output " * 80,
                    "reference": None,
                    "scores": None,
                    "error": None,
                    "latency": 1.2,
                    "metadata": {
                        "model_name": "gpt-5-mini",
                        "run_url": "https://example.com/runs/123",
                        "token_count": 42,
                    },
                },
            },
            {
                "function": "c",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i3",
                    "output": "o3",
                    "reference": None,
                    "scores": None,
                    "error": None,
                    "latency": 0.2,
                    "metadata": None,
                },
            },
            {
                "function": "b",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i2",
                    "output": "o2",
                    "reference": None,
                    "scores": None,
                    "error": None,
                    "latency": 0.1,
                    "metadata": None,
                },
            },
        ],
    }


def make_scored_summary():
    return {
        "total_evaluations": 2,
        "total_functions": 2,
        "total_errors": 0,
        "total_passed": 2,
        "total_with_scores": 2,
        "average_latency": 0.42,
        "score_chips": [
            {"key": "accuracy", "type": "ratio", "passed": 2, "total": 2},
            {"key": "coherence", "type": "avg", "avg": 0.78, "count": 2},
        ],
        "results": [
            {
                "function": "eval_a",
                "dataset": "ds",
                "labels": ["prod"],
                "result": {
                    "input": "q1",
                    "output": "a1",
                    "reference": None,
                    "scores": [
                        {"key": "accuracy", "value": True, "passed": True},
                        {"key": "coherence", "value": 0.8, "passed": True},
                    ],
                    "error": None,
                    "latency": 0.4,
                    "metadata": None,
                },
            },
            {
                "function": "eval_b",
                "dataset": "ds",
                "labels": ["prod"],
                "result": {
                    "input": "q2",
                    "output": "a2",
                    "reference": None,
                    "scores": [
                        {"key": "accuracy", "value": True, "passed": True},
                        {"key": "coherence", "value": 0.76, "passed": True},
                    ],
                    "error": None,
                    "latency": 0.44,
                    "metadata": None,
                },
            },
        ],
    }




def test_row_expand_sort_and_toggle_columns(tmp_path):
    # Seed a run JSON
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")

    # Create app bound to that run
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            # Wait for HTMX content
            page.wait_for_selector("#results-table")

            # Click first row to expand it (not navigate)
            first_row = page.locator("tbody tr[data-row='main']").nth(0)
            first_row.click()
            # Row should have expanded class
            expect(first_row).to_have_class(re.compile(r"expanded"))

            # Click again to collapse
            first_row.click()
            expect(first_row).not_to_have_class(re.compile(r"expanded"))

            # Click function name to navigate to detail page
            page.locator("tbody tr[data-row='main'] td[data-col='function'] a").first.click()
            page.wait_for_url(f"**/runs/{run_id}/results/0")
            # Detail page shows result counter in format "1/3"
            expect(page.locator("text=1/3")).to_be_visible()

            # Navigate back and test sorting
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Sort by latency ascending (one click)
            page.locator("thead th[data-col='latency']").click()
            first_func = page.locator("tbody tr[data-row='main'] td[data-col='function'] a").first
            expect(first_func).to_contain_text("b")  # 0.1s row should be first

            # Toggle Output column visibility off
            page.locator("#columns-toggle").click()
            cb = page.locator("#columns-menu input[data-col='output']")
            # Ensure checked then uncheck
            if cb.is_checked():
                cb.uncheck()
            # Some cells should have hidden class
            hidden_outputs = page.locator("tbody td[data-col='output'].hidden")
            assert hidden_outputs.count() > 0
            browser.close()


def test_detail_page_navigation(tmp_path):
    """Test navigating to detail page and keyboard navigation."""
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            # Go directly to detail page
            page.goto(f"{url}/runs/{run_id}/results/0")
            # Detail page shows result counter in format "1/3"
            expect(page.locator("text=1/3")).to_be_visible()
            # Function name should be visible in the header
            expect(page.locator("span.font-mono.font-semibold")).to_contain_text("a")

            # Use arrow key to navigate to next
            page.keyboard.press("ArrowDown")
            page.wait_for_url(f"**/runs/{run_id}/results/1")
            expect(page.locator("text=2/3")).to_be_visible()

            # Use arrow key to navigate back
            page.keyboard.press("ArrowUp")
            page.wait_for_url(f"**/runs/{run_id}/results/0")
            expect(page.locator("text=1/3")).to_be_visible()

            # Press Escape to go back to table
            page.keyboard.press("Escape")
            page.wait_for_url("**/")
            page.wait_for_selector("#results-table")

            browser.close()


def test_row_click_no_expand_when_content_fits(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(
        {
            "total_evaluations": 1,
            "total_functions": 1,
            "total_errors": 0,
            "total_passed": 0,
            "total_with_scores": 0,
            "average_latency": 0.0,
            "results": [
                {
                    "function": "short_row",
                    "dataset": "ds",
                    "labels": [],
                    "result": {
                        "input": "short",
                        "output": "tiny",
                        "reference": None,
                        "scores": None,
                        "error": None,
                        "latency": 0.3,
                        "metadata": None,
                    },
                }
            ],
        },
        "2024-01-01T00-00-00Z",
    )
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 2400, "height": 900})
            page.goto(url)
            page.wait_for_selector("#results-table")

            row = page.locator("tbody tr[data-row='main']").first
            input_cell = row.locator("td[data-col='input']")
            assert input_cell.evaluate("el => window.getComputedStyle(el).verticalAlign") == "middle"
            row.click()
            assert input_cell.evaluate("el => window.getComputedStyle(el).verticalAlign") == "middle"

            browser.close()


# Sticky headers are intentionally disabled per product decision; related test removed.
# Inline editing tests removed - editing now happens on detail page.


def test_metadata_renders_as_key_values_with_links(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            page.goto(f"{url}/runs/{run_id}/results/0")
            metadata_header = page.locator("button:has-text('Metadata')")
            expect(metadata_header).to_be_visible()
            expect(page.locator("dt:has-text('Model Name')")).to_be_visible()
            expect(page.locator("dt:has-text('Run Url')")).to_be_visible()
            expect(page.locator("dt:has-text('Token Count')")).to_be_visible()

            link = page.locator("a[href='https://example.com/runs/123']")
            expect(link).to_be_visible()
            expect(link).to_have_text("https://example.com/runs/123")

            browser.close()


def test_restart_endpoint_sets_restart_requested_flag(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    assert app.state.restart_requested is False

    with run_server(app) as url:
        resp = requests.post(f"{url}/api/server/restart", timeout=5)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    assert app.state.restart_requested is True


def test_reload_server_button_posts_restart_endpoint(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            with page.expect_request("**/api/server/restart") as req:
                page.locator("#more-menu-toggle").click()
                page.wait_for_selector("#more-menu")
                page.locator("#restart-server-btn").click()

            assert req.value.method == "POST"
            expect(page.locator("#restart-server-btn")).to_be_disabled()
            assert app.state.restart_requested is True

            browser.close()


def test_png_export_modal_allows_configurable_preview(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_a = store.save_run(
        make_scored_summary(),
        run_id="runaaaaa",
        session_name="pngmodal",
        run_name="alpha",
    )
    run_b = store.save_run(
        make_scored_summary(),
        run_id="runbbbbb",
        session_name="pngmodal",
        run_name="beta",
    )
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_a)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(f"{url}?compare_run_id={run_a}&compare_run_id={run_b}")
            page.wait_for_selector("#results-table")

            page.locator("#export-toggle").click()
            page.locator("#export-png-btn").click()
            page.wait_for_selector("#png-export-modal")
            assert page.locator("#png-export-title-input").count() == 0, "config should be collapsed by default"
            page.locator("#png-export-config-toggle").click()
            page.wait_for_selector("#png-export-title-input")
            expect(page.locator("#png-export-title-input")).to_have_value("pngmodal")
            assert page.locator("#png-export-size-select").count() == 0, "size selector should not be shown"

            page.wait_for_function(
                """
                () => {
                    const modal = document.querySelector('#png-export-modal')
                    if (!modal) return false
                    return !!modal.querySelector("img[alt='Export preview']")
                        || (modal.textContent || '').includes('Failed to generate preview')
                }
                """
            )
            assert page.locator("#png-export-modal", has_text="Failed to generate preview").count() == 0, "PNG preview should not fail"

            preview = page.locator("#png-export-modal img[alt='Export preview']")
            expect(preview).to_be_visible()
            initial_src = preview.get_attribute("src")
            assert initial_src and initial_src.startswith("data:image/png"), "PNG preview should render"
            page.evaluate(
                """
                (value) => {
                    window.__pngPreviewBefore = value
                }
                """,
                initial_src,
            )

            page.locator("#png-export-title-input").fill("Executive scorecard")
            page.locator("#png-export-score-good-color").fill("#2563eb")
            page.locator(f"input[data-png-run-name='{run_a}']").fill("Control")
            page.locator(f"input[data-png-run-color='{run_a}']").fill("#0ea5e9")
            page.locator("#png-export-show-latency").uncheck()
            page.locator(f"button[data-png-run-move-down='{run_a}']").click()
            expect(page.locator("input[data-png-run-name]").first).to_have_value("beta")

            page.wait_for_function(
                """
                () => {
                    const img = document.querySelector('#png-export-modal img[alt="Export preview"]')
                    return !!img
                        && !!img.getAttribute('src')
                        && img.getAttribute('src') !== window.__pngPreviewBefore
                }
                """
            )

            expect(page.locator("#png-export-modal")).not_to_contain_text("1600 x 840px")
            expect(page.locator(f"input[data-png-run-name='{run_a}']")).to_have_value("Control")
            browser.close()
