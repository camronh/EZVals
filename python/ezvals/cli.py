import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

BINARY = Path(__file__).parent / "bin" / ("ezvals.exe" if os.name == "nt" else "ezvals")


def main():
    """`ezvals` console script: hand off to the bundled host binary."""
    env = {**os.environ, "EZVALS_PYTHON": sys.executable}
    if os.name == "nt":
        sys.exit(subprocess.run([str(BINARY), *sys.argv[1:]], env=env).returncode)
    os.execve(BINARY, [str(BINARY), *sys.argv[1:]], env)


def run(path: str, dataset: Optional[str] = None, labels: Optional[list] = None, limit: Optional[int] = None,
        output: Optional[str] = None, concurrency: Optional[int] = None, timeout: Optional[float] = None,
        trials: Optional[int] = None, session: Optional[str] = None, run_name: Optional[str] = None, no_save: bool = False,
        config: Optional[str] = None) -> dict:
    """Programmatic `ezvals run`. Returns the run (results, totals, ids) plus `saved_path`."""
    flags = {"--dataset": dataset, "--limit": limit, "--output": output, "--concurrency": concurrency,
             "--timeout": timeout, "--trials": trials, "--session": session, "--run-name": run_name, "--config": config}
    args = [str(BINARY), "run", path, "--json"]
    args += [arg for flag, value in flags.items() if value is not None for arg in (flag, str(value))]
    args += [arg for label in labels or [] for arg in ("--label", label)]
    args += ["--no-save"] if no_save else []
    proc = subprocess.run(args, capture_output=True, text=True, env={**os.environ, "EZVALS_PYTHON": sys.executable})
    if proc.returncode != 0:
        raise ValueError(proc.stderr.strip())
    return json.loads(proc.stdout)
