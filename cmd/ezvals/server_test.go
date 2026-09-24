package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const serverFixture = `
import time
from ezvals import eval, EvalContext

@eval(cases=[{"id": str(i), "input": i} for i in range(4)])
def square(ctx: EvalContext):
    time.sleep(ctx.input * 0.05)
    ctx.output = ctx.input ** 2

@eval
def slow(ctx: EvalContext):
    time.sleep(10)
`

func newTestServer(t *testing.T) (*Server, *httptest.Server, string) {
	root, _ := filepath.Abs("../..")
	t.Setenv("EZVALS_PYTHON", filepath.Join(root, "python", ".venv", "bin", "python"))
	dir := t.TempDir()
	t.Chdir(dir)
	os.WriteFile("evals.py", []byte(serverFixture), 0o644)
	s := &Server{store: openStore(filepath.Join(dir, "sessions")), session: "s", runName: "first", activeID: newRunID(), path: "evals.py"}
	s.discover()
	ts := httptest.NewServer(s.routes())
	t.Cleanup(func() {
		if s.exec != nil {
			s.exec.Stop()
		}
		ts.Close()
	})
	return s, ts, dir
}

func call(t *testing.T, ts *httptest.Server, method, path, body string) (int, map[string]any) {
	req, _ := http.NewRequest(method, ts.URL+path, strings.NewReader(body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func rowStatuses(t *testing.T, ts *httptest.Server) []string {
	_, body := call(t, ts, "GET", "/results", "")
	var out []string
	for _, r := range body["results"].([]any) {
		out = append(out, r.(map[string]any)["result"].(map[string]any)["status"].(string))
	}
	return out
}

func waitFor(t *testing.T, ts *httptest.Server, done func([]string) bool) []string {
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		if statuses := rowStatuses(t, ts); done(statuses) {
			return statuses
		}
	}
	t.Fatalf("timed out; statuses = %v", rowStatuses(t, ts))
	return nil
}

func TestServeShowsDiscoveredEvalsBeforeRunning(t *testing.T) {
	_, ts, _ := newTestServer(t)
	_, body := call(t, ts, "GET", "/results", "")
	if body["run_name"] != "first" || len(body["results"].([]any)) != 5 {
		t.Fatalf("results = %v", body)
	}
	if got := rowStatuses(t, ts); got[0] != "not_started" {
		t.Fatalf("statuses = %v", got)
	}
}

func TestSelectiveRunThenAnnotate(t *testing.T) {
	s, ts, _ := newTestServer(t)
	if code, body := call(t, ts, "POST", "/api/runs/rerun", `{"indices": [1, 2]}`); code != 200 {
		t.Fatalf("rerun: %d %v", code, body)
	}
	got := waitFor(t, ts, func(st []string) bool { return st[1] == "completed" && st[2] == "completed" })
	if got[0] != "not_started" || got[3] != "not_started" {
		t.Fatalf("only selected rows run, got %v", got)
	}
	code, body := call(t, ts, "PATCH", "/api/runs/"+s.activeID+"/results/1", `{"result": {"annotation": "checked"}}`)
	row := body["result"].(map[string]any)["result"].(map[string]any)
	if code != 200 || row["annotation"] != "checked" || len(row["correction_history"].([]any)) != 1 {
		t.Fatalf("patch: %d %v", code, body)
	}
	_, detail := call(t, ts, "GET", "/api/runs/latest/results/1", "")
	if detail["result"].(map[string]any)["result"].(map[string]any)["output"] != float64(1) {
		t.Fatalf("detail = %v", detail)
	}
}

func TestStopCancelsRemainingEvals(t *testing.T) {
	_, ts, _ := newTestServer(t)
	call(t, ts, "POST", "/api/runs/rerun", `{}`)
	waitFor(t, ts, func(st []string) bool { return st[4] == "running" })
	call(t, ts, "POST", "/api/runs/stop", "")
	if got := rowStatuses(t, ts); got[4] != "cancelled" || got[0] != "completed" {
		t.Fatalf("statuses after stop = %v", got)
	}
}

func TestNewRunKeepsThePreviousOne(t *testing.T) {
	s, ts, _ := newTestServer(t)
	call(t, ts, "POST", "/api/runs/rerun", `{"indices": [0]}`)
	waitFor(t, ts, func(st []string) bool { return st[0] == "completed" })
	first := s.activeID
	_, body := call(t, ts, "POST", "/api/runs/new", `{"run_name": "second", "indices": []}`)
	if body["run_id"] == first || body["run_name"] != "second" {
		t.Fatalf("new run = %v", body)
	}
	_, runs := call(t, ts, "GET", "/api/sessions/s/runs", "")
	if len(runs["runs"].([]any)) != 2 {
		t.Fatalf("runs = %v", runs)
	}
	call(t, ts, "POST", "/api/runs/"+first+"/activate", "")
	if got := rowStatuses(t, ts); got[0] != "completed" {
		t.Fatalf("activated run = %v", got)
	}
}

func TestErrorStates(t *testing.T) {
	s, ts, dir := newTestServer(t)
	for _, c := range []struct {
		method, path string
		code         int
		detail       string
	}{
		{"GET", "/runs/missing/results/0", 404, "Run not found"},
		{"GET", "/runs/latest/results/999", 404, "Result not found"},
		{"POST", "/api/configs/select", 400, "Config 'nope' not found in ezvals.json. Available: (none defined)"},
	} {
		code, body := call(t, ts, c.method, c.path, `{"name": "nope"}`)
		if code != c.code || body["detail"] != c.detail {
			t.Errorf("%s %s = %d %v", c.method, c.path, code, body)
		}
	}
	os.Remove(filepath.Join(dir, "evals.py"))
	if code, body := call(t, ts, "POST", "/api/runs/rerun", `{}`); code != 400 || body["detail"] != "Eval path not found: evals.py" {
		t.Errorf("deleted path: %d %v", code, body)
	}
	s.path = ""
	if code, body := call(t, ts, "POST", "/api/runs/rerun", `{}`); code != 400 || body["detail"] != "Rerun unavailable: missing eval path" {
		t.Errorf("no path: %d %v", code, body)
	}
}
