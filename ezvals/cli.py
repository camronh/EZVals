import click
import sys
import inspect
import os
import traceback
import time
import webbrowser
import json
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Any
from threading import Thread

from rich.console import Console

from ezvals.formatters import format_results_table
from ezvals.decorators import EvalFunction
from ezvals.discovery import EvalDiscovery
from ezvals.runner import run as run_sdk
from ezvals.config import load_config


console = Console()


def _is_port_available(port: int) -> bool:
    """Check if a port is available for binding."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _find_available_port(start_port: int, max_attempts: int = 10) -> int:
    """Find an available port starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        if _is_port_available(port):
            return port
    raise click.ClickException(f"No available ports found in range {start_port}-{start_port + max_attempts - 1}")


def _latest_mtime(path: Path) -> float:
    """Return latest file mtime under path (or 0 if missing)."""
    if not path.exists():
        return 0.0
    if path.is_file():
        return path.stat().st_mtime
    latest = path.stat().st_mtime
    for child in path.rglob("*"):
        if child.is_file():
            child_mtime = child.stat().st_mtime
            if child_mtime > latest:
                latest = child_mtime
    return latest


def _ensure_ui_assets_fresh():
    """Build UI assets when ui/src is newer than ezvals/static."""
    repo_root = Path(__file__).resolve().parent.parent
    ui_dir = repo_root / "ui"
    if not (ui_dir / "package.json").exists():
        return  # Installed package environment; no local UI source to build

    static_dir = repo_root / "ezvals" / "static"
    static_index = static_dir / "index.html"

    source_latest = max(
        _latest_mtime(ui_dir / "src"),
        _latest_mtime(ui_dir / "index.html"),
        _latest_mtime(ui_dir / "package.json"),
    )
    static_latest = _latest_mtime(static_dir)

    if static_index.exists() and source_latest <= static_latest:
        return

    console.print("[cyan]Detected stale UI assets. Building frontend...[/cyan]")
    try:
        subprocess.run(["npm", "run", "build"], cwd=ui_dir, check=True)
    except FileNotFoundError:
        raise click.ClickException(
            "npm is required to build UI assets but was not found. Install npm, then run: npm --prefix ui run build"
        )
    except subprocess.CalledProcessError as exc:
        raise click.ClickException(
            f"UI build failed (exit {exc.returncode}). Run `npm --prefix ui run build` and fix errors."
        )


def _restart_current_process(port: Optional[int] = None) -> None:
    """Re-exec the current command, preserving args."""
    argv = list(sys.argv)
    if port is not None:
        if "--port" in argv:
            idx = argv.index("--port")
            if idx + 1 < len(argv):
                argv[idx + 1] = str(port)
            else:
                argv.append(str(port))
        else:
            argv.extend(["--port", str(port)])
    console.print("[cyan]Restarting EZVals server...[/cyan]")
    os.execvp(argv[0], argv)


def _build_serve_query_params(
    active_run_id: Optional[str],
    comparison_run_ids: List[str],
    search: Optional[str],
    has_error: Optional[bool],
    has_url: Optional[bool],
    has_messages: Optional[bool],
    annotation: str,
) -> List[tuple[str, str]]:
    params: List[tuple[str, str]] = []
    if active_run_id:
        params.append(("run_id", active_run_id))
    for run_id in comparison_run_ids:
        params.append(("compare_run_id", run_id))
    if search:
        params.append(("search", search))
    if has_error is not None:
        params.append(("has_error", "1" if has_error else "0"))
    if has_url is not None:
        params.append(("has_url", "1" if has_url else "0"))
    if has_messages is not None:
        params.append(("has_messages", "1" if has_messages else "0"))
    if annotation != "any":
        params.append(("annotation", annotation))
    return params


def _resolve_run_name_in_session(
    store: Any,
    session_name: str,
    run_name: str,
    required: bool,
) -> Optional[Dict[str, Any]]:
    matches = []
    for run_id in store.list_runs_for_session(session_name):
        try:
            data = store.load_run(run_id, session_name)
        except Exception:
            continue
        if data.get("run_name") == run_name:
            matches.append((run_id, data))

    if len(matches) > 1:
        match_ids = ", ".join(run_id for run_id, _ in matches)
        raise click.ClickException(
            f"Run name '{run_name}' is ambiguous in session '{session_name}'. Matching run_ids: {match_ids}"
        )

    if not matches:
        if required:
            raise click.ClickException(f"Run name '{run_name}' not found in session '{session_name}'.")
        return None

    run_id, data = matches[0]
    return {"run_id": run_id, "run_data": data}


