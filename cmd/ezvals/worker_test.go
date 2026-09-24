package main

import (
	"os"
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
