"""Browser tests for `ezvals serve`, run against the built binary. Run with: make test-e2e"""
import os
import re
import socket
import subprocess
import time
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

ROOT = Path(__file__).resolve().parents[1]
EVALS = '''
import time
from ezvals import eval, EvalContext

@eval(dataset="math", cases=[{"id": str(i), "input": i, "reference": i * i} for i in range(3)])
def square(ctx: EvalContext):
    ctx.output = ctx.input ** 2
    assert ctx.output == ctx.reference

@eval(dataset="words", input="hello")
def shout(ctx: EvalContext):
    ctx.output = ctx.input.upper()

@eval(dataset="words")
def slow(ctx: EvalContext):
    time.sleep(30)

@eval(dataset="math", input=2, reference=5)
def wrong(ctx: EvalContext):
    ctx.output = ctx.input + 2
    assert ctx.output == ctx.reference
'''


@pytest.fixture
def app(tmp_path: Path, page: Page):
    (tmp_path / "evals.py").write_text(EVALS)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    env = {**os.environ, "EZVALS_PYTHON": str(ROOT / "python" / ".venv" / "bin" / "python")}
    server = subprocess.Popen([str(ROOT / "python" / "ezvals" / "bin" / "ezvals"), "serve", "evals.py", "--no-open",
                               "--port", str(port), "--session", "e2e", "--run-name", "first"],
                              cwd=tmp_path, env=env, stdout=subprocess.DEVNULL)
    for _ in range(50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)
    page.goto(f"http://127.0.0.1:{port}/")
    yield page
    server.terminate()
    server.wait()


def row(page: Page, i: int):
    return page.locator(f'tr[data-row="main"][data-row-id="{i}"]')


def run_selected(page: Page, *rows: int):
    for i in rows:
        page.locator(f'.row-checkbox[data-row-id="{i}"]').check()
    page.locator("#play-btn").click()


def test_discovered_evals_run_on_demand(app: Page):
    for i in range(6):
        expect(row(app, i)).to_have_attribute("data-status", "not_started")
    run_selected(app, 0, 3)
    expect(row(app, 0)).to_have_attribute("data-status", "completed")
    expect(row(app, 3)).to_have_attribute("data-status", "completed")
    expect(row(app, 3)).to_contain_text("HELLO")
    expect(row(app, 1)).to_have_attribute("data-status", "not_started")


def test_stop_cancels_remaining_evals(app: Page):
    app.locator("#play-btn").click()
    expect(row(app, 4)).to_have_attribute("data-status", "running")
    app.locator("#play-btn").click()
    expect(row(app, 4)).to_have_attribute("data-status", "cancelled")
    expect(row(app, 0)).to_have_attribute("data-status", "completed")


def test_detail_view_navigation_and_annotation(app: Page):
    run_selected(app, 0, 1)
    expect(row(app, 1)).to_have_attribute("data-status", "completed")
    row(app, 0).get_by_role("link").click()
    expect(app).to_have_url(re.compile(r"/results/0$"))
    expect(app.locator("#output-panel")).to_contain_text("0")
    app.keyboard.press("ArrowDown")
    expect(app).to_have_url(re.compile(r"/results/1$"))

    app.get_by_title("Edit annotation").click()
    app.get_by_role("textbox", name="Annotation").fill("Looks right")
    app.get_by_role("button", name="Save").click()
    app.reload()
    expect(app.get_by_text("Looks right")).to_be_visible()

    app.keyboard.press("Escape")
    expect(app.locator("#results-table")).to_be_visible()


def test_review_panel_steps_through_results(app: Page):
    run_selected(app, 0, 1)
    expect(row(app, 1)).to_have_attribute("data-status", "completed")
    row(app, 0).locator("td").nth(3).click()
    panel = app.locator("#result-panel")
    expect(panel).to_contain_text("square[0]")
    expect(app).to_have_url(re.compile(r"result=0"))
    app.keyboard.press("ArrowDown")
    expect(panel).to_contain_text("square[1]")
    app.keyboard.press("Escape")
    expect(panel).to_have_count(0)


def test_dataset_filter_only_and_hide(app: Page):
    visible = app.locator('tr[data-row="main"]:visible')
    expect(visible).to_have_count(6)
    app.locator("#filters-toggle").click()
    words = app.locator("#dataset-pills > div").filter(has_text="words")
    words.get_by_role("button", name="Only").click()
    expect(visible).to_have_count(2)
    words.get_by_role("button", name="Hide").click()
    expect(visible).to_have_count(4)
    words.get_by_role("button", name="Hide").click()
    expect(visible).to_have_count(6)


def test_outcome_switch_shows_failures(app: Page):
    run_selected(app, 0, 5)
    expect(row(app, 5)).to_have_attribute("data-status", "completed")
    visible = app.locator('tr[data-row="main"]:visible')
    app.locator("#outcome-failed").click()
    expect(visible).to_have_count(1)
    expect(row(app, 5)).to_be_visible()
    expect(app).to_have_url(re.compile(r"outcome=failed"))
    app.locator("#outcome-all").click()
    expect(visible).to_have_count(6)


def test_compare_two_runs(app: Page):
    run_selected(app, 0)
    expect(row(app, 0)).to_have_attribute("data-status", "completed")
    app.get_by_label("Create new run").click()
    expect(row(app, 0)).to_have_attribute("data-status", "not_started")
    run_selected(app, 0)
    expect(row(app, 0)).to_have_attribute("data-status", "completed")
    current = app.locator("#run-name").inner_text()
    app.get_by_label("Compare runs").click()
    app.locator(".compare-option", has_text="first").click()
    expect(app.locator("#compare-mode-label")).to_be_visible()
    expect(app.locator("#stats-expanded")).to_contain_text("first")
    app.locator("#exit-compare-btn").click()
    expect(app.locator("#compare-mode-label")).to_have_count(0)
    expect(app.locator("#run-name")).to_have_text(current)


def test_export_json(app: Page):
    run_selected(app, 3)
    expect(row(app, 3)).to_have_attribute("data-status", "completed")
    app.locator("#export-toggle").click()
    with app.expect_download() as download:
        app.locator("#export-json-btn").click()
    exported = Path(download.value.path()).read_text()
    assert '"run_name": "first"' in exported and '"HELLO"' in exported