def _parse_compare_run_names(compare_runs: str) -> List[str]:
    names = [n.strip() for n in compare_runs.split(",") if n.strip()]
    if len(names) < 2:
        raise click.ClickException("--compare-runs requires at least 2 run names.")
    if len(names) > 4:
        raise click.ClickException("--compare-runs supports at most 4 run names.")
    if len(set(names)) != len(names):
        raise click.ClickException("--compare-runs cannot include duplicate run names.")
    return names


class ProgressReporter:
    """Pytest-style progress reporter for evaluation runs"""

    def __init__(self):
        self.failures: List[Dict] = []
        self.current_file = None

    def _get_file_display(self, func: EvalFunction) -> str:
        """Get the display name for the file containing the function"""
        try:
            file_path = inspect.getfile(func.func)
            try:
                return str(Path(file_path).relative_to(os.getcwd()))
            except ValueError:
                return Path(file_path).name
        except (TypeError, OSError):
            return func.dataset

    def _switch_file_if_needed(self, func: EvalFunction):
        """Print newline and new file header if file changed."""
        file_display = self._get_file_display(func)
        if file_display != self.current_file:
            if self.current_file is not None:
                console.print("")
            console.print(f"{file_display} ", end="")
            self.current_file = file_display

    def on_start(self, func: EvalFunction):
        """Called when an evaluation starts"""
        self._switch_file_if_needed(func)

    def on_complete(self, func: EvalFunction, result_dict: Dict):
        """Called when an evaluation completes"""
        self._switch_file_if_needed(func)
        result = result_dict["result"]

        # Determine status character and color
        if result.get("error"):
            char, color = "E", "red"
            self.failures.append({"func": func, "result_dict": result_dict, "type": "error"})
        elif result.get("scores"):
            passed = any(s.get("passed") is True for s in result["scores"])
            failed = any(s.get("passed") is False for s in result["scores"])
            if passed:
                char, color = ".", "green"
            elif failed:
                char, color = "F", "red"
                self.failures.append({"func": func, "result_dict": result_dict, "type": "failure"})
            else:
                char, color = ".", "green"
        else:
            char, color = ".", "green"

        console.print(f"[{color}]{char}[/{color}]", end="")

    def print_failures(self):
        """Print detailed failure information"""
        if self.current_file is not None:
            console.print("") # Final newline

        if not self.failures:
            return

        for i, failure in enumerate(self.failures, 1):
            func = failure["func"]
            result_dict = failure["result_dict"]
            result = result_dict["result"]
            failure_type = failure["type"]

            # Format like pytest: dataset::function_name
            dataset = result_dict.get("dataset", "unknown")
            func_name = func.func.__name__

            console.print(f"\n[red]{i}. {dataset}::{func_name}[/red]")

            if failure_type == "error":
                error_msg = result.get("error", "Unknown error")
                console.print(f"   [red]ERROR:[/red] {error_msg}")
            elif failure_type == "failure":
                # Show failing scores
                if result.get("scores"):
                    for score in result["scores"]:
                        if score.get("passed") is False:
                            key = score.get("key", "unknown")
                            notes = score.get("notes", "")
                            if notes:
                                console.print(f"   [red]FAIL:[/red] {key} - {notes}")
                            else:
                                console.print(f"   [red]FAIL:[/red] {key}")

            # Show input/output if available
            if result.get("input"):
                console.print(f"   [dim]Input:[/dim] {result['input']}")
            if result.get("output"):
                console.print(f"   [dim]Output:[/dim] {result['output']}")


@click.group()
def cli():
    """EZVals - A lightweight evaluation framework for AI/LLM testing

    Start the UI: ezvals serve evals.py
    Run headless: ezvals run evals.py

    Path can include function name filter: file.py::function_name
    """
    pass


