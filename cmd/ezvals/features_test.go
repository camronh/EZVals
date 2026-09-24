package main

import (
	"bytes"
	"net/http/httptest"
	"testing"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/proto"
)

func TestTrialsPassAtK(t *testing.T) {
	evals := expandTrials([]Eval{{ID: "a", Function: "a"}, {ID: "b", Function: "b", Trials: 2}}, 0)
	if got := ids(evals); len(got) != 3 || got[1] != "b~1" || evals[2].Trial != 2 || evals[2].TrialOf != "b" {
		t.Fatalf("per-eval trials expand into ids ~1..N: %v", got)
	}
	evals = expandTrials(evals[:1], 3)
	run := materialize([]Event{
		{Type: "evals", Evals: append(evals, expandTrials([]Eval{{ID: "c", Function: "c"}}, 3)...)},
		result("a~1", "x", true), result("a~2", "x", false), result("a~3", "x", true),
		result("c~1", "x", true), result("c~2", "x", true), result("c~3", "x", true),
	})
	if run.Trials != 3 || *run.PassAtK != 1 || *run.PassAllK != 0.5 {
		t.Fatalf("trials=%d pass@k=%v pass^k=%v", run.Trials, *run.PassAtK, *run.PassAllK)
	}
}

func TestRegradeKeepsSpansAndRerunClearsThem(t *testing.T) {
	spans := Event{Type: "spans", ID: "a", Spans: []Span{{Name: "llm"}}}
	events := []Event{manifest("a"), spans, result("a", "x", true)}
	regraded := materialize(append(events, Event{Type: "queued", IDs: []string{"a"}, Grade: true}, result("a", "x", false)))
	if regraded.Results[0].SpanCount != 1 || regraded.Results[0].Result.Output != "x" {
		t.Fatalf("regrade keeps the target's spans: %+v", regraded.Results[0])
	}
	rerun := materialize(append(events, Event{Type: "queued", IDs: []string{"a"}}))
	if rerun.Results[0].SpanCount != 0 {
		t.Fatal("a rerun starts with no spans")
	}
}

func TestRegradeJobsNeedATarget(t *testing.T) {
	run := materialize([]Event{
		manifest("with", "without", "pending"),
		result("with", "x", true), result("without", "y", true),
		{Type: "queued", IDs: []string{"pending"}},
	})
	current := []Eval{{ID: "with", Target: true}, {ID: "without"}, {ID: "pending", Target: true}}
	jobs, noTarget := regradeJobs(run, current, nil)
	if len(jobs) != 1 || jobs[0].ID != "with" || jobs[0].Grade.Output != "x" || noTarget != 1 {
		t.Fatalf("jobs=%+v noTarget=%d", jobs, noTarget)
	}

	// serve passes the manifest already expanded into trials
	trials := expandTrials([]Eval{{ID: "t", Function: "t", Target: true}}, 2)
	run = materialize([]Event{{Type: "evals", Evals: trials}, result("t~1", "x", true), result("t~2", "y", false)})
	jobs, _ = regradeJobs(run, trials, []int{1})
	if len(jobs) != 1 || jobs[0].ID != "t~2" || jobs[0].Eval != "t" || !run.Results[1].Regradable {
		t.Fatalf("trial jobs=%+v", jobs)
	}
}

func TestCollectorGroupsSpansByEval(t *testing.T) {
	str := func(k, v string) *commonpb.KeyValue {
		return &commonpb.KeyValue{Key: k, Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: v}}}
	}
	tokens := &commonpb.KeyValue{Key: "gen_ai.usage.input_tokens", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_IntValue{IntValue: 12}}}
	export := &tracepb.TracesData{ResourceSpans: []*tracepb.ResourceSpans{{ScopeSpans: []*tracepb.ScopeSpans{{Spans: []*tracepb.Span{
		{TraceId: []byte{1}, SpanId: []byte{2}, Name: "chat", Attributes: []*commonpb.KeyValue{str(evalIDAttribute, "e1"), tokens},
			Status: &tracepb.Status{Code: tracepb.Status_STATUS_CODE_ERROR, Message: "rate limited"}},
		{SpanId: []byte{3}, Name: "untagged"},
		{SpanId: []byte{4}, Name: "eval", Attributes: []*commonpb.KeyValue{str(evalIDAttribute, "e2")}},
	}}}}}}
	body, _ := proto.Marshal(export)
	var got []Event
	c := &Collector{}
	c.Track("run1", func(es ...Event) { got = append(got, es...) })
	req := httptest.NewRequest("POST", "/otlp/run1/v1/traces", bytes.NewReader(body))
	req.SetPathValue("run", "run1")
	c.ServeHTTP(httptest.NewRecorder(), req)
	if len(got) != 2 || got[0].ID != "e1" || got[1].ID != "e2" {
		t.Fatalf("events = %+v", got)
	}
	chat := got[0].Spans[0]
	if chat.TraceID != "01" || chat.Status != "error" || chat.StatusMessage != "rate limited" ||
		chat.Attributes["gen_ai.usage.input_tokens"] != int64(12) || chat.Attributes[evalIDAttribute] != nil {
		t.Fatalf("span = %+v", chat)
	}
}

func TestQueryOverRuns(t *testing.T) {
	store := openStore(t.TempDir())
	store.Create(Event{Type: "run", RunID: "r1", SessionName: "s", RunName: "baseline"}, true)
	store.Append("r1", manifest("a", "b"), result("a", "x", true), result("b", "y", false),
		Event{Type: "spans", ID: "a", Spans: []Span{{Name: "chat", Start: 0, End: 2e6, Attributes: map[string]any{"tokens": 7}}}})
	db, err := loadRunsDB(store)
	if err != nil {
		t.Fatal(err)
	}
	var runName string
	var passedRows, scoreRows int
	var tokens, ms float64
	db.QueryRow(`SELECT run_name FROM runs`).Scan(&runName)
	db.QueryRow(`SELECT sum(passed) FROM results WHERE json_extract(output, '$') IN ('x', 'y')`).Scan(&passedRows)
	db.QueryRow(`SELECT count(*) FROM scores WHERE key = 'pass'`).Scan(&scoreRows)
	db.QueryRow(`SELECT json_extract(attributes, '$.tokens'), duration_ms FROM spans`).Scan(&tokens, &ms)
	if runName != "baseline" || passedRows != 1 || scoreRows != 2 || tokens != 7 || ms != 2 {
		t.Fatalf("run=%q passed=%d scores=%d tokens=%v ms=%v", runName, passedRows, scoreRows, tokens, ms)
	}
}
