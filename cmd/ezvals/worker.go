package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// Eval files by language. Python: any .py not starting with "_". TypeScript/JavaScript: *.eval.{ts,mts,js,mjs}.
func languageOf(path string) string {
	name := filepath.Base(path)
	switch {
	case strings.HasSuffix(name, ".py") && !strings.HasPrefix(name, "_"):
		return "python"
	case evalJS.MatchString(name):
		return "node"
	}
	return ""
}

var evalJS = regexp.MustCompile(`\.eval\.(ts|mts|js|mjs)$`)

// evalFiles groups the eval files at path (a file or directory) by language.
func evalFiles(path string) (map[string][]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("Path %s does not exist", path)
	}
	files := map[string][]string{}
	if !info.IsDir() {
		lang := languageOf(path)
		if lang == "" {
			return nil, fmt.Errorf("Path %s is neither an eval file nor a directory", path)
		}
		files[lang] = []string{path}
		return files, nil
	}
	err = filepath.WalkDir(path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if d.IsDir() && p != path && (strings.HasPrefix(name, ".") || strings.HasPrefix(name, "__") || name == "node_modules" || name == "venv") {
			return filepath.SkipDir
		}
		if lang := languageOf(p); !d.IsDir() && lang != "" {
			files[lang] = append(files[lang], p)
		}
		return nil
	})
	return files, err
}

// RunInfo is what an eval can read about its run (ctx.run_id, ctx.config, ...), plus the global timeout.
type RunInfo struct {
	RunID       string         `json:"run_id"`
	SessionName string         `json:"session_name"`
	RunName     string         `json:"run_name"`
	EvalPath    string         `json:"eval_path"`
	Config      map[string]any `json:"config"`
	Timeout     float64        `json:"timeout,omitempty"`
}

type message struct {
	Type    string   `json:"type"`
	Evals   []Eval   `json:"evals"`
	ID      string   `json:"id"`
	Results []Result `json:"results"`
	Error   string   `json:"error"`
}

// Worker is one SDK process. It lists its evals on startup, then runs the ids written to its stdin.
type Worker struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	messages chan message
	evals    []Eval
}

func workerCommand(lang string, files []string) (*exec.Cmd, error) {
	if lang == "python" {
		python := os.Getenv("EZVALS_PYTHON")
		if python == "" {
			python = "python3"
		}
		return exec.Command(python, append([]string{"-m", "ezvals.worker"}, files...)...), nil
	}
	script := os.Getenv("EZVALS_NODE_WORKER")
	for dir, _ := filepath.Abs(filepath.Dir(files[0])); script == "" && dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, "node_modules", "ezvals", "dist", "worker.js")
		if _, err := os.Stat(candidate); err == nil {
			script = candidate
		}
	}
	if script == "" {
		return nil, errors.New("TypeScript evals need the ezvals npm package: npm install --save-dev ezvals")
	}
	return exec.Command("node", append([]string{script}, files...)...), nil
}

// startWorkers spawns a worker per language found at path and returns them with their combined manifest.
func startWorkers(path string, info RunInfo, verbose bool) ([]*Worker, []Eval, error) {
	files, err := evalFiles(path)
	if err != nil {
		return nil, nil, err
	}
	infoJSON, _ := json.Marshal(info)
	var workers []*Worker
	var evals []Eval
	for _, lang := range []string{"python", "node"} {
		if len(files[lang]) == 0 {
			continue
		}
		cmd, err := workerCommand(lang, files[lang])
		if err == nil {
			var w *Worker
			w, err = spawn(cmd, string(infoJSON), verbose)
			workers = append(workers, w)
			if w != nil {
				evals = append(evals, w.evals...)
			}
		}
		if err != nil {
			stopWorkers(workers)
			return nil, nil, err
		}
	}
	return workers, evals, nil
}

