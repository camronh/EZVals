package main

import (
	"os"
	"os/exec"
	"strings"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestWorkerCrashFailsRemainingEvals(t *testing.T) {
	root, _ := filepath.Abs("../..")
	t.Setenv("EZVALS_PYTHON", filepath.Join(root, "python", ".venv", "bin", "python"))
	t.Chdir(t.TempDir())
	os.WriteFile("evals.py", []byte(`
import os
from ezvals import eval, EvalContext

@eval
def crashes(ctx: EvalContext):
    os._exit(3)

@eval
def after(ctx: EvalContext):
    ctx.output = 1
`), 0o644)
	workers, evals, err := startWorkers("evals.py", RunInfo{}, false)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	errors := map[string]bool{}
	x := execute(workers, jobs(evals), 1, func(es ...Event) {
		mu.Lock()
		defer mu.Unlock()
		for _, e := range es {
			if e.Type == "result" {
				errors[e.ID] = e.Results[0].Error != nil
			}
		}
	})
	select {
	case <-x.Done:
	case <-time.After(10 * time.Second):
		t.Fatal("run hung after its worker crashed")
	}
	if len(errors) != 2 || !errors["evals.py::crashes"] || !errors["evals.py::after"] {
		t.Fatalf("both evals should fail once the worker is gone, got %v", errors)
	}
}

func TestOddResultsStillFinish(t *testing.T) {
	root, _ := filepath.Abs("../..")
	t.Setenv("EZVALS_PYTHON", filepath.Join(root, "python", ".venv", "bin", "python"))
	t.Chdir(t.TempDir())
	os.WriteFile("evals.py", []byte(`
from ezvals import eval, EvalContext

@eval
def text_score(ctx: EvalContext):
    ctx.store(scores=[{"key": "grade", "value": "A"}, {"key": "ok", "value": True}])

@eval
def nan_score(ctx: EvalContext):
    ctx.store(output=float("inf"), scores={"key": "sim", "value": float("nan")})
`), 0o644)
	workers, evals, err := startWorkers("evals.py", RunInfo{}, false)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	results := map[string]Result{}
	x := execute(workers, jobs(evals), 0, func(es ...Event) { // concurrency 0 means 1, not a deadlock
		mu.Lock()
		defer mu.Unlock()
		for _, e := range es {
			if e.Type == "result" {
				results[e.ID] = e.Results[0]
			}
		}
	})
	select {
	case <-x.Done:
	case <-time.After(10 * time.Second):
		t.Fatal("run hung")
	}
	stopWorkers(workers)
	if s := results["evals.py::text_score"].Scores; len(s) != 2 || s[0].Value != "A" || s[1].Value != true {
		t.Fatalf("text and bool scores = %+v", s)
	}
	nan := results["evals.py::nan_score"]
	if nan.Error != nil || nan.Output != nil || nan.Scores[0].Value != nil {
		t.Fatalf("NaN and Infinity should arrive as null, got %+v", nan)
	}
}

func TestUnreadableResultFailsItsEval(t *testing.T) {
	root, _ := filepath.Abs("../..")
	t.Setenv("EZVALS_PYTHON", filepath.Join(root, "python", ".venv", "bin", "python"))
	t.Chdir(t.TempDir())
	os.WriteFile("evals.py", []byte(`
import sys
from ezvals import eval, EvalContext

@eval
def bad(ctx: EvalContext):
    ctx.output = 1
`), 0o644)
	os.WriteFile("fake_worker.py", []byte(`
import json, sys
print(json.dumps({"type": "evals", "evals": [{"id": "evals.py::bad", "function": "bad"}]}), flush=True)
for line in sys.stdin:
    print(json.dumps({"type": "result", "id": json.loads(line)["id"], "results": [{"latency": "slow"}]}), flush=True)
`), 0o644)
	python := filepath.Join(root, "python", ".venv", "bin", "python")
	w, err := spawn(exec.Command(python, "fake_worker.py"), "{}", false)
	if err != nil {
		t.Fatal(err)
	}
	var got *string
	x := execute([]*Worker{w}, jobs(w.evals), 1, func(es ...Event) {
		for _, e := range es {
			if e.Type == "result" {
				got = e.Results[0].Error
			}
		}
	})
	select {
	case <-x.Done:
	case <-time.After(10 * time.Second):
		t.Fatal("run hung on an unreadable result")
	}
	stopWorkers([]*Worker{w})
	if got == nil || !strings.Contains(*got, "Invalid result") {
		t.Fatalf("error = %v", got)
	}
}