@cli.command('serve')
@click.argument('path', type=str)
@click.option('--dataset', '-d', help='Filter by dataset(s), comma-separated')
@click.option('--label', '-l', multiple=True, help='Filter by label(s)')
@click.option('--results-dir', default=None, help='Directory for JSON results storage')
@click.option('--port', default=None, type=int, help='Port for the web server')
@click.option('--session', default=None, help='Name for this evaluation session')
@click.option('--run-name', default=None, help='Name of an existing run to open, or pending name for next run')
@click.option('--compare-runs', default=None, help='Comma-separated run names to open in comparison mode (2-4)')
@click.option('--search', default=None, help='Initial search text')
@click.option('--has-error/--no-has-error', default=None, help='Initial error filter')
@click.option('--has-url/--no-has-url', default=None, help='Initial trace URL filter')
@click.option('--has-messages/--no-has-messages', default=None, help='Initial trace messages filter')
@click.option('--annotation', type=click.Choice(['any', 'yes', 'no']), default='any', help='Initial annotation filter')
@click.option('--run', 'auto_run', is_flag=True, help='Automatically run all evals on startup')
@click.option('--open/--no-open', 'open_browser', default=True, help='Open the UI in your browser on startup')
def serve_cmd(
    path: str,
    dataset: Optional[str],
    label: tuple,
    results_dir: Optional[str],
    port: Optional[int],
    session: Optional[str],
    run_name: Optional[str],
    compare_runs: Optional[str],
    search: Optional[str],
    has_error: Optional[bool],
    has_url: Optional[bool],
    has_messages: Optional[bool],
    annotation: str,
    auto_run: bool,
    open_browser: bool = True,
):
    """Start the web UI to browse and run evaluations."""
    from pathlib import Path as PathLib

    from ezvals.storage import ResultsStore, _generate_friendly_name

    # Load config and merge with CLI args
    config = load_config()
    results_dir = results_dir if results_dir is not None else config.get("results_dir", ".ezvals/sessions")
    port = port if port is not None else config.get("port", 8000)

    # Auto-generate session name for serve command (each serve = new session)
    session = session if session else _generate_friendly_name()

    # Parse path to extract file path and optional function name
    function_name = None
    if '::' in path:
        file_path, function_name = path.rsplit('::', 1)
        path = file_path

    # Validate path exists
    path_obj = PathLib(path)
    if not path_obj.exists():
        console.print(f"[red]Error: Path {path} does not exist[/red]")
        sys.exit(1)

    # Detect if path is a run JSON file
    if path_obj.suffix == ".json" and path_obj.is_file():
        if run_name or compare_runs:
            raise click.ClickException("--run-name and --compare-runs are only supported when PATH is an eval path.")
        query_params = _build_serve_query_params(
            active_run_id=None,
            comparison_run_ids=[],
            search=search,
            has_error=has_error,
            has_url=has_url,
            has_messages=has_messages,
            annotation=annotation,
        )
        restart_port = _serve_from_json(
            json_path=path,
            results_dir=results_dir,
            port=port,
            query_params=query_params,
            open_browser=open_browser,
        )
        if restart_port is not None:
            _restart_current_process(port=restart_port)
        return

    labels = list(label) if label else None
    store = ResultsStore(results_dir)

    active_run: Optional[Dict[str, Any]] = None
    if run_name:
        active_run = _resolve_run_name_in_session(store, session, run_name, required=False)

    resolved_compare_runs: List[Dict[str, Any]] = []
    if compare_runs:
        for compare_name in _parse_compare_run_names(compare_runs):
            resolved = _resolve_run_name_in_session(store, session, compare_name, required=True)
            resolved_compare_runs.append({
                "runId": resolved["run_id"],
                "runName": resolved["run_data"].get("run_name") or compare_name,
                "run_data": resolved["run_data"],
            })

    active_run_id = active_run["run_id"] if active_run else None
    active_run_data = active_run["run_data"] if active_run else None

    if resolved_compare_runs:
        compare_ids = [r["runId"] for r in resolved_compare_runs]
        if active_run_id is None or active_run_id not in compare_ids:
            active_run_id = resolved_compare_runs[0]["runId"]
            active_run_data = resolved_compare_runs[0]["run_data"]

    serve_path: Optional[str] = path
    serve_dataset = dataset
    serve_labels = labels
    serve_function_name = function_name
    serve_run_name = run_name
    serve_session_name = session

    if active_run_data:
        run_path = active_run_data.get("path")
        if run_path and Path(run_path).exists():
            serve_path = run_path
        else:
            serve_path = None
            console.print(
                f"[yellow]Warning: Source eval path '{run_path}' not found for run '{active_run_data.get('run_name')}'. "
                "View-only mode (rerun disabled).[/yellow]"
            )
        serve_dataset = active_run_data.get("dataset")
        serve_labels = active_run_data.get("labels")
        serve_function_name = active_run_data.get("function_name")
        serve_run_name = active_run_data.get("run_name")
        serve_session_name = active_run_data.get("session_name") or session

    query_params = _build_serve_query_params(
        active_run_id=active_run_id,
        comparison_run_ids=[r["runId"] for r in resolved_compare_runs],
        search=search,
        has_error=has_error,
        has_url=has_url,
        has_messages=has_messages,
        annotation=annotation,
    )

    restart_port = _serve(
        path=serve_path,
        dataset=serve_dataset,
        labels=serve_labels,
        function_name=serve_function_name,
        results_dir=results_dir,
        port=port,
        session_name=serve_session_name,
        run_name=serve_run_name,
        active_run_id=active_run_id,
        query_params=query_params,
        auto_run=auto_run,
        open_browser=open_browser,
    )
    if restart_port is not None:
        _restart_current_process(port=restart_port)


