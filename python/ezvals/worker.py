"""Worker process the ezvals host spawns to run Python evals.

Protocol (JSON lines): the worker writes {"type": "evals"} once discovery finishes, then reads
{"run": id} requests from stdin and answers each with {"type": "result"}. Evals run concurrently;
the worker exits once stdin closes and in-flight evals finish. User output goes to stderr.
"""
import asyncio
import dataclasses
import json
import os
import sys
import traceback

from ezvals.evals import discover


def main():
    protocol = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    def send(message):
        protocol.write(json.dumps(message, default=_jsonable) + "\n")

    run_info = json.loads(os.environ.get("EZVALS_RUN") or "{}")
    try:
        evals = {e.id: e for e in discover(sys.argv[1:])}
    except Exception:
        send({"type": "error", "error": traceback.format_exc()})
        sys.exit(1)
    send({"type": "evals", "evals": [{
        "id": e.id, "function": e.name, "dataset": e.params["dataset"], "labels": e.params["labels"],
        "input": e.params.get("input"), "reference": e.params.get("reference"), "metadata": e.params.get("metadata"),
    } for e in evals.values()]})

    async def run(eval_id):
        results = await evals[eval_id].run(run_info)
        send({"type": "result", "id": eval_id, "results": [dataclasses.asdict(r) for r in results]})

    async def serve():
        loop = asyncio.get_running_loop()
        tasks = set()
        while line := await loop.run_in_executor(None, sys.stdin.readline):
            tasks.add(asyncio.create_task(run(json.loads(line)["run"])))
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