func spawn(cmd *exec.Cmd, info string, verbose bool) (*Worker, error) {
	cmd.Env = append(os.Environ(), "EZVALS_RUN="+info)
	if verbose {
		cmd.Stderr = os.Stderr
	}
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("could not start %s: %w", cmd.Path, err)
	}
	w := &Worker{cmd: cmd, stdin: stdin, messages: make(chan message)}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(nil, 256<<20)
	go func() {
		for scanner.Scan() {
			var m message
			if err := json.Unmarshal(scanner.Bytes(), &m); err != nil {
				fmt.Fprintln(os.Stderr, "Ignoring invalid eval worker output:", scanner.Text())
				continue
			}
			w.messages <- m
		}
		cmd.Wait()
		close(w.messages)
	}()
	first, ok := <-w.messages
	switch {
	case !ok:
		return nil, errors.New("eval worker exited during discovery (run with --verbose to see its output)")
	case first.Type == "error":
		cmd.Process.Kill()
		return nil, errors.New(strings.TrimSpace(first.Error))
	}
	w.evals = first.Evals
	return w, nil
}

func stopWorkers(workers []*Worker) {
	for _, w := range workers {
		w.cmd.Process.Kill()
	}
}

// Execution runs a set of eval ids across workers with bounded concurrency, and can be paused or stopped.
type Execution struct {
	mu        sync.Mutex
	resume    *sync.Cond
	paused    bool
	stopped   bool
	remaining map[string]bool
	workers   []*Worker
	emit      func(...Event)
	Done      chan struct{}
}

func execute(workers []*Worker, ids []string, concurrency int, emit func(...Event)) *Execution {
	x := &Execution{workers: workers, emit: emit, Done: make(chan struct{}), remaining: map[string]bool{}}
	x.resume = sync.NewCond(&x.mu)
	owner := map[string]*Worker{}
	for _, w := range workers {
		for _, e := range w.evals {
			owner[e.ID] = w
		}
	}
	for _, id := range ids {
		x.remaining[id] = true
	}
	slots := make(chan struct{}, concurrency)
	var inFlight sync.WaitGroup
	for _, w := range workers {
		go func() {
			for m := range w.messages {
				x.finish(m.ID, m.Results)
				<-slots
				inFlight.Done()
			}
			// The worker exited: anything it still owed us failed.
			for id := range x.pending(w, owner) {
				x.finish(id, []Result{{Error: ptr("Eval worker exited before this eval finished (run with --verbose to see its output)")}})
				<-slots
				inFlight.Done()
			}
		}()
	}
	go func() {
		for _, id := range ids {
			slots <- struct{}{}
			x.mu.Lock()
			for x.paused && !x.stopped {
				x.resume.Wait()
			}
			if x.stopped {
				x.mu.Unlock()
				break
			}
			x.remaining[id] = false
			x.mu.Unlock()
			inFlight.Add(1)
			emit(Event{Type: "started", ID: id})
			fmt.Fprintf(owner[id].stdin, "{\"run\": %q}\n", id)
		}
		inFlight.Wait()
		for _, w := range workers {
			w.stdin.Close()
		}
		close(x.Done)
	}()
	return x
}

// pending returns the ids this worker was asked to run that have not reported back.
func (x *Execution) pending(w *Worker, owner map[string]*Worker) map[string]bool {
	x.mu.Lock()
	defer x.mu.Unlock()
	ids := map[string]bool{}
	for id, queued := range x.remaining {
		if !queued && owner[id] == w {
			ids[id] = true
		}
	}
	return ids
}

func (x *Execution) finish(id string, results []Result) {
	x.mu.Lock()
	defer x.mu.Unlock()
	delete(x.remaining, id)
	if !x.stopped {
		x.emit(Event{Type: "result", ID: id, Results: results})
	}
}

func (x *Execution) Pause(paused bool) {
	x.mu.Lock()
	x.paused = paused
	x.mu.Unlock()
	x.resume.Broadcast()
}

func (x *Execution) Paused() bool {
	x.mu.Lock()
	defer x.mu.Unlock()
	return x.paused
}

// Stop kills the workers and marks every unfinished eval cancelled.
func (x *Execution) Stop() {
	x.mu.Lock()
	x.stopped = true
	var ids []string
	for id := range x.remaining {
		ids = append(ids, id)
	}
	x.emit(Event{Type: "cancelled", IDs: ids})
	x.mu.Unlock()
	x.resume.Broadcast()
	stopWorkers(x.workers)
	<-x.Done
}

func ptr[T any](v T) *T { return &v }