@cli.command('run')
@click.argument('path', type=str)
@click.option('--dataset', '-d', help='Filter by dataset(s), comma-separated')
@click.option('--label', '-l', multiple=True, help='Filter by label(s)')
@click.option('--limit', type=int, help='Limit the number of evaluations')
@click.option('--output', '-o', type=click.Path(dir_okay=False), help='Override path for results JSON file')
@click.option('--concurrency', '-c', default=None, type=int, help='Number of concurrent evaluations (0 for sequential)')
@click.option('--timeout', type=float, help='Global timeout in seconds')
@click.option('--verbose', '-v', is_flag=True, help='Show stdout from eval functions')
@click.option('--visual', is_flag=True, help='Show rich progress dots, table, and summary')
@click.option('--session', default=None, help='Name for this evaluation session')
@click.option('--run-name', default=None, help='Name for this specific run')
@click.option('--no-save', is_flag=True, help='Skip saving results to file')
def run_cmd(
    path: str,
    dataset: Optional[str],
    label: tuple,
    limit: Optional[int],
    output: Optional[str],
    concurrency: Optional[int],
    timeout: Optional[float],
    verbose: bool,
    visual: bool,
    session: Optional[str],
    run_name: Optional[str],
    no_save: bool,
):
    """Run evaluations headless. Optimized for LLM agents by default."""
    labels = list(label) if label else None
    display_path = path.rsplit('::', 1)[0] if '::' in path else path

    # Set up reporter based on mode
    reporter = ProgressReporter() if visual else None

    def on_complete_callback(func, result_dict):
        if verbose:
            result = result_dict["result"]
            if result.get("error"):
                console.print(f"\n[red]ERROR in {func.func.__name__}:[/red]\n{result['error']}")
        if reporter:
            reporter.on_complete(func, result_dict)

    if visual:
        console.print("[bold green]Running evaluations...[/bold green]")
    else:
        console.print(f"Running {display_path}...")

    try:
        run_result = run_sdk(
            path=path,
            dataset=dataset,
            labels=labels,
            limit=limit,
            output=output,
            concurrency=concurrency,
            timeout=timeout,
            verbose=verbose,
            session=session,
            run_name=run_name,
            no_save=no_save,
            use_config=True,
            on_start=reporter.on_start if reporter else None,
            on_complete=on_complete_callback if verbose or reporter else None,
        )
        summary = run_result["summary"]
        saved_path = run_result["saved_path"]
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        if visual:
            console.print(traceback.format_exc())
        sys.exit(1)

    if visual:
        # Rich output mode: progress dots, failures, table, summary
        reporter.print_failures()

        if summary["total_evaluations"] == 0:
            console.print("[yellow]No evaluations found matching the criteria[/yellow]")
            return

        if summary['results']:
            table = format_results_table(summary['results'])
            console.print(table)

        console.print("\n[bold]Evaluation Summary[/bold]")
        console.print(f"Total Functions: {summary['total_functions']}")
        console.print(f"Total Evaluations: {summary['total_evaluations']}")
        console.print(f"Errors: {summary['total_errors']}")

        if summary['total_with_scores'] > 0:
            console.print(f"Passed: {summary['total_passed']}/{summary['total_with_scores']}")

        if summary['average_latency'] > 0:
            console.print(f"Average Latency: {summary['average_latency']:.3f}s")

    if no_save:
        print(json.dumps(summary, default=str))

    # Print where results were saved (if saved)
    if saved_path:
        console.print(f"Results saved to {saved_path}")


