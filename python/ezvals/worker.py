"""Worker process the ezvals host spawns to run Python evals.

Protocol (JSON lines): the worker writes {"type": "evals"} once discovery finishes, then reads
{"id", "run", "grade"?} requests from stdin and answers each with {"type": "result", "id"}. Evals run
concurrently; the worker exits once stdin closes and in-flight evals finish. User output goes to stderr.
"""
import asyncio
import contextvars
import dataclasses
import json
import os
import sys

from ezvals.evals import describe, discover

current_eval = contextvars.ContextVar("ezvals_eval", default=None)


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
    provider = _trace_to(run_info.get("traces_endpoint"))

    async def run(request):
        current_eval.set(request["id"])
        e = evals[request["run"]]
        try:
            if provider:
                span_name = f"{'grade' if request.get('grade') else 'eval'} {e.name}"
                with provider.get_tracer("ezvals").start_as_current_span(span_name, attributes={"ezvals.root": True}):
                    results = await e.run(run_info, request.get("grade"))
                await asyncio.get_running_loop().run_in_executor(None, provider.force_flush)
            else:
                results = await e.run(run_info, request.get("grade"))
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


def _trace_to(endpoint):
    """Send OpenTelemetry spans recorded during each eval to the host, tagged with the eval's id.

    Only active when the project has opentelemetry-sdk and the OTLP/HTTP exporter installed. Spans also keep
    going wherever the project's own tracer provider sends them.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        return None
    if not endpoint:
        return None

    class TagWithEval(SpanProcessor):
        def on_start(self, span, parent_context=None):
            if current_eval.get():
                span.set_attribute("ezvals.eval_id", current_eval.get())

    provider = trace.get_tracer_provider()
    if not isinstance(provider, TracerProvider):
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
    provider.add_span_processor(TagWithEval())
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    return provider


def _jsonable(obj):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    return str(obj)


if __name__ == "__main__":
    main()
