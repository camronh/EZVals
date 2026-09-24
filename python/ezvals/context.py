from dataclasses import dataclass, field
from typing import Any, Optional


class TraceData(dict):
    """Trace/debug data. A dict with attribute access; `messages` and `trace_url` are always readable."""

    def __getattr__(self, key):
        if key == "messages":
            return self.setdefault("messages", [])
        if key == "trace_url":
            return self.get("trace_url")
        try:
            return self[key]
        except KeyError:
            raise AttributeError(key) from None

    def __setattr__(self, key, value):
        self[key] = list(value) if key == "messages" else value

    def add_messages(self, messages: list) -> "TraceData":
        """Replace messages (does not append)."""
        self["messages"] = list(messages)
        return self


def normalize_score(score: Any, default_key: Optional[str]) -> dict:
    if isinstance(score, bool):
        score = {"passed": score}
    elif isinstance(score, (int, float)):
        score = {"value": score}
    score = dict(score)
    if score.get("value") is None and score.get("passed") is None:
        raise ValueError("Either 'value' or 'passed' must be provided in score")
    if "key" not in score:
        if default_key is None:
            raise ValueError("Must specify score key or set default_score_key")
        score["key"] = default_key
    return score


@dataclass
class EvalResult:
    input: Any
    output: Any
    reference: Any = None
    scores: list = field(default_factory=list)
    error: Optional[str] = None
    latency: Optional[float] = None
    metadata: dict = field(default_factory=dict)
    trace_data: TraceData = field(default_factory=TraceData)

    def __post_init__(self):
        scores = self.scores if isinstance(self.scores, list) else [self.scores] if self.scores else []
        self.scores = [normalize_score(s, "pass") for s in scores]
        self.metadata = self.metadata or {}
        self.trace_data = TraceData(self.trace_data or {})


class EvalContext:
    """Mutable builder for an EvalResult. Injected into any eval parameter annotated as EvalContext."""

    def __init__(self, input=None, output=None, reference=None, default_score_key: Optional[str] = "pass",
                 metadata=None, trace_data=None, latency=None, function_name=None, dataset=None, labels=None,
                 **run_info):
        self.input = input
        self.output = output
        self.reference = reference
        self.default_score_key = default_score_key
        self.metadata = dict(metadata or {})
        self.trace_data = TraceData(trace_data or {})
        self.latency = latency
        self.scores: list = []
        self.error: Optional[str] = None
        self.function_name = function_name
        self.dataset = dataset
        self.labels = labels
        self._run = run_info

    def store(self, input=None, output=None, reference=None, latency=None, scores=None, messages=None,
              trace_url=None, metadata=None, trace_data=None) -> "EvalContext":
        """Set any fields passed. Scores with an existing key overwrite it; metadata and trace_data merge."""
        if input is not None:
            self.input = input
        if output is not None:
            self.output = output
        if reference is not None:
            self.reference = reference
        if latency is not None:
            self.latency = latency
        if trace_data is not None:
            self.trace_data.update(trace_data)
        if messages is not None:
            self.trace_data.messages = messages
        if trace_url is not None:
            self.trace_data.trace_url = trace_url
        if metadata is not None:
            self.metadata.update(metadata)
        for score in scores if isinstance(scores, list) else [] if scores is None else [scores]:
            score = normalize_score(score, self.default_score_key)
            keys = [s["key"] for s in self.scores]
            if score["key"] in keys:
                self.scores[keys.index(score["key"])] = score
            else:
                self.scores.append(score)
        return self

    def build(self) -> EvalResult:
        scores = self.scores or ([] if self.error else [{"key": self.default_score_key or "pass", "passed": True}])
        return EvalResult(input=self.input, output=self.output, reference=self.reference, scores=scores,
                          error=self.error, latency=self.latency, metadata=self.metadata, trace_data=self.trace_data)

    def build_with_error(self, error: str) -> EvalResult:
        self.error = error
        return self.build()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


for _name in ("run_id", "session_name", "run_name", "eval_path"):
    setattr(EvalContext, _name, property(lambda self, n=_name: self._run.get(n)))
EvalContext.config = property(lambda self: self._run.get("config") or {})