@cli.command('export')
@click.argument('run_path', type=click.Path(exists=True))
@click.option('--format', '-f', 'fmt', type=click.Choice(['json', 'csv', 'md']), default='json', help='Export format')
@click.option('--output', '-o', type=click.Path(), help='Output file path')
def export_cmd(run_path: str, fmt: str, output: Optional[str]):
    """Export a run to various formats (JSON, CSV, Markdown).

    RUN_PATH is the path to a run JSON file.

    Examples:
        ezvals export run.json -f md -o report.md
        ezvals export run.json -f csv
    """
    import shutil
    from ezvals.export import export_to_markdown, export_to_csv

    # Load run data
    with open(run_path) as f:
        data = json.load(f)

    # Generate output filename if not specified
    if not output:
        base = Path(run_path).stem
        output = f"{base}.{fmt}"

    # Export based on format
    if fmt == 'json':
        if run_path != output:
            shutil.copy(run_path, output)
        console.print(f"Exported to {output}")
    elif fmt == 'csv':
        export_to_csv(data, output)
        console.print(f"Exported to {output}")
    elif fmt == 'md':
        export_to_markdown(data, output)
        console.print(f"Exported to {output}")


def _wait_for_stop_signal(app, server_thread):
    """Wait for Esc or Ctrl+C while preserving log output formatting."""
    try:
        if not sys.stdin.isatty():
            while server_thread.is_alive():
                if app.state.restart_requested:
                    return "restart"
                time.sleep(0.2)
            return None

        import termios
        import select
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            mode = termios.tcgetattr(fd)
            mode[3] = mode[3] & ~(termios.ICANON | termios.ECHO)
            termios.tcsetattr(fd, termios.TCSADRAIN, mode)

            while server_thread.is_alive():
                if app.state.restart_requested:
                    return "restart"
                if select.select([sys.stdin], [], [], 0.5)[0]:
                    ch = sys.stdin.read(1)
                    if not ch:
                        return None
                    if ch == '\x1b' or ch == '\x03':
                        return "stop"
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    except (ImportError, AttributeError, OSError):
        try:
            while server_thread.is_alive():
                if app.state.restart_requested:
                    return "restart"
                ch = click.getchar()
                if ch == '\x1b' or ch == '\x03':
                    return "stop"
        except (EOFError, KeyboardInterrupt):
            return "stop"
    return None


def _run_server_until_stop(app, server, server_thread) -> bool:
    """Run the server and wait for stop signal. Returns True if restart was requested."""
    server_thread.start()
    try:
        signal = _wait_for_stop_signal(app, server_thread)
        if signal in ("stop", "restart"):
            console.print("\nStopping server...")
            server.should_exit = True
        restart_requested = signal == "restart"
    except (KeyboardInterrupt, SystemExit):
        console.print("\nStopping server...")
        server.should_exit = True
        restart_requested = False
    server_thread.join()
    return restart_requested


def _serve_app(
    app,
    port: int,
    query_params: Optional[List[tuple[str, str]]] = None,
    status_lines: Optional[List[str]] = None,
    open_browser: bool = True,
    auto_run: bool = False,
) -> Optional[int]:
    import uvicorn

    requested_port = port
    port = _find_available_port(port)
    if port != requested_port:
        console.print(f"[yellow]Port {requested_port} in use → using {port}[/yellow]")

    url = f"http://127.0.0.1:{port}"
    if query_params:
        url = f"{url}?{urllib.parse.urlencode(query_params, doseq=True)}"
    console.print(f"\n[bold green]EZVals UI[/bold green] serving at: [bold blue]{url}[/bold blue]")
    for line in status_lines or []:
        console.print(line)
    console.print("Press Esc to stop (or Ctrl+C)\n")

    if open_browser:
        Thread(target=lambda: (time.sleep(0.5), webbrowser.open(url)), daemon=True).start()

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
    server = uvicorn.Server(config)
    server_thread = Thread(target=server.run)

    if auto_run:
        def do_auto_run():
            time.sleep(0.5)
            try:
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/runs/rerun",
                    data=b'{}',
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                urllib.request.urlopen(req, timeout=5)
            except urllib.error.URLError:
                pass
        Thread(target=do_auto_run, daemon=True).start()

    restart_requested = _run_server_until_stop(app, server, server_thread)
    return port if restart_requested else None


