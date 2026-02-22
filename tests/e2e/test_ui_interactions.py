import json
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




def test_sort_and_toggle_columns(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            # Sort by latency ascending (one click)
            page.locator("thead th[data-col='latency']").click()
            first_func = page.locator("tbody tr[data-row='main'] td[data-col='function'] a").first
            expect(first_func).to_contain_text("b")  # 0.1s row should be first

            # Toggle Output column visibility off
            page.locator("#more-menu-toggle").click()
            page.locator("#columns-toggle").click()
            cb = page.locator("#columns-menu input[data-col='output']")
            # Ensure checked then uncheck
            if cb.is_checked():
                cb.uncheck()
            # Some cells should have hidden class
            hidden_outputs = page.locator("tbody td[data-col='output'].hidden")
            assert hidden_outputs.count() > 0
            browser.close()


def test_not_started_function_name_navigates_to_detail(tmp_path):
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
                    "function": "pending_eval",
                    "dataset": "ds",
                    "labels": [],
                    "result": {
                        "status": "not_started",
                        "input": "i1",
                        "output": None,
                        "reference": None,
                        "scores": None,
                        "error": None,
                        "latency": None,
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
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            pending_link = page.locator("tr[data-row='main'][data-status='not_started'] td[data-col='function'] a").first
            expect(pending_link).to_be_visible()
            expect(pending_link).to_have_attribute("href", re.compile(r"/runs/.+/results/0"))
            pending_link.click()
            page.wait_for_url(f"**/runs/{run_id}/results/0")
            browser.close()


def test_column_resize_changes_header_width(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1600, "height": 900})
            page.goto(url)
            page.wait_for_selector("#results-table")

            input_header = page.locator("thead th[data-col='input']").first
            start_box = input_header.bounding_box()
            assert start_box is not None

            resize_handle = input_header.locator(".col-resizer")
            handle_box = resize_handle.bounding_box()
            assert handle_box is not None

            drag_x = handle_box["x"] + (handle_box["width"] / 2)
            drag_y = handle_box["y"] + (handle_box["height"] / 2)
            start_edge = start_box["x"] + start_box["width"]
            page.mouse.move(drag_x, drag_y)
            page.mouse.down()
            page.mouse.move(drag_x + 5, drag_y)
            page.wait_for_timeout(20)
            mid_box = input_header.bounding_box()
            assert mid_box is not None
            mid_edge = mid_box["x"] + mid_box["width"]
            assert abs((mid_edge - start_edge) - 5) < 25
            page.mouse.move(drag_x + 120, drag_y)
            page.mouse.up()

            page.wait_for_timeout(50)
            end_box = input_header.bounding_box()
            assert end_box is not None
            assert end_box["width"] > start_box["width"] + 20
            assert page.evaluate("new URLSearchParams(window.location.search).getAll('sort').length") == 0
            expect(input_header).to_have_attribute("aria-sort", "none")

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
            expect(page.locator("button[title='Edit annotation']")).to_be_visible()

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


def test_detail_page_dataset_link_opens_filtered_dashboard(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            page.goto(f"{url}/runs/{run_id}/results/0")
            page.wait_for_selector("#sidebar-panel a[href*='dataset_in=ds']")
            dataset_link = page.locator("#sidebar-panel a[href*='dataset_in=ds']").first
            expect(dataset_link).to_have_text("ds")
            dataset_link.click()

            page.wait_for_url("**/?**")
            page.wait_for_selector("#results-table")
            assert page.evaluate("new URLSearchParams(window.location.search).get('dataset_in')") == "ds"
            assert page.evaluate("new URLSearchParams(window.location.search).get('run_id')") == run_id

            browser.close()


def test_detail_page_score_editing_persists(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_scored_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            page.goto(f"{url}/runs/{run_id}/results/0")
            page.wait_for_selector("text=Scores")
            page.locator("button[title='Edit score']").first.click()

            expect(page.locator("input[placeholder='Value (number or text)']")).to_have_count(0)
            page.locator("select").select_option("false")
            page.locator("textarea[placeholder='Notes...']").fill("manual override")
            page.locator("button:has-text('Save')").click()
            page.wait_for_selector("button[title='Edit score']")

            page.locator("button[title='Edit score']").nth(1).click()
            expect(page.locator("select")).to_have_count(0)
            page.locator("input[placeholder='Value (number or text)']").fill("0.93")
            page.locator("textarea[placeholder='Notes...']").fill("manual override value")
            page.locator("button:has-text('Save')").click()

            expect(page.locator("text=0.93")).to_be_visible()
            expect(page.locator("text=manual override value")).to_be_visible()
            page.reload()
            page.wait_for_selector("text=Scores")
            expect(page.locator("text=0.93")).to_be_visible()
            expect(page.locator("text=manual override value")).to_be_visible()

            browser.close()

    persisted = store.load_run(run_id)
    score_bool = persisted["results"][0]["result"]["scores"][0]
    score_value = persisted["results"][0]["result"]["scores"][1]
    assert score_bool["passed"] is False
    assert "value" not in score_bool
    assert score_bool["notes"] == "manual override"
    assert score_value["value"] == 0.93
    assert "passed" not in score_value
    assert score_value["notes"] == "manual override value"



# Sticky headers are intentionally disabled per product decision; related test removed.
# Inline editing tests removed - editing now happens on detail page.
# Row-click-to-expand removed - replaced with cell hover preview popover.


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


def test_results_table_annotation_indicator_hover_preview(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    summary = make_summary()
    summary["results"][0]["result"]["annotation"] = "Single-run note shown in popover."
    run_id = store.save_run(summary, "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            row = page.locator("tbody tr[data-row='main']").filter(
                has=page.locator("td[data-col='function'] a", has_text="a")
            ).first
            indicator = row.locator("td[data-col='output'] [data-preview-target='annotation']").first
            expect(indicator).to_be_visible()
            indicator.hover()
            page.wait_for_timeout(500)

            popover = page.locator(".cell-preview-popover")
            expect(popover).to_be_visible()
            expect(popover.locator(".cell-preview-label")).to_have_text("Annotation")
            expect(popover).to_contain_text("Single-run note shown in popover.")

            browser.close()


def test_results_table_annotation_popover_edit_and_save(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    summary = make_summary()
    summary["results"][0]["result"]["annotation"] = "Original annotation"
    run_id = store.save_run(summary, "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            row = page.locator("tbody tr[data-row='main']").filter(
                has=page.locator("td[data-col='function'] a", has_text="a")
            ).first
            indicator = row.locator("td[data-col='output'] [data-preview-target='annotation']").first
            indicator.hover()
            page.wait_for_timeout(500)

            popover = page.locator(".cell-preview-popover")
            expect(popover).to_be_visible()
            expect(popover).to_contain_text("Original annotation")

            indicator.click()
            editor = popover.locator("textarea[data-annotation-editor='true']")
            expect(editor).to_be_visible()
            editor.fill("Updated from popover")
            popover.locator("button[data-annotation-save='true']").click()

            page.reload()
            page.wait_for_selector("#results-table")
            row = page.locator("tbody tr[data-row='main']").filter(
                has=page.locator("td[data-col='function'] a", has_text="a")
            ).first
            expect(row).to_have_attribute("data-annotation", "Updated from popover")

            browser.close()

    persisted = store.load_run(run_id)
    assert persisted["results"][0]["result"]["annotation"] == "Updated from popover"


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


def test_settings_modal_saves_completion_notifications_to_config(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(make_summary(), "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(permissions=["notifications"])
            page = context.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            page.locator("#settings-toggle").click()
            page.wait_for_selector("#settings-modal")
            notifications_toggle = page.locator("#settings-completion-notifications")
            expect(notifications_toggle).not_to_be_checked()

            notifications_toggle.check()
            page.locator("#settings-form button[type='submit']").click()
            expect(page.locator("#settings-modal")).to_have_class(re.compile(r"hidden"))

            cfg_resp = requests.get(f"{url}/api/config", timeout=5)
            assert cfg_resp.status_code == 200
            cfg = cfg_resp.json()
            assert cfg["completion_notifications"] is True

            context.close()
            browser.close()


def test_run_completion_sends_browser_notification_when_enabled(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ezvals.json").write_text(json.dumps({
        "concurrency": 1,
        "results_dir": str(tmp_path / "runs"),
        "overwrite": True,
        "completion_notifications": True,
    }))

    running_summary = {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 0,
        "total_with_scores": 0,
        "average_latency": 0.0,
        "results": [
            {
                "function": "eval_running",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "status": "running",
                    "input": "i",
                    "output": None,
                    "reference": None,
                    "scores": None,
                    "error": None,
                    "latency": None,
                    "metadata": None,
                },
            }
        ],
    }
    completed_summary = {
        **running_summary,
        "total_passed": 1,
        "results": [
            {
                **running_summary["results"][0],
                "result": {
                    **running_summary["results"][0]["result"],
                    "status": "completed",
                    "output": "ok",
                    "latency": 0.1,
                },
            }
        ],
    }

    store = ResultsStore(tmp_path / "runs")
    run_id = store.save_run(running_summary, run_id="run-notify")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.add_init_script(
                """
                class FakeNotification {
                    static permission = 'granted'
                    static requestPermission() { return Promise.resolve('granted') }
                    constructor(title, options) {
                        window.__notifCount = (window.__notifCount || 0) + 1
                        window.__notifTitle = title
                        window.__notifBody = options?.body || ''
                        window.__notifIcon = options?.icon || ''
                    }
                }
                window.Notification = FakeNotification
                window.__notifCount = 0
                """
            )
            page.goto(url)
            page.wait_for_selector("#results-table")
            assert page.evaluate("window.__notifCount") == 0

            run_file = store._find_run_file(run_id)
            run_file.write_text(json.dumps(completed_summary))

            page.wait_for_function("() => window.__notifCount === 1")
            assert "complete" in page.evaluate("window.__notifTitle").lower()
            assert page.evaluate("window.__notifIcon") == "/logo.png"
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

            page.locator("#more-menu-toggle").click()
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
