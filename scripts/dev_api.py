"""Serve a project's evals with the Go host rebuilt from this checkout whenever its code changes.

    python scripts/dev_api.py PROJECT_DIR [ezvals serve args...]

Pair it with `npm run dev` in ui/, which hot-reloads the UI and proxies the API to port 8987.
The host runs from PROJECT_DIR with that project's Python (.venv), so its evals import its own packages.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BINARY = ROOT / "python" / "ezvals" / "bin" / "ezvals"
project = Path(sys.argv[1]).resolve()
args = sys.argv[2:] or ["evals/"]


def go_files():
    return {p: p.stat().st_mtime for p in (ROOT / "cmd" / "ezvals").rglob("*.go")}


def build():
    start = time.perf_counter()
    tmp = BINARY.with_suffix(".tmp")
    result = subprocess.run(["go", "build", "-o", str(tmp), "./cmd/ezvals"], cwd=ROOT)
    if result.returncode != 0:
        return False
    tmp.replace(BINARY)
    print(f"[dev] built in {time.perf_counter() - start:.1f}s", flush=True)
    return True


def serve():
    env = {**os.environ, "PATH": f"{project / '.venv' / 'bin'}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.Popen([str(BINARY), "serve", *args, "--no-open", "--port", "8987"], cwd=project, env=env)


seen = go_files()
build()
server = serve()
try:
    while True:
        time.sleep(0.3)
        now = go_files()
        if now != seen:
            seen = now
            if build():
                server.terminate()
                server.wait()
                server = serve()
finally:
    server.terminate()
