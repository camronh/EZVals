package main

import (
	"encoding/json"
	"flag"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var update = flag.Bool("update", false, "rewrite conformance/*.expected.json from the Python SDK's output")

// Every SDK must produce the same results for the same fixture (conformance/<name>.py, <name>.eval.ts, ...).
func TestConformance(t *testing.T) {
	root, _ := filepath.Abs("../..")
	binary := filepath.Join(t.TempDir(), "ezvals")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	fixtures, _ := filepath.Glob(filepath.Join(root, "conformance", "*.expected.json"))
	if *update {
		fixtures, _ = filepath.Glob(filepath.Join(root, "conformance", "*.py"))
	}
	for _, fixture := range fixtures {
		name := strings.TrimSuffix(strings.TrimSuffix(filepath.Base(fixture), ".expected.json"), ".py")
		expectedPath := filepath.Join(root, "conformance", name+".expected.json")
		for _, file := range []string{name + ".py", name + ".eval.ts"} {
			t.Run(file, func(t *testing.T) {
				cmd := exec.Command(binary, "run", filepath.Join("conformance", file), "--no-save", "--run-name", "conformance", "-c", "4")
				cmd.Dir = root
				cmd.Env = append(os.Environ(),
					"EZVALS_PYTHON="+filepath.Join(root, "python", ".venv", "bin", "python"),
					"EZVALS_NODE_WORKER="+filepath.Join(root, "typescript", "src", "worker.ts"))
				start := time.Now()
				out, err := cmd.Output()
				if err != nil {
					t.Fatalf("%v\n%s", err, err.(*exec.ExitError).Stderr)
				}
				if elapsed := time.Since(start); elapsed > 4*time.Second {
					t.Errorf("took %v: timeouts must not wait for the eval to finish", elapsed)
				}
				var run Run
				json.Unmarshal(out, &run)
				got := normalize(run.Results)
				if *update && strings.HasSuffix(file, ".py") {
					os.WriteFile(expectedPath, []byte(got), 0o644)
					return
				}
				expected, _ := os.ReadFile(expectedPath)
				if got != string(expected) {
					t.Errorf("results differ from %s:\n%s", filepath.Base(expectedPath), diffLines(string(expected), got))
				}
			})
		}
	}
}

// normalize keeps the language-independent parts of each result: no ids, latencies, or error tracebacks.
func normalize(rows []Row) string {
	type result struct {
		Function  string   `json:"function"`
		Dataset   *string  `json:"dataset"`
		Labels    []string `json:"labels"`
		Status    string   `json:"status"`
		Input     any      `json:"input"`
		Output    any      `json:"output"`
		Reference any      `json:"reference"`
		Scores    []Score  `json:"scores"`
		Error     string   `json:"error,omitempty"`
		Metadata  any      `json:"metadata"`
		TraceData any      `json:"trace_data"`
	}
	var out []result
	for _, row := range rows {
		r := row.Result
		errLine := ""
		if r.Error != nil {
			errLine, _, _ = strings.Cut(*r.Error, "\n")
		}
		out = append(out, result{row.Function, row.Dataset, row.Labels, r.Status, r.Input, r.Output, r.Reference, r.Scores, errLine, r.Metadata, r.TraceData})
	}
	data, _ := json.MarshalIndent(out, "", "  ")
	return string(data) + "\n"
}

func diffLines(expected, got string) string {
	e, g := strings.Split(expected, "\n"), strings.Split(got, "\n")
	var b strings.Builder
	for i := 0; i < max(len(e), len(g)); i++ {
		var el, gl string
		if i < len(e) {
			el = e[i]
		}
		if i < len(g) {
			gl = g[i]
		}
		if el != gl {
			b.WriteString("- " + el + "\n+ " + gl + "\n")
		}
	}
	return b.String()
}
