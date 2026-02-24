"""E2E tests for UI fixes from pokebench testing."""

import re
import time
import urllib.parse

from playwright.sync_api import sync_playwright, expect

from ezvals.discovery import EvalDiscovery
from ezvals.server import create_app
from ezvals.storage import ResultsStore

from conftest import run_server


def make_summary_with_error():
    """Summary with an errored result to test skeleton clearing."""
    return {
        "total_evaluations": 2,
        "total_functions": 2,
        "total_errors": 1,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 0.5,
        "results": [
            {
                "function": "test_pass",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "input1",
                    "output": "output1",
                    "reference": "ref1",
                    "scores": [{"key": "accuracy", "passed": True}],
                    "error": None,
                    "latency": 0.3,
                    "metadata": None,
                    "status": "completed",
                },
            },
            {
                "function": "test_error",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "input2",
                    "output": None,
                    "reference": None,
                    "scores": [],
                    "error": "RuntimeError: Something went wrong",
                    "latency": 0.7,
                    "metadata": None,
                    "status": "error",
                },
            },
        ],
    }


def make_summary_with_messages():
    """Summary with trace_data messages for tool display tests."""
    return {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 1.0,
        "results": [
            {
                "function": "test_with_messages",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "test input",
                    "output": "final output",
                    "reference": "expected output",
                    "scores": [{"key": "correct", "passed": True}],
                    "error": None,
                    "latency": 1.0,
                    "metadata": None,
                    "status": "completed",
                    "trace_data": {
                        "trace_url": "https://example.com/trace/123",
                        "messages": [
                            {"role": "user", "content": "Hello"},
                            {
                                "role": "assistant",
                                "content": "Let me help",
                                "tool_calls": [
                                    {
                                        "id": "call_abc123",
                                        "name": "get_data",
                                        "args": {"query": "test", "limit": 10},
                                    }
                                ],
                            },
                            {
                                "role": "tool",
                                "tool_call_id": "call_abc123",
                                "content": '{"results": [1, 2, 3]}',
                            },
                            {"role": "assistant", "content": "Here are your results"},
                        ],
                    },
                },
            },
        ],
    }


def make_summary_with_two_detail_rows():
    return {
        "total_evaluations": 2,
        "total_functions": 2,
        "total_errors": 0,
        "total_passed": 2,
        "total_with_scores": 2,
        "average_latency": 0.4,
        "results": [
            {
                "function": "first_case",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "input 1",
                    "output": "output 1",
                    "reference": "ref 1",
                    "scores": [{"key": "correct", "passed": True}],
                    "error": None,
                    "latency": 0.3,
                    "metadata": None,
                    "status": "completed",
                },
            },
            {
                "function": "second_case",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "input 2",
                    "output": "output 2",
                    "reference": "ref 2",
                    "scores": [{"key": "correct", "passed": True}],
                    "error": None,
                    "latency": 0.5,
                    "metadata": None,
                    "status": "completed",
                },
            },
        ],
    }


def make_summary_with_long_chip_text():
    long_dataset = "dataset_with_an_extremely_long_name_that_should_be_truncated_in_chip_ui_components"
    long_label = "label_with_an_extremely_long_name_that_should_be_truncated_in_chip_ui_components"
    return {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 0,
        "average_latency": 0.1,
        "results": [
            {
                "function": "long_chip_test",
                "dataset": long_dataset,
                "labels": [long_label],
                "result": {
                    "input": "input",
                    "output": "output",
                    "reference": None,
                    "scores": [],
                    "error": None,
                    "latency": 0.1,
                    "metadata": None,
                    "status": "completed",
                },
            }
        ],
    }