def _serve(
    path: Optional[str],
    dataset: Optional[str],
    labels: Optional[List[str]],
    function_name: Optional[str],
    results_dir: str,
    port: int,
    session_name: Optional[str] = None,
    run_name: Optional[str] = None,
    active_run_id: Optional[str] = None,
    query_params: Optional[List[tuple[str, str]]] = None,
    auto_run: bool = False,
    open_browser: bool = True,
) -> Optional[int]:
    """Serve a web UI to browse and run evaluations."""
    try:
        from ezvals.server import create_app
    except Exception:
        console.print("[red]Missing server dependencies. Install with:[/red] \n  uv add fastapi uvicorn jinja2")
        raise

    from ezvals.storage import ResultsStore, _generate_friendly_name
    _ensure_ui_assets_fresh()

    # Discover functions (for display, not running)
    functions = []
    if path and Path(path).exists():
        discovery = EvalDiscovery()
        functions = discovery.discover(path=path, dataset=dataset, labels=labels, function_name=function_name)

    # Create store and generate run_id for when user triggers run
    store = ResultsStore(results_dir)
    run_id = active_run_id or store.generate_run_id()

    # Generate initial run_name for first run
    run_name = run_name or _generate_friendly_name()

    # Create app - does NOT auto-run, just displays discovered evals
    app = create_app(
        results_dir=results_dir,
        active_run_id=run_id,
        path=path,
        dataset=dataset,
        labels=labels,
        function_name=function_name,
        discovered_functions=functions,
        session_name=session_name,
        run_name=run_name,
    )

    if not path:
        console.print("[yellow]No eval path loaded. UI is in view-only mode until a valid eval path is available.[/yellow]")
    elif not functions:
        console.print("[yellow]No evaluations found matching the criteria.[/yellow]")

    status_line = (
        f"[cyan]Auto-running {len(functions)} evaluation(s)...[/cyan]"
        if auto_run
        else f"[cyan]Found {len(functions)} evaluation(s). Click Run to start.[/cyan]"
    )
    return _serve_app(
        app,
        port=port,
        query_params=query_params,
        status_lines=[status_line],
        open_browser=open_browser,
        auto_run=auto_run,
    )


def _serve_from_json(
    json_path: str,
    results_dir: str,
    port: int,
    query_params: Optional[List[tuple[str, str]]] = None,
    open_browser: bool = True,
) -> Optional[int]:
    """Serve web UI loading an existing run JSON file."""
    try:
        from ezvals.server import create_app
    except Exception:
        console.print("[red]Missing server dependencies. Install with:[/red] \n  uv add fastapi uvicorn jinja2")
        raise

    from ezvals.storage import ResultsStore
    _ensure_ui_assets_fresh()

    # Load the run JSON
    with open(json_path, "r") as f:
        run_data = json.load(f)

    # Extract run metadata
    run_id = run_data.get("run_id")
    session_name = run_data.get("session_name", "default")
    run_name = run_data.get("run_name")
    eval_path = run_data.get("path")  # Source eval file path

    # Check if source eval path exists (for rerun capability)
    source_exists = eval_path and Path(eval_path).exists()

    # Create store
    store = ResultsStore(results_dir)

    # Ensure the run is in the store (copy if loading from external path)
    try:
        store.load_run(run_id)
    except FileNotFoundError:
        store.save_run(run_data, run_id=run_id, session_name=session_name, run_name=run_name)

    # Discover functions if source exists (for rerun capability)
    discovered_functions = []
    if source_exists:
        discovery = EvalDiscovery()
        discovered_functions = discovery.discover(path=eval_path)

    # Create app with pre-loaded run
    app = create_app(
        results_dir=results_dir,
        active_run_id=run_id,
        path=eval_path if source_exists else None,
        dataset=None,
        labels=None,
        function_name=None,
        discovered_functions=discovered_functions,
        session_name=session_name,
        run_name=run_name,
    )

    if not source_exists:
        console.print(f"[yellow]Warning: Source eval path '{eval_path}' not found. View-only mode (rerun disabled).[/yellow]")

    return _serve_app(
        app,
        port=port,
        query_params=query_params,
        status_lines=[f"[cyan]Loaded run: {run_name} ({len(run_data.get('results', []))} results)[/cyan]"],
        open_browser=open_browser,
        auto_run=False,
    )


# ============================================================================
# Skills commands
# ============================================================================

SUPPORTED_AGENTS = ['claude', 'codex', 'cursor', 'windsurf', 'kiro', 'roo']


