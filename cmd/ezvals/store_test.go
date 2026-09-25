package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func manifest(ids ...string) Event {
	e := Event{Type: "evals"}
	for _, id := range ids {
		e.Evals = append(e.Evals, Eval{ID: id, Function: id, Input: "in-" + id})
	}
	return e
}

func result(id, output string, passed bool) Event {
	return Event{Type: "result", ID: id, Results: []Result{{Output: output, Scores: []Score{{Key: "pass", Passed: &passed}}, Latency: ptr(1.0)}}}
}

func statuses(run *Run) []string {
	var out []string
	for _, row := range run.Results {
		out = append(out, row.Result.Status)
	}
	return out
}

func TestMaterializeStatuses(t *testing.T) {
	run := materialize([]Event{
		{Type: "run", RunID: "r1", RunName: "first"},
		manifest("a", "b", "c", "d"),
		{Type: "queued", IDs: []string{"a", "b", "c"}},
		{Type: "started", ID: "a"},
		result("a", "A", true),
		{Type: "started", ID: "b"},
		{Type: "cancelled", IDs: []string{"b", "c"}},
		{Type: "renamed", RunName: "second"},
	})
	if got := statuses(run); !slices.Equal(got, []string{"completed", "cancelled", "cancelled", "not_started"}) {
		t.Fatalf("statuses = %v", got)
	}
	if run.RunName != "second" || run.TotalPassed != 1 || run.TotalEvaluations != 4 || run.AverageLatency != 1 {
		t.Fatalf("run = %+v", run)
	}
	if run.Results[3].Result.Input != "in-d" {
		t.Fatalf("not-started rows show the manifest input, got %v", run.Results[3].Result.Input)
	}
}

func TestTotalsCountOutcomes(t *testing.T) {
	mixed := Event{Type: "result", ID: "mixed", Results: []Result{{Scores: []Score{{Key: "a", Passed: ptr(true)}, {Key: "b", Passed: ptr(false)}}}}}
	scored := Event{Type: "result", ID: "scored", Results: []Result{{Scores: []Score{{Key: "sim", Value: 0.5}}}}}
	crashed := Event{Type: "result", ID: "crashed", Results: []Result{{Error: ptr("boom")}}}
	run := materialize([]Event{manifest("pass", "mixed", "scored", "crashed"), result("pass", "x", true), mixed, scored, crashed})
	if run.TotalPassed != 1 || run.TotalFailed != 1 || run.TotalErrors != 1 {
		t.Fatalf("a result with any failing score is failed, not passed: %+v", run)
	}
}

func TestRerunHidesOldOutputButKeepsAnnotations(t *testing.T) {
	note, _ := json.Marshal("keep me")
	failed, _ := json.Marshal([]Score{{Key: "pass", Passed: ptr(false)}})
	events := []Event{
		manifest("a"),
		result("a", "old", true),
		{Type: "edit", ID: "a", Field: "annotation", Value: note},
		{Type: "edit", ID: "a", Field: "scores", Value: failed},
	}
	edited := materialize(events).Results[0].Result
	if *edited.Annotation != "keep me" || *edited.Scores[0].Passed || len(edited.CorrectionHistory) != 2 {
		t.Fatalf("edits not applied: %+v", edited)
	}

	events = append(events, Event{Type: "queued", IDs: []string{"a"}})
	pending := materialize(events).Results[0].Result
	if pending.Status != "pending" || pending.Output != nil || *pending.Annotation != "keep me" {
		t.Fatalf("pending rerun = %+v", pending)
	}

	rerun := materialize(append(events, result("a", "new", true))).Results[0].Result
	if rerun.Output != "new" || !*rerun.Scores[0].Passed || *rerun.Annotation != "keep me" {
		t.Fatalf("a rerun's scores replace old score edits, annotations survive: %+v", rerun)
	}
}

func TestMultipleResultsPerEval(t *testing.T) {
	run := materialize([]Event{
		manifest("a", "b"),
		{Type: "result", ID: "a", Results: []Result{{Output: 1}, {Output: 2}}},
		{Type: "edit", ID: "a", N: 1, Field: "annotation", Value: json.RawMessage(`"second"`)},
	})
	if len(run.Results) != 3 || run.Results[1].Result.Annotation == nil || run.TotalFunctions != 2 {
		t.Fatalf("results = %+v", run.Results)
	}
}