def make_summary_with_message_array_tool_schemas():
    """Summary with mixed tool-call schemas to validate tool name extraction."""
    return {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 1.0,
        "results": [
            {
                "function": "test_with_mixed_tool_schemas",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "test input",
                    "output": "final output",
                    "reference": None,
                    "scores": [{"key": "correct", "passed": True}],
                    "error": None,
                    "latency": 1.0,
                    "metadata": None,
                    "status": "completed",
                    "trace_data": {
                        "messages": [
                            {"role": "user", "content": "Find details"},
                            {
                                "role": "assistant",
                                "tool_calls": [
                                    {
                                        "id": "call_openai_1",
                                        "function": {
                                            "name": "search_docs",
                                            "arguments": '{"query":"evals"}',
                                        },
                                    },
                                    {
                                        "id": "call_openai_2",
                                        "name": "fetch_page",
                                        "args": {"url": "https://example.com"},
                                    },
                                ],
                            },
                            {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "tool_use",
                                        "id": "toolu_1",
                                        "name": "search_docs",
                                        "input": {"query": "evals"},
                                    },
                                    {
                                        "type": "tool_use",
                                        "id": "toolu_2",
                                        "name": "rank_results",
                                        "input": {"top_k": 5},
                                    },
                                ],
                            },
                            {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "function_call",
                                        "call_id": "fc_1",
                                        "name": "summarize_results",
                                        "arguments": {"format": "bullets"},
                                    }
                                ],
                            },
                        ]
                    },
                },
            },
        ],
    }


def make_summary_with_message_rendering_across_panels():
    """Summary where input/output/reference all use message arrays."""
    return {
        "total_evaluations": 1,
        "total_functions": 1,
        "total_errors": 0,
        "total_passed": 1,
        "total_with_scores": 1,
        "average_latency": 0.4,
        "results": [
            {
                "function": "test_message_rendering",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": [
                        {"role": "system", "content": "You are a concise assistant."},
                        {"role": "user", "content": "Summarize this paragraph."},
                    ],
                    "output": [
                        {
                            "role": "assistant",
                            "content": [
                                {"type": "text", "text": "Short summary line 1."},
                                {"type": "text", "text": "Short summary line 2."},
                            ],
                        }
                    ],
                    "reference": [
                        {"role": "assistant", "message": "Expected concise summary."},
                    ],
                    "scores": [{"key": "correct", "passed": True}],
                    "error": None,
                    "latency": 0.4,
                    "metadata": None,
                    "status": "completed",
                    "trace_data": {
                        "messages": [
                            {"role": "user", "content": "Find docs about scoring."},
                            {
                                "role": "assistant",
                                "content": "Searching docs now.",
                                "tool_calls": [
                                    {
                                        "id": "call_docs_1",
                                        "name": "search_docs",
                                        "args": {"query": "scoring"},
                                    }
                                ],
                            },
                            {
                                "role": "tool",
                                "tool_call_id": "call_docs_1",
                                "content": '{"matches": 3}',
                            },
                        ],
                    },
                },
            },
        ],
    }


def make_summary_for_sorting():
    """Summary with multiple scores for sorting tests."""
    return {
        "total_evaluations": 3,
        "total_functions": 3,
        "total_errors": 0,
        "total_passed": 2,
        "total_with_scores": 3,
        "average_latency": 0.5,
        "results": [
            {
                "function": "test_high",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i1",
                    "output": "o1",
                    "reference": None,
                    "scores": [{"key": "score", "value": 0.9}],
                    "error": None,
                    "latency": 0.3,
                    "metadata": None,
                    "status": "completed",
                },
            },
            {
                "function": "test_low",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i2",
                    "output": "o2",
                    "reference": None,
                    "scores": [{"key": "score", "value": 0.1}],
                    "error": None,
                    "latency": 0.5,
                    "metadata": None,
                    "status": "completed",
                },
            },
            {
                "function": "test_mid",
                "dataset": "ds",
                "labels": [],
                "result": {
                    "input": "i3",
                    "output": "o3",
                    "reference": None,
                    "scores": [{"key": "score", "value": 0.5}],
                    "error": None,
                    "latency": 0.7,
                    "metadata": None,
                    "status": "completed",
                },
            },
        ],
    }