def _get_skill_source_path() -> Path:
    """Get the path to the bundled skill files."""
    import importlib.resources
    # Python 3.9+ uses files(), older versions need a different approach
    try:
        return Path(importlib.resources.files('ezvals').joinpath('skills', 'evals'))
    except AttributeError:
        # Fallback for older Python
        import pkg_resources
        return Path(pkg_resources.resource_filename('ezvals', 'skills/evals'))


def _copy_skill_files(src: Path, dst: Path):
    """Copy skill files from source to destination."""
    import shutil
    if dst.exists() or dst.is_symlink():
        if dst.is_symlink() or dst.is_file():
            dst.unlink()
        else:
            shutil.rmtree(dst)
    shutil.copytree(src, dst)


def _create_symlink(target: Path, link: Path):
    """Create a symlink, with fallback to copy on Windows."""
    link.parent.mkdir(parents=True, exist_ok=True)

    # Remove existing link/directory
    if link.exists() or link.is_symlink():
        if link.is_symlink():
            link.unlink()
        elif link.is_dir():
            import shutil
            shutil.rmtree(link)

    # Try symlink first, fall back to copy
    try:
        # Calculate relative path from link to target
        rel_target = os.path.relpath(target, link.parent)
        link.symlink_to(rel_target)
    except OSError:
        # Windows without admin/dev mode - fall back to copy
        _copy_skill_files(target, link)


def _add_to_git_exclude(base_path: Path, pattern: str):
    """Add pattern to .git/info/exclude if not already present."""
    exclude_file = base_path / '.git' / 'info' / 'exclude'
    if not exclude_file.parent.exists():
        return

    existing = exclude_file.read_text() if exclude_file.exists() else ''
    if pattern not in existing:
        with exclude_file.open('a') as f:
            f.write(f'\n{pattern}\n')


@cli.group('skills')
def skills_group():
    """Manage evals agent skill."""
    pass


@skills_group.command('add')
@click.option('--global', '-g', 'global_', is_flag=True, help='Install globally (to home directory)')
@click.option('--agents', is_flag=True, help='Install canonical source to .agents/')
@click.option('--claude', is_flag=True, help='Install for Claude Code (.claude/)')
@click.option('--codex', is_flag=True, help='Install for OpenAI Codex (.codex/)')
@click.option('--cursor', is_flag=True, help='Install for Cursor (.cursor/)')
@click.option('--windsurf', is_flag=True, help='Install for Windsurf (.windsurf/)')
@click.option('--kiro', is_flag=True, help='Install for Kiro (.kiro/)')
@click.option('--roo', is_flag=True, help='Install for Roo (.roo/)')
def skills_add(global_: bool, agents: bool, claude: bool, codex: bool, cursor: bool, windsurf: bool, kiro: bool, roo: bool):
    """Install evals skill for AI coding agents. Overwrites existing."""
    import ezvals

    version = ezvals.__version__
    source = _get_skill_source_path()

    if not source.exists():
        console.print('[red]Error: Skill files not found in package[/red]')
        sys.exit(1)

    base_path = Path.home() if global_ else Path.cwd()
    target_agent_flags = {
        'claude': claude,
        'codex': codex,
        'cursor': cursor,
        'windsurf': windsurf,
        'kiro': kiro,
        'roo': roo,
    }
    target_agents = [agent for agent in SUPPORTED_AGENTS if target_agent_flags[agent]]

    if not agents and not target_agents:
        console.print('Error: Please specify at least one agent target flag (e.g. --claude, --codex, --agents).')
        sys.exit(1)

    if agents:
        canonical_agent = 'agents'
        canonical_path = base_path / '.agents' / 'skills' / 'evals'
    else:
        canonical_agent = target_agents[0]
        canonical_path = base_path / f'.{canonical_agent}' / 'skills' / 'evals'

    # Copy skill files to canonical location
    _copy_skill_files(source, canonical_path)

    # Create symlinks from other agents to canonical
    linked_targets = []
    for agent in target_agents:
        agent_skill_path = base_path / f'.{agent}' / 'skills' / 'evals'
        if agent_skill_path != canonical_path:
            _create_symlink(canonical_path, agent_skill_path)
            linked_targets.append(f'.{agent}')

    # Keep .agents/ local installations out of git status noise.
    if canonical_agent == 'agents' and not global_:
        _add_to_git_exclude(base_path, '.agents/')

    # Output
    console.print(f'[green]Evals skill v{version} installed:[/green]')
    if canonical_agent == 'agents':
        console.print('  Source: .agents/skills/evals/')
    else:
        console.print(f'  Source: .{canonical_agent}/skills/evals/')

    if linked_targets:
        console.print(f'  Linked: {", ".join(linked_targets)}')

    if canonical_agent == 'agents' and not global_:
        console.print('\n[dim]Note: Added .agents/ to .git/info/exclude[/dim]')

    console.print('\n[cyan]Invoke with /evals in your agent.[/cyan]')