func TestStoreLifecycle(t *testing.T) {
	store := openStore(t.TempDir())
	create := func(id, name string, overwrite bool) {
		if err := store.Create(Event{Type: "run", RunID: id, SessionName: "s", RunName: name}, overwrite); err != nil {
			t.Fatal(err)
		}
	}
	create("r1", "baseline", true)
	create("r2", "baseline", false)
	if len(store.Runs("s")) != 2 {
		t.Fatal("overwrite=false keeps runs with the same name")
	}
	if _, err := store.FindByName("s", "baseline"); err == nil {
		t.Fatal("duplicate run names are ambiguous")
	}
	create("r3", "baseline", true)
	if runs := store.Runs("s"); len(runs) != 1 || runs[0].RunID != "r3" {
		t.Fatalf("overwrite=true replaces same-name runs, got %d", len(runs))
	}
	if err := store.Append("r3", manifest("a"), result("a", "x", true)); err != nil {
		t.Fatal(err)
	}
	if run, _ := store.Load("r3"); run.Results[0].Result.Output != "x" {
		t.Fatalf("appended events not loaded: %+v", run)
	}
	path, _ := store.file("r3")
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	f.WriteString(`{"type":"result","id":"a","res`) // an append in progress
	f.Close()
	if run, err := store.Load("r3"); err != nil || run.Results[0].Result.Output != "x" {
		t.Fatalf("a torn last line should be ignored: %v", err)
	}
	if store.Delete("r3") != nil || store.DeleteSession("s") != nil || len(store.Sessions()) != 0 {
		t.Fatal("delete failed")
	}
}

func TestLegacyRunsAreMigrated(t *testing.T) {
	dir := t.TempDir()
	legacy := `{"session_name": "s", "run_name": "old", "run_id": "abc", "created_at": 5, "path": "evals.py",
		"results": [{"function": "f", "dataset": "d", "labels": [], "result": {"input": 1, "output": 2, "status": "completed",
		"scores": [{"key": "pass", "passed": true}], "annotation": "nice"}}]}`
	os.MkdirAll(filepath.Join(dir, "s"), 0o755)
	os.WriteFile(filepath.Join(dir, "s", "old_abc.json"), []byte(legacy), 0o644)
	store := openStore(dir)
	run, err := store.Load("abc")
	if err != nil {
		t.Fatal(err)
	}
	r := run.Results[0].Result
	if run.RunName != "old" || run.Path != "evals.py" || r.Output != float64(2) || *r.Annotation != "nice" || r.Status != "completed" {
		t.Fatalf("migrated run = %+v", run)
	}
	if _, err := os.Stat(filepath.Join(dir, "s", "old_abc.json")); err == nil {
		t.Fatal("legacy file should be replaced")
	}
}

func TestFilterEvals(t *testing.T) {
	qa, other := "qa", "other"
	evals := []Eval{
		{ID: "1", Function: "test_a", Dataset: &qa, Labels: []string{"prod"}},
		{ID: "2", Function: "test_math[low]", Dataset: &other},
		{ID: "3", Function: "test_math[high]", Dataset: &qa, Labels: []string{"dev"}},
	}
	cases := []struct {
		datasets  string
		labels    []string
		selectors []string
		want      []string
	}{
		{"qa,other", nil, nil, []string{"1", "2", "3"}},
		{"qa", []string{"dev", "nope"}, nil, []string{"3"}},
		{"", nil, []string{"test_math"}, []string{"2", "3"}},
		{"", nil, []string{"test_math@high", "test_a"}, []string{"1", "3"}},
		{"", nil, []string{"test_math[low]"}, []string{"2"}},
	}
	for _, c := range cases {
		if got := ids(filterEvals(evals, c.datasets, c.labels, c.selectors)); !slices.Equal(got, c.want) {
			t.Errorf("filter(%q, %v, %v) = %v, want %v", c.datasets, c.labels, c.selectors, got, c.want)
		}
	}
}

func TestScoreEditReplacesScoresAndKeepsBefore(t *testing.T) {
	original := Event{Type: "result", ID: "a", Results: []Result{{Scores: []Score{{Key: "pass", Value: 0.9, Notes: ptr("judge")}}}}}
	run := materialize([]Event{manifest("a"), original,
		{Type: "edit", ID: "a", Field: "scores", Value: json.RawMessage(`[{"key":"pass","passed":true}]`)}})
	r := run.Results[0].Result
	if len(r.Scores) != 1 || r.Scores[0].Value != nil || r.Scores[0].Notes != nil || !*r.Scores[0].Passed {
		t.Fatalf("the edit should replace the score, not merge into it: %+v", r.Scores)
	}
	if before := r.CorrectionHistory[0].Before.([]Score); before[0].Value != 0.9 || *before[0].Notes != "judge" || before[0].Passed != nil {
		t.Fatalf("before should be the original scores: %+v", before)
	}
}

func TestCleanRunName(t *testing.T) {
	for in, want := range map[string]string{"  baseline run! ": "baseline run!", "   ": "", "a\tb\nc": "abc", strings.Repeat("x", 150): strings.Repeat("x", 100)} {
		if got := cleanRunName(in); got != want {
			t.Errorf("cleanRunName(%q) = %q, want %q", in, got, want)
		}
	}
}