class TestSkeletonOnError:
    """#10: Errored tests should not show skeleton loader."""

    def test_error_row_shows_dash_not_skeleton(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_error(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Find the error row's output cell
                error_row = page.locator("tr[data-row='main']").filter(
                    has=page.locator("td[data-col='function']", has_text="test_error")
                )
                output_cell = error_row.locator("td[data-col='output']")

                # Should show dash, not skeleton (no animate-pulse class)
                # React UI uses "--" (double hyphen) instead of em dash
                expect(output_cell.locator(".animate-pulse")).to_have_count(0)
                expect(output_cell).to_contain_text("--")

                browser.close()


class TestReferenceColumn:
    """#3: Reference column should display data."""

    def test_reference_shows_in_table(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_error(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Find the passing row's reference cell
                pass_row = page.locator("tr[data-row='main']").filter(
                    has=page.locator("td[data-col='function']", has_text="test_pass")
                )
                ref_cell = pass_row.locator("td[data-col='reference']")

                # Should contain the reference value
                expect(ref_cell).to_contain_text("ref1")

                browser.close()


class TestToolDisplay:
    """#4, #5, #13: Tool calls should display properly on detail page."""

    def test_tool_args_displayed(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                # Open messages pane
                page.click("button:has-text('Messages')")
                page.wait_for_selector("#messages-pane:not(.translate-x-full)")

                # Tool call should show args, not empty {}
                messages_content = page.locator("#messages-pane").inner_text()
                assert "get_data" in messages_content
                assert "query" in messages_content

                browser.close()

    def test_tool_name_not_id(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                # Open messages pane
                page.click("button:has-text('Messages')")
                page.wait_for_selector("#messages-pane:not(.translate-x-full)")

                # Should show tool name, not cryptic ID
                messages_content = page.locator("#messages-pane").inner_text()
                # Tool result should reference get_data, not call_abc123
                assert "get_data" in messages_content
                # The cryptic ID shouldn't be prominently displayed
                assert "CALL_" not in messages_content.upper() or "get_data" in messages_content

                browser.close()

    def test_sidebar_tool_names_from_common_message_arrays(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_message_array_tool_schemas(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                tool_names = page.locator("#tool-names")
                expect(tool_names).to_be_visible()
                text = tool_names.inner_text()
                assert "search_docs" in text
                assert "fetch_page" in text
                assert "rank_results" in text
                assert "summarize_results" in text
                assert text.count("search_docs") == 1

                browser.close()


class TestTraceUrl:
    """#8: Trace URL should be styled as a visible button."""

    def test_trace_url_button_visible(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                # Trace button should be visible in header area
                trace_link = page.locator("a[href='https://example.com/trace/123']")
                expect(trace_link).to_be_visible()
                # Should have button-like styling (cyan color)
                expect(trace_link).to_have_class(re.compile(r"bg-cyan"))

                browser.close()


class TestMessagesPane:
    """#16: Messages pane should close on click outside."""

    def test_click_outside_closes_pane(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                # Open messages pane
                page.click("button:has-text('Messages')")
                pane = page.locator("#messages-pane")
                expect(pane).not_to_have_class(re.compile(r"translate-x-full"))

                # Click the close button in the pane header to close it
                # (React UI doesn't close on outside click, uses explicit close button)
                close_btn = pane.locator("button").first
                close_btn.click()
                time.sleep(0.3)

                # Pane should now be closed (has translate-x-full)
                expect(pane).to_have_class(re.compile(r"translate-x-full"))

                browser.close()


class TestMessageRenderingNormalization:
    """#27: Message-like data renders pretty with a raw toggle everywhere."""

    def test_input_output_reference_render_pretty_by_default(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_message_rendering_across_panels(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("#input-panel")
                page.wait_for_selector("#output-panel")
                page.wait_for_selector("#ref-panel")

                expect(page.locator("#input-panel .msg-box").first).to_be_visible()
                expect(page.locator("#output-panel .msg-box").first).to_be_visible()
                expect(page.locator("#ref-panel .msg-box").first).to_be_visible()
                expect(page.locator("#input-panel button:has-text('Pretty')")).to_be_visible()
                expect(page.locator("#output-panel button:has-text('Pretty')")).to_be_visible()
                expect(page.locator("#ref-panel button:has-text('Pretty')")).to_be_visible()

                browser.close()

    def test_message_view_toggle_switches_between_pretty_and_raw(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_message_rendering_across_panels(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("#input-panel")

                input_panel = page.locator("#input-panel")
                input_panel.locator("button:has-text('Raw')").click()
                expect(input_panel.locator("pre.data-pre")).to_contain_text('"role": "user"')
                input_panel.locator("button:has-text('Pretty')").click()
                expect(input_panel.locator(".msg-box").first).to_be_visible()

                page.click("button:has-text('Messages')")
                page.wait_for_selector("#messages-pane:not(.translate-x-full)")
                pane = page.locator("#messages-pane")
                pane.locator("button:has-text('Raw')").click()
                expect(pane.locator("pre.data-pre")).to_contain_text('"role": "assistant"')
                pane.locator("button:has-text('Pretty')").click()
                expect(pane.locator(".msg-box").first).to_be_visible()

                browser.close()


class TestScoresSorting:
    """#15: Scores column should be sortable."""

    def test_sort_by_scores_ascending(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_for_sorting(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Click scores header to sort ascending
                page.locator("thead th[data-col='scores']").click()

                # First row should be test_low (0.1 score)
                first_func = page.locator(
                    "tbody tr[data-row='main'] td[data-col='function'] a"
                ).first
                expect(first_func).to_contain_text("test_low")

                browser.close()

    def test_sort_by_scores_descending(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_for_sorting(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Click scores header twice to sort descending
                page.locator("thead th[data-col='scores']").click()
                page.locator("thead th[data-col='scores']").click()

                # First row should be test_high (0.9 score)
                first_func = page.locator(
                    "tbody tr[data-row='main'] td[data-col='function'] a"
                ).first
                expect(first_func).to_contain_text("test_high")

                browser.close()

    def test_sort_from_query_descending(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_for_sorting(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}?sort=scores,desc,number")
                page.wait_for_selector("#results-table")

                first_func = page.locator(
                    "tbody tr[data-row='main'] td[data-col='function'] a"
                ).first
                expect(first_func).to_contain_text("test_high")

                browser.close()

    def test_sort_updates_url_query(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_for_sorting(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                page.locator("thead th[data-col='scores']").click()
                page.wait_for_function(
                    "() => new URLSearchParams(window.location.search).getAll('sort').includes('scores,asc,number')"
                )

                params = urllib.parse.parse_qs(urllib.parse.urlparse(page.url).query)
                assert "scores,asc,number" in params.get("sort", [])

                browser.close()


class TestRerunButton:
    """#6: Detail page should have a rerun button."""

    def test_rerun_button_visible(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("header")

                # Rerun button should be visible
                rerun_btn = page.locator("#rerun-btn")
                expect(rerun_btn).to_be_visible()
                expect(rerun_btn).to_contain_text("Rerun")

                browser.close()


class TestDetailLayoutDefaults:
    """Detail split defaults should stay usable in a fresh session."""

    def test_fresh_session_uses_balanced_detail_split(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_messages(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 840, "height": 420})
                page.add_init_script("localStorage.clear(); sessionStorage.clear();")
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("#input-panel")
                page.wait_for_selector("#ref-panel")

                dims = page.evaluate(
                    """
                    () => {
                      const sidebar = document.querySelector('#sidebar-panel')?.getBoundingClientRect();
                      const ref = document.querySelector('#ref-panel')?.getBoundingClientRect();
                      const input = document.querySelector('#input-panel')?.getBoundingClientRect();
                      const output = document.querySelector('#output-panel')?.getBoundingClientRect();
                      const main = document.querySelector('#main-panel')?.getBoundingClientRect();
                      return {
                        sidebarWidth: sidebar?.width || 0,
                        refHeight: ref?.height || 0,
                        refX: ref?.x || 0,
                        refWidth: ref?.width || 0,
                        refY: ref?.y || 0,
                        inputX: input?.x || 0,
                        inputWidth: input?.width || 0,
                        inputY: input?.y || 0,
                        outputX: output?.x || 0,
                        mainHeight: main?.height || 0,
                        mainWidth: main?.width || 0,
                        viewportWidth: window.innerWidth,
                      };
                    }
                    """
                )

                assert dims["sidebarWidth"] <= dims["viewportWidth"] * 0.35
                assert dims["refHeight"] <= dims["mainHeight"] * 0.35
                assert abs(dims["refX"] - dims["inputX"]) < 2
                assert abs(dims["refWidth"] - dims["inputWidth"]) < 2
                assert dims["refY"] > dims["inputY"]
                assert dims["refWidth"] < dims["mainWidth"] * 0.8
                assert dims["refX"] + dims["refWidth"] <= dims["outputX"] + 2

                browser.close()

    def test_detail_split_persists_across_eval_navigation(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_two_detail_rows(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1200, "height": 900})
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("#main-panel")
                page.wait_for_selector("#sidebar-panel")

                sidebar_box = page.locator("#sidebar-panel").bounding_box()
                assert sidebar_box is not None
                resize_x = sidebar_box["x"] - 1
                resize_y = sidebar_box["y"] + (sidebar_box["height"] / 2)
                page.mouse.move(resize_x, resize_y)
                page.mouse.down()
                page.mouse.move(resize_x - 70, resize_y)
                page.mouse.up()

                ref_panel_box = page.locator("#ref-panel").bounding_box()
                assert ref_panel_box is not None
                ref_resize_x = ref_panel_box["x"] + (ref_panel_box["width"] / 2)
                ref_resize_y = ref_panel_box["y"] - 1
                page.mouse.move(ref_resize_x, ref_resize_y)
                page.mouse.down()
                page.mouse.move(ref_resize_x, ref_resize_y - 220)
                page.mouse.up()

                resized = page.evaluate(
                    """
                    () => ({
                      sidebar: document.querySelector('#sidebar-panel')?.getBoundingClientRect().width || 0,
                      ref: document.querySelector('#ref-panel')?.getBoundingClientRect().height || 0,
                    })
                    """
                )
                assert resized["ref"] > 300
                page.wait_for_function(
                    """
                    ([sidebarWidth, refHeight]) => {
                      const raw = sessionStorage.getItem('ezvals:detailLayout');
                      if (!raw) return false;
                      const parsed = JSON.parse(raw);
                      return Math.abs((parsed.sidebarWidth || 0) - sidebarWidth) < 3
                        && Math.abs((parsed.refHeight || 0) - refHeight) < 3;
                    }
                    """,
                    arg=[resized["sidebar"], resized["ref"]],
                )

                page.keyboard.press("ArrowDown")
                page.wait_for_url(re.compile(r"/results/1$"))
                page.wait_for_selector("#sidebar-panel")
                page.wait_for_selector("#ref-panel")

                next_dims = page.evaluate(
                    """
                    () => ({
                      sidebar: document.querySelector('#sidebar-panel')?.getBoundingClientRect().width || 0,
                      ref: document.querySelector('#ref-panel')?.getBoundingClientRect().height || 0,
                    })
                    """
                )

                assert abs(next_dims["sidebar"] - resized["sidebar"]) < 3
                assert abs(next_dims["ref"] - resized["ref"]) < 3

                browser.close()


class TestProgressBarLightMode:
    """Progress bar should use theme-aware CSS variables for light/dark modes."""

    def test_progress_bar_css_variable_dark_mode(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_error(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Check dark mode progress bar CSS variable
                progress_bg = page.evaluate(
                    "getComputedStyle(document.documentElement).getPropertyValue('--progress-bar-bg').trim()"
                )
                assert progress_bg == "#27272a", f"Dark mode should have #27272a, got {progress_bg}"

                browser.close()

    def test_progress_bar_css_variable_light_mode(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_error(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Switch to light mode
                page.evaluate("document.documentElement.classList.remove('dark')")

                # Check light mode progress bar CSS variable
                progress_bg = page.evaluate(
                    "getComputedStyle(document.documentElement).getPropertyValue('--progress-bar-bg').trim()"
                )
                assert progress_bg == "#d4d4d4", f"Light mode should have #d4d4d4, got {progress_bg}"

                browser.close()


class TestPercentageDisplay:
    """Stats should show percentage format like '66% (33/50)'."""

    def make_summary_with_scores(self):
        """Summary with pass/fail scores for percentage display."""
        return {
            "total_evaluations": 3,
            "total_functions": 3,
            "total_errors": 0,
            "total_passed": 2,
            "total_with_scores": 3,
            "average_latency": 0.5,
            "score_chips": [{"key": "accuracy", "type": "ratio", "passed": 2, "total": 3}],
            "results": [
                {
                    "function": "test1",
                    "dataset": "ds",
                    "labels": [],
                    "result": {
                        "input": "i1",
                        "output": "o1",
                        "reference": None,
                        "scores": [{"key": "accuracy", "passed": True}],
                        "error": None,
                        "latency": 0.3,
                        "metadata": None,
                        "status": "completed",
                    },
                },
                {
                    "function": "test2",
                    "dataset": "ds",
                    "labels": [],
                    "result": {
                        "input": "i2",
                        "output": "o2",
                        "reference": None,
                        "scores": [{"key": "accuracy", "passed": True}],
                        "error": None,
                        "latency": 0.5,
                        "metadata": None,
                        "status": "completed",
                    },
                },
                {
                    "function": "test3",
                    "dataset": "ds",
                    "labels": [],
                    "result": {
                        "input": "i3",
                        "output": "o3",
                        "reference": None,
                        "scores": [{"key": "accuracy", "passed": False}],
                        "error": None,
                        "latency": 0.7,
                        "metadata": None,
                        "status": "completed",
                    },
                },
            ],
        }

    def test_score_chips_show_percentage(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(self.make_summary_with_scores(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Check that percentage format is shown in expanded stats
                expanded_stats = page.locator("#stats-expanded .stats-chart-values").text_content()
                # Should show percentage format like "67% 2/3"
                assert "%" in expanded_stats, f"Expanded stats should show percentage: {expanded_stats}"
                assert "2/3" in expanded_stats, f"Expanded stats should show ratio: {expanded_stats}"

                browser.close()


class TestRunDropdown:
    """Run dropdown should appear when multiple runs exist in session."""

    def test_run_dropdown_appears_with_multiple_runs(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        # Create two runs in the same session
        summary1 = make_summary_with_error()
        summary1["session_name"] = "test-session"
        summary1["run_name"] = "run-one"
        run_id1 = store.save_run(summary1, session_name="test-session", run_name="run-one")

        summary2 = make_summary_with_error()
        summary2["session_name"] = "test-session"
        summary2["run_name"] = "run-two"
        run_id2 = store.save_run(summary2, session_name="test-session", run_name="run-two")

        app = create_app(
            results_dir=str(tmp_path / "runs"),
            active_run_id=run_id2,
            session_name="test-session",
            run_name="run-two",
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Wait for async session runs fetch and re-render
                time.sleep(1)

                # Reload to ensure fresh render with session runs
                page.reload()
                page.wait_for_selector("#results-table")
                time.sleep(0.5)

                # Check that run dropdown button exists (custom button dropdown, not <select>)
                dropdown = page.locator(".stats-run-dropdown")
                assert dropdown.count() > 0, "Run dropdown should appear with multiple runs"

                # Check dropdown button shows current run name
                dropdown_text = dropdown.first.text_content()
                assert "run-two" in dropdown_text, f"Dropdown should show current run name, got: {dropdown_text}"

                browser.close()

    def test_run_dropdown_hidden_with_single_run(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(make_summary_with_error(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # With only one run, dropdown should not appear
                dropdown = page.locator(".stats-run-dropdown")
                assert dropdown.count() == 0, "Run dropdown should not appear with single run"

                browser.close()

    def test_run_dropdown_shows_with_unsaved_active_and_one_existing_run(self, tmp_path):
        store = ResultsStore(tmp_path / "runs")
        summary = make_summary_with_error()
        summary["session_name"] = "test-session"
        summary["run_name"] = "headless-run"
        store.save_run(summary, run_id="headless01", session_name="test-session", run_name="headless-run")

        eval_path = tmp_path / "evals.py"
        eval_path.write_text(
            "from ezvals import eval, EvalContext\n\n"
            "@eval\n"
            "def test_discovered(ctx: EvalContext):\n"
            "    ctx.output = 'ok'\n"
        )
        discovered = EvalDiscovery().discover(path=str(eval_path))

        app = create_app(
            results_dir=str(tmp_path / "runs"),
            active_run_id="servefresh",
            path=str(eval_path),
            discovered_functions=discovered,
            session_name="test-session",
            run_name="fresh-serve-run",
        )

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")
                time.sleep(1)
                page.reload()
                page.wait_for_selector("#results-table")
                time.sleep(0.5)

                dropdown = page.locator(".stats-run-dropdown")
                assert dropdown.count() > 0, "Run dropdown should appear when one existing session run can be switched to"

                browser.close()


class TestStatusChipPosition:
    """Status chips (running/error) should appear in subtext row, not next to function name."""

    def make_summary_with_error_status(self):
        """Summary with an error status to show error chip."""
        return {
            "total_evaluations": 2,
            "total_functions": 2,
            "total_errors": 1,
            "total_passed": 1,
            "total_with_scores": 1,
            "average_latency": 0.5,
            "results": [
                {
                    "function": "test_pass",
                    "dataset": "my_dataset",
                    "labels": ["label1"],
                    "result": {
                        "input": "input1",
                        "output": "output1",
                        "reference": None,
                        "scores": [{"key": "accuracy", "passed": True}],
                        "error": None,
                        "latency": 0.3,
                        "metadata": None,
                        "status": "completed",
                    },
                },
                {
                    "function": "test_error_func",
                    "dataset": "error_dataset",
                    "labels": [],
                    "result": {
                        "input": "input2",
                        "output": None,
                        "reference": None,
                        "scores": [],
                        "error": "RuntimeError: Failed",
                        "latency": None,
                        "metadata": None,
                        "status": "error",
                    },
                },
            ],
        }

    def test_error_chip_in_subtext_row(self, tmp_path):
        """Error chip should be in the subtext row with dataset, not next to function name."""
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(self.make_summary_with_error_status(), "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                # Find the error row
                error_row = page.locator("tr[data-row='main']").filter(
                    has=page.locator("td[data-col='function']", has_text="test_error_func")
                )
                func_cell = error_row.locator("td[data-col='function']")

                # The status pill should be in the second div (subtext row), not the first
                # Structure: <td><div class="flex flex-col"><div>function</div><div>pill + dataset + labels</div></div></td>
                subtext_row = func_cell.locator("div.flex.flex-col > div").nth(1)

                # Subtext row should contain both the status pill and the dataset
                expect(subtext_row.locator(".status-pill")).to_have_count(1)
                expect(subtext_row).to_contain_text("error_dataset")

                # First row (function name row) should NOT contain the status pill
                func_name_row = func_cell.locator("div.flex.flex-col > div").nth(0)
                expect(func_name_row.locator(".status-pill")).to_have_count(0)

                browser.close()

    def test_running_status_uses_subtle_indicator(self, tmp_path):
        """Running status should use the subtle spinner indicator in the subtext row."""
        summary = {
            "total_evaluations": 1,
            "total_functions": 1,
            "total_errors": 0,
            "total_passed": 0,
            "total_with_scores": 0,
            "average_latency": 0.0,
            "results": [
                {
                    "function": "test_running_func",
                    "dataset": "active_dataset",
                    "labels": [],
                    "result": {
                        "input": "input",
                        "output": None,
                        "reference": None,
                        "scores": [],
                        "error": None,
                        "latency": None,
                        "metadata": None,
                        "status": "running",
                    },
                }
            ],
        }
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(summary, "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url)
                page.wait_for_selector("#results-table")

                running_row = page.locator("tr[data-row='main']").filter(
                    has=page.locator("td[data-col='function']", has_text="test_running_func")
                )
                subtext_row = running_row.locator("td[data-col='function'] div.flex.flex-col > div").nth(1)

                expect(subtext_row.locator(".status-indicator-running")).to_have_count(1)
                expect(subtext_row.locator(".status-pill")).to_have_count(0)

                browser.close()

    def test_detail_output_shows_loading_state_while_running(self, tmp_path):
        """Detail page should show loading indicator in output panel during running status."""
        summary = {
            "total_evaluations": 1,
            "total_functions": 1,
            "total_errors": 0,
            "total_passed": 0,
            "total_with_scores": 0,
            "average_latency": 0.0,
            "results": [
                {
                    "function": "test_running_detail_output",
                    "dataset": "active_dataset",
                    "labels": [],
                    "result": {
                        "input": "input payload",
                        "output": "stale output that should not be shown",
                        "reference": None,
                        "scores": [],
                        "error": None,
                        "latency": None,
                        "metadata": None,
                        "status": "running",
                    },
                }
            ],
        }
        store = ResultsStore(tmp_path / "runs")
        run_id = store.save_run(summary, "2024-01-01T00-00-00Z")
        app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)

        with run_server(app) as url:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(f"{url}/runs/{run_id}/results/0")
                page.wait_for_selector("#output-panel")

                expect(page.locator("#output-loading-indicator")).to_be_visible()
                expect(page.locator("#output-panel")).not_to_contain_text("stale output that should not be shown")

                browser.close()


def test_long_dataset_and_label_chips_truncate_with_tooltips(tmp_path):
    store = ResultsStore(tmp_path / "runs")
    summary = make_summary_with_long_chip_text()
    run_id = store.save_run(summary, "2024-01-01T00-00-00Z")
    app = create_app(results_dir=str(tmp_path / "runs"), active_run_id=run_id)
    expected_dataset = summary["results"][0]["dataset"]
    expected_label = summary["results"][0]["labels"][0]

    with run_server(app) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url)
            page.wait_for_selector("#results-table")

            dataset_chip = page.locator(".dataset-chip").first
            label_chip = page.locator(".label-chip").first

            expect(dataset_chip).to_have_attribute("title", expected_dataset)
            expect(label_chip).to_have_attribute("title", expected_label)

            dataset_style = dataset_chip.evaluate(
                "el => ({ textOverflow: getComputedStyle(el).textOverflow, whiteSpace: getComputedStyle(el).whiteSpace })"
            )
            label_style = label_chip.evaluate(
                "el => ({ textOverflow: getComputedStyle(el).textOverflow, whiteSpace: getComputedStyle(el).whiteSpace })"
            )
            assert dataset_style["textOverflow"] == "ellipsis"
            assert dataset_style["whiteSpace"] == "nowrap"
            assert label_style["textOverflow"] == "ellipsis"
            assert label_style["whiteSpace"] == "nowrap"

            page.locator("#filters-toggle").click()
            page.wait_for_selector("#dataset-pills")

            filter_dataset_pill = page.locator("#dataset-pills button").first
            filter_label_pill = page.locator("#label-pills button").first
            expect(filter_dataset_pill).to_have_attribute("title", expected_dataset)
            expect(filter_label_pill).to_have_attribute("title", expected_label)

            dataset_pill_text = filter_dataset_pill.locator(".filter-pill-text")
            label_pill_text = filter_label_pill.locator(".filter-pill-text")
            expect(dataset_pill_text).to_have_text(expected_dataset)
            expect(label_pill_text).to_have_text(expected_label)

            dataset_pill_style = dataset_pill_text.evaluate(
                "el => ({ textOverflow: getComputedStyle(el).textOverflow, whiteSpace: getComputedStyle(el).whiteSpace })"
            )
            label_pill_style = label_pill_text.evaluate(
                "el => ({ textOverflow: getComputedStyle(el).textOverflow, whiteSpace: getComputedStyle(el).whiteSpace })"
            )
            assert dataset_pill_style["textOverflow"] == "ellipsis"
            assert dataset_pill_style["whiteSpace"] == "nowrap"
            assert label_pill_style["textOverflow"] == "ellipsis"
            assert label_pill_style["whiteSpace"] == "nowrap"

            browser.close()