@skills_group.command('remove')
@click.option('--global', '-g', 'global_', is_flag=True, help='Remove from global location (home directory)')
def skills_remove(global_: bool):
    """Remove evals skill from agents."""
    import shutil

    base_path = Path.home() if global_ else Path.cwd()
    removed = []

    # Remove from all agent directories
    for agent in SUPPORTED_AGENTS:
        skill_path = base_path / f'.{agent}' / 'skills' / 'evals'
        if skill_path.exists() or skill_path.is_symlink():
            if skill_path.is_symlink():
                skill_path.unlink()
            else:
                shutil.rmtree(skill_path)
            removed.append(agent)

    # Also check .agents/
    agents_skill_path = base_path / '.agents' / 'skills' / 'evals'
    if agents_skill_path.exists():
        shutil.rmtree(agents_skill_path)
        removed.append('agents')

    if removed:
        console.print(f'[green]Removed evals skill from: {", ".join(f".{a}" for a in removed)}[/green]')
    else:
        console.print('[yellow]No evals skill installation found.[/yellow]')


@skills_group.command('doctor')
@click.option('--global', '-g', 'global_', is_flag=True, help='Check global installation (home directory)')
def skills_doctor(global_: bool):
    """Check skill installation status."""
    import ezvals

    version = ezvals.__version__
    base_path = Path.home() if global_ else Path.cwd()

    console.print('[bold]EZVals Skill Doctor[/bold]')
    console.print('─' * 20)
    console.print(f'Package version: {version}')
    console.print()

    scope = 'Global (~/)' if global_ else f'Project ({base_path.name}/)'
    console.print(f'[bold]{scope}[/bold]')

    # Find canonical source
    canonical_path = None
    canonical_label = None

    # Check .agents/ first as potential canonical
    agents_path = base_path / '.agents' / 'skills' / 'evals'
    if agents_path.exists() and not agents_path.is_symlink():
        canonical_path = agents_path
        canonical_label = '.agents/skills/evals/'

    # Check agent dirs
    for agent in SUPPORTED_AGENTS:
        skill_path = base_path / f'.{agent}' / 'skills' / 'evals'
        if skill_path.exists() and not skill_path.is_symlink():
            canonical_path = skill_path
            canonical_label = f'.{agent}/skills/evals/'
            break

    if canonical_path:
        # Read version from skill file
        skill_file = canonical_path / 'SKILL.md'
        skill_version = None
        if skill_file.exists():
            content = skill_file.read_text()
            import re
            match = re.search(r'Version:\s*([0-9.]+)', content)
            if match:
                skill_version = match.group(1)

        if skill_version:
            console.print(f'  Source: {canonical_label}  [green]✓[/green] v{skill_version}')
        else:
            console.print(f'  Source: {canonical_label}  [green]✓[/green]')

        # Check symlinks
        console.print('  Symlinks:')
        for agent in SUPPORTED_AGENTS:
            skill_path = base_path / f'.{agent}' / 'skills' / 'evals'
            if skill_path == canonical_path:
                continue

            if skill_path.is_symlink():
                target = skill_path.resolve()
                if target == canonical_path.resolve():
                    console.print(f'    .{agent}/skills/evals    [green]✓ linked[/green]')
                else:
                    console.print(f'    .{agent}/skills/evals    [yellow]⚠ linked elsewhere[/yellow]')
            elif skill_path.exists():
                console.print(f'    .{agent}/skills/evals    [yellow]⚠ copy (not symlink)[/yellow]')
            else:
                console.print(f'    .{agent}/skills/evals    [dim]✗ not installed[/dim]')
    else:
        console.print('  [yellow]No evals skill found.[/yellow]')

    console.print()
    console.print("[dim]Run 'ezvals skills add' to install or fix.[/dim]")


def main():
    cli()


if __name__ == '__main__':
    main()
