"""Worker process the ezvals host spawns to run Python evals.

Protocol (JSON lines): the worker writes {"type": "evals"} once discovery finishes, then reads
{"id", "run", "grade"?} requests from stdin and answers each with {"type": "result", "id"}. Evals run
concurrently; the worker exits once stdin closes and in-flight evals finish. User output goes to stderr.
"""
import asyncio
import dataclasses
import json
import os
import sys

from ezvals.evals import describe, discover


def main():
    protocol = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    sys.stdout.reconfigure(line_buffering=True)  # user prints show up as they happen with --verbose

    def send(message):
        try:
            line = json.dumps(message, default=_jsonable, allow_nan=False)
        except ValueError:  # NaN/Infinity aren't JSON: send them as null
            line = json.dumps(json.loads(json.dumps(message, default=_jsonable), parse_constant=lambda _: None))
        protocol.write(line + "\n")

    run_info = json.loads(os.environ.get("EZVALS_RUN") or "{}")
    try:
        evals = {e.id: e for e in discover(sys.argv[1:])}
    except Exception as error:
        send({"type": "error", "error": describe(error)})
        sys.exit(1)
    send({"type": "evals", "evals": [{
        "id": e.id, "function": e.name, "dataset": e.params["dataset"], "labels": e.params["labels"],
        "input": e.params.get("input"), "reference": e.params.get("reference"), "metadata": e.params.get("metadata"),
        "trials": e.params.get("trials"), "target": bool(e.params.get("target")),
    } for e in evals.values()]})

    async def run(request):
        try:
            results = await evals[request["run"]].run(run_info, request.get("grade"))
            send({"type": "result", "id": request["id"], "results": [vars(r) for r in results]})
        except Exception as error:  # the host waits for every result, so one that can't be reported becomes an error
            send({"type": "result", "id": request["id"], "results": [{"error": describe(error)}]})

    async def serve():
        loop = asyncio.get_running_loop()
        tasks = set()
        while line := await loop.run_in_executor(None, sys.stdin.readline):
            tasks.add(asyncio.create_task(run(json.loads(line))))
        await asyncio.gather(*tasks)

    asyncio.run(serve())


def _jsonable(obj):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    return str(obj)


if __name__ == "__main__":
    main()
