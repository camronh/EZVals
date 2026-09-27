package main

import (
	"cmp"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

//go:embed all:web
var webFiles embed.FS

// Server is `ezvals serve`: the web UI's API over the store, plus the one execution it may be running.
type Server struct {
	mu            sync.Mutex
	store         *Store
	path          string // eval path to run; empty when viewing a run whose source is gone
	dataset       string
	labels        []string
	functionName  string
	session       string
	runName       string // name for the active run if it has not been created yet
	activeID      string
	configName    string
	discovered    []Eval
	discoveryErr  string // why discovery found nothing: the worker's error, e.g. an eval file that fails to import
	exec          *Execution
	selectedTotal *int
}

type httpError struct {
	code int
	msg  string
}

func (e httpError) Error() string { return e.msg }

func fail(code int, format string, args ...any) error {
	return httpError{code, fmt.Sprintf(format, args...)}
}

func serveCmd(args []string) {
	fs := newFlagSet("serve")
	var labels multiFlag
	dataset := fs.String("dataset", "", "filter by dataset(s), comma-separated")
	fs.StringVar(dataset, "d", "", "shorthand for --dataset")
	fs.Var(&labels, "label", "filter by `label` (repeatable)")
	fs.Var(&labels, "l", "shorthand for --label")
	resultsDir := fs.String("results-dir", "", "base directory for .ezvals/sessions")
	port := fs.Int("port", 0, "port (default 8000)")
	session := fs.String("session", "", "session name (default: a new random name)")
	runName := fs.String("run-name", "", "open this run, or use it as the next run's name")
	compareRuns := fs.String("compare-runs", "", "2-4 comma-separated run names to open in comparison mode")
	search := fs.String("search", "", "initial search text")
	annotation := fs.String("annotation", "any", "initial annotation filter: any, yes or no")
	autoRun := fs.Bool("run", false, "run all evals on startup")
	noOpen := fs.Bool("no-open", false, "do not open a browser")
	open := fs.Bool("open", true, "open a browser (default)")
	configName := fs.String("config", "", "named config profile from ezvals.json")
	query := url.Values{}
	for _, name := range []string{"has-error", "has-url", "has-messages"} {
		param := strings.ReplaceAll(name, "-", "_")
		fs.BoolFunc(name, "initial filter", func(string) error { query.Set(param, "1"); return nil })
		fs.BoolFunc("no-"+name, "initial filter", func(string) error { query.Set(param, "0"); return nil })
	}
	positional := parseFlags(fs, args)
	if len(positional) != 1 {
		fatal("usage: ezvals serve PATH [flags]")
	}
	cfg := loadConfig()
	if *resultsDir != "" {
		cfg.ResultsDir = *resultsDir
	}
	if *port == 0 {
		*port = cfg.Port
	}
	if _, err := cfg.profile(*configName); err != nil {
		fatal("%v", err)
	}
	if *session = sanitize(*session); *session == "" {
		*session = friendlyName()
	}
	if *runName = cleanRunName(*runName); *runName == "" {
		*runName = *configName
	}
	s := &Server{store: openStore(cfg.sessionsDir()), session: *session, configName: *configName}

	target := positional[0]
	if info, err := os.Stat(target); err == nil && !info.IsDir() && (strings.HasSuffix(target, ".jsonl") || strings.HasSuffix(target, ".json")) {
		if *compareRuns != "" || *runName != "" {
			fatal("--run-name and --compare-runs are only supported when PATH is an eval path.")
		}
		id, err := s.store.Import(target)
		if err != nil {
			fatal("%v", err)
		}
		s.activate(id)
	} else {
		var selectors []string
		s.path, selectors = splitSelector(target)
		s.dataset, s.labels, s.functionName = *dataset, labels, strings.Join(selectors, ",")
		if _, err := os.Stat(s.path); err != nil {
			fatal("Path %s does not exist", s.path)
		}
		if *runName != "" {
			existing, err := s.store.FindByName(s.session, *runName)
			if err != nil {
				fatal("%v", err)
			}
			if existing != nil {
				s.activate(existing.RunID)
				query.Set("run_id", existing.RunID)
			}
		}
		if *compareRuns != "" {
			names := strings.Split(*compareRuns, ",")
			if len(names) < 2 || len(names) > 4 {
				fatal("--compare-runs needs 2 to 4 run names.")
			}
			for _, name := range names {
				run, err := s.store.FindByName(s.session, cleanRunName(name))
				if err != nil || run == nil {
					fatal("Run name '%s' not found in session '%s'.", name, s.session)
				}
				query.Add("compare_run_id", run.RunID)
			}
			if !slices.Contains(query["compare_run_id"], s.activeID) {
				s.activate(query["compare_run_id"][0])
				query.Set("run_id", s.activeID)
			}
		}
		if s.activeID == "" {
			s.activeID, s.runName = newRunID(), *runName
			if s.runName == "" {
				s.runName = friendlyName()
			}
		}
	}
	if *search != "" {
		query.Set("search", *search)
	}
	if *annotation != "any" {
		query.Set("annotation", *annotation)
	}
	s.discover()

	var listener net.Listener
	var err error
	for p := *port; p < *port+10 && listener == nil; p++ {
		listener, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
	}
	if listener == nil {
		fatal("no available port in %d-%d: %v", *port, *port+9, err)
	}
	address := "http://" + listener.Addr().String()
	if len(query) > 0 {
		address += "/?" + query.Encode()
	}
	fmt.Printf("\nEZVals UI serving at: %s\n", address)
	switch {
	case s.path == "":
		fmt.Println("Source eval path not found. View-only mode (rerun disabled).")
	case *autoRun:
		fmt.Printf("Auto-running %d evaluation(s)...\n", len(s.discovered))
		if err := s.run(nil, nil); err != nil {
			fatal("%v", err)
		}
	default:
		fmt.Printf("Found %d evaluation(s). Click Run to start.\n", len(s.discovered))
	}
	fmt.Println("Press Ctrl+C to stop")
	if *open && !*noOpen {
		openBrowser(address)
	}
	go http.Serve(listener, s.routes())
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	<-interrupt
	fmt.Println("\nStopping server...")
	if s.exec != nil {
		s.exec.Stop()
	}
}

func openBrowser(address string) {
	switch runtime.GOOS {
	case "darwin":
		exec.Command("open", address).Start()
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", address).Start()
	default:
		exec.Command("xdg-open", address).Start()
	}
}

// activate makes a saved run the active one and adopts its source path and filters for reruns.
func (s *Server) activate(id string) error {
	run, err := s.store.Load(id)
	if err != nil {
		return fail(404, "Run not found")
	}
	s.activeID, s.runName, s.session = run.RunID, run.RunName, run.SessionName
	s.dataset, s.labels, s.functionName, s.path = run.Dataset, run.Labels, run.FunctionName, run.Path
	if _, err := os.Stat(run.Path); err != nil {
		s.path = ""
	}
	return nil
}

// switchTo activates the run a rerun or regrade targets, when that isn't the active run already.
func (s *Server) switchTo(id string) error {
	if id == "" || id == s.activeID {
		return nil
	}
	if s.exec != nil {
		return fail(409, "A run is already in progress")
	}
	if err := s.activate(id); err != nil {
		return err
	}
	s.discover()
	return nil
}

// discover lists the evals at the eval path without running them.
func (s *Server) discover() {
	s.discovered, s.discoveryErr = nil, ""
	if s.path == "" {
		return
	}
	workers, evals, err := startWorkers(s.path, RunInfo{}, false)
	if err != nil {
		s.discoveryErr = err.Error()
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return
	}
	stopWorkers(workers)
	s.discovered = expandTrials(s.filter(evals), loadConfig().Trials)
}

// filter applies the serve command's dataset, label and function filters.
func (s *Server) filter(evals []Eval) []Eval {
	var selectors []string
	if s.functionName != "" {
		selectors = strings.Split(s.functionName, ",")
	}
	return filterEvals(evals, s.dataset, s.labels, selectors)
}

// activeRun is the active run from disk, or a not-started view of the discovered evals (possibly none).
func (s *Server) activeRun() (*Run, error) {
	if run, err := s.store.Load(s.activeID); err == nil {
		return run, nil
	}
	return materialize([]Event{
		{Type: "run", RunID: s.activeID, SessionName: s.session, RunName: s.runName, Path: s.path},
		{Type: "evals", Evals: s.discovered},
	}), nil
}

func (s *Server) loadRun(id string) (*Run, error) {
	if id == "latest" || id == s.activeID {
		return s.activeRun()
	}
	run, err := s.store.Load(id)
	if err != nil {
		return nil, fail(404, "Run not found")
	}
	return run, nil
}

// run starts evals in the active run: the given result rows, or everything when rows is nil.
func (s *Server) run(rows []int, configName *string) error {
	if s.exec != nil {
		return fail(409, "A run is already in progress")
	}
	cfg := loadConfig()
	if configName != nil {
		if _, err := cfg.profile(*configName); err != nil {
			return fail(400, "%v", err)
		}
		s.configName = *configName
	}
	if s.path == "" {
		return fail(400, "Rerun unavailable: missing eval path")
	}
	existing, err := s.store.Load(s.activeID)
	if err == nil && configName != nil && *configName != "" && *configName != existing.ConfigName {
		s.activeID, s.runName, existing = newRunID(), *configName, nil
	}
	current, _ := s.activeRun()
	var ids []string
	for _, i := range rows {
		if i < 0 || i >= len(current.Results) {
			return fail(400, "Invalid index %d: only %d results exist", i, len(current.Results))
		}
		if id := current.Results[i].ID; !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	return s.start(existing, ids, rows == nil, cfg.Overwrite)
}

// start spawns workers for the eval path and runs ids (or all evals) in the active run, creating it if needed.
func (s *Server) start(existing *Run, ids []string, all bool, overwrite bool) error {
	runName := s.runName
	if existing != nil {
		runName = existing.RunName
	}
	workers, evals, err := s.spawn(runName)
	if err != nil {
		return err
	}
	s.discovered = evals
	byID := map[string]Eval{}
	for _, e := range evals {
		byID[e.ID] = e
	}
	if all {
		ids = ids[:0]
		for _, e := range evals {
			ids = append(ids, e.ID)
		}
	}
	var todo []Job
	for _, id := range ids {
		if e, ok := byID[id]; ok {
			todo = append(todo, Job{ID: id, Eval: e.sdkID()})
		}
	}
	if existing == nil {
		header := Event{Type: "run", RunID: s.activeID, SessionName: s.session, RunName: runName, Path: s.path,
			Dataset: s.dataset, Labels: s.labels, FunctionName: s.functionName, ConfigName: s.configName}
		if err := s.store.Create(header, overwrite); err != nil {
			stopWorkers(workers)
			return err
		}
	}
	s.store.Append(s.activeID, Event{Type: "evals", Evals: evals})
	s.selectedTotal = nil
	if !all {
		s.selectedTotal = ptr(len(todo))
	}
	s.launch(workers, todo)
	return nil
}

// regrade re-scores the active run's stored results (rows nil = all) without re-running targets.
func (s *Server) regrade(rows []int) (int, int, error) {
	if s.exec != nil {
		return 0, 0, fail(409, "A run is already in progress")
	}
	run, err := s.store.Load(s.activeID)
	if err != nil {
		return 0, 0, fail(400, "Run the evals before regrading them")
	}
	if s.path == "" {
		return 0, 0, fail(400, "Regrade unavailable: missing eval path")
	}
	workers, evals, err := s.spawn(run.RunName)
	if err != nil {
		return 0, 0, err
	}
	for _, i := range rows {
		if i < 0 || i >= len(run.Results) {
			stopWorkers(workers)
			return 0, 0, fail(400, "Invalid index %d: only %d results exist", i, len(run.Results))
		}
	}
	todo, noTarget := regradeJobs(run, evals, rows)
	s.selectedTotal = ptr(len(todo))
	s.launch(workers, todo)
	return len(todo), noTarget, nil
}

// spawn starts workers for the active run and returns the evals to show, filtered and expanded into trials.
func (s *Server) spawn(runName string) ([]*Worker, []Eval, error) {
	if s.path == "" {
		return nil, nil, fail(400, "Rerun unavailable: missing eval path")
	}
	if _, err := os.Stat(s.path); err != nil {
		return nil, nil, fail(400, "Eval path not found: %s", s.path)
	}
	cfg := loadConfig()
	profile, _ := cfg.profile(s.configName)
	info := RunInfo{RunID: s.activeID, SessionName: s.session, RunName: runName, EvalPath: s.path, Config: profile,
		Timeout: cfg.Timeout}
	workers, manifest, err := startWorkers(s.path, info, cfg.Verbose)
	if err != nil {
		return nil, nil, fail(400, "%v", err)
	}
	return workers, expandTrials(s.filter(manifest), cfg.Trials), nil
}

// launch queues jobs in the active run and executes them in the background.
func (s *Server) launch(workers []*Worker, todo []Job) {
	if len(todo) == 0 {
		stopWorkers(workers)
		return
	}
	runID := s.activeID
	emit := func(es ...Event) {
		printErrors(es)
		if err := s.store.Append(runID, es...); err != nil {
			fmt.Fprintf(os.Stderr, "Error saving run: %v\n", err)
		}
	}
	queued := Event{Type: "queued"}
	for _, job := range todo {
		queued.IDs = append(queued.IDs, job.ID)
	}
	emit(queued)
	x := execute(workers, todo, loadConfig().Concurrency, emit)
	s.exec = x
	go func() {
		<-x.Done
		s.mu.Lock()
		if s.exec == x {
			s.exec = nil
		}
		s.mu.Unlock()
	}()
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	handle := func(pattern string, h func(r *http.Request) (any, error)) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			s.mu.Lock()
			body, err := h(r)
			s.mu.Unlock()
			var he httpError
			switch {
			case errors.As(err, &he):
				writeJSON(w, he.code, map[string]string{"detail": he.msg})
			case err != nil:
				writeJSON(w, 500, map[string]string{"detail": err.Error()})
			default:
				writeJSON(w, 200, body)
			}
		})
	}
	decode := func(r *http.Request, v any) error {
		if err := json.NewDecoder(r.Body).Decode(v); err != nil && !errors.Is(err, io.EOF) {
			return fail(400, "Invalid request body: %v", err)
		}
		return nil
	}
	resultIndex := func(r *http.Request) (*Run, int, error) {
		run, err := s.loadRun(r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		i, err := strconv.Atoi(r.PathValue("index"))
		if err != nil || i < 0 || i >= len(run.Results) {
			return nil, 0, fail(404, "Result not found")
		}
		return run, i, nil
	}
	withChips := func(run *Run) map[string]any {
		extra := map[string]any{"score_chips": scoreChips(run.Results), "eval_path": run.Path}
		if run.RunID == s.activeID && s.discoveryErr != "" {
			extra["discovery_error"] = s.discoveryErr
		}
		return extra
	}
	merge := func(run *Run, extra map[string]any) map[string]any {
		out := map[string]any{}
		data, _ := json.Marshal(run)
		json.Unmarshal(data, &out)
		for k, v := range extra {
			out[k] = v
		}
		return out
	}

	handle("GET /results", func(r *http.Request) (any, error) {
		run, err := s.activeRun()
		if err != nil {
			return nil, err
		}
		extra := withChips(run)
		extra["is_paused"] = s.exec != nil && s.exec.Paused()
		extra["selected_total"] = s.selectedTotal
		if run.Path == "" {
			extra["eval_path"] = s.path
		}
		return merge(run, extra), nil
	})
	handle("GET /api/runs/{id}/data", func(r *http.Request) (any, error) {
		run, err := s.loadRun(r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		return merge(run, withChips(run)), nil
	})
	handle("GET /api/runs/{id}/results/{index}", func(r *http.Request) (any, error) {
		run, i, err := resultIndex(r)
		if err != nil {
			return nil, err
		}
		return map[string]any{"result": run.Results[i], "index": i, "total": len(run.Results), "run_id": run.RunID,
			"session_name": run.SessionName, "run_name": run.RunName, "eval_path": run.Path}, nil
	})
	handle("PATCH /api/runs/{id}/results/{index}", func(r *http.Request) (any, error) {
		run, i, err := resultIndex(r)
		if err != nil {
			return nil, err
		}
		var body struct{ Result map[string]json.RawMessage }
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		row := run.Results[i]
		n := i - slices.IndexFunc(run.Results, func(other Row) bool { return other.ID == row.ID })
		var edits []Event
		for _, field := range []string{"annotation", "scores"} {
			if value, ok := body.Result[field]; ok {
				edits = append(edits, Event{Type: "edit", ID: row.ID, N: n, Field: field, Value: value})
			}
		}
		if err := s.store.Append(run.RunID, edits...); err != nil {
			return nil, fail(404, "Run not found")
		}
		updated, _ := s.store.Load(run.RunID)
		return map[string]any{"ok": true, "result": updated.Results[i]}, nil
	})

	handle("POST /api/runs/rerun", func(r *http.Request) (any, error) {
		var body struct {
			Indices    []int
			ConfigName *string `json:"config_name"`
			RunID      string  `json:"run_id"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if err := s.switchTo(body.RunID); err != nil {
			return nil, err
		}
		if err := s.run(body.Indices, body.ConfigName); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "run_id": s.activeID}, nil
	})
	handle("POST /api/runs/regrade", func(r *http.Request) (any, error) {
		var body struct {
			Indices []int
			RunID   string `json:"run_id"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if err := s.switchTo(body.RunID); err != nil {
			return nil, err
		}
		regraded, noTarget, err := s.regrade(body.Indices)
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "regraded": regraded, "skipped_without_target": noTarget}, nil
	})
	handle("POST /api/runs/new", func(r *http.Request) (any, error) {
		var body struct {
			RunName string `json:"run_name"`
			Indices *[]int
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if s.exec != nil {
			return nil, fail(409, "A run is already in progress")
		}
		if s.path == "" {
			return nil, fail(400, "New run unavailable: missing eval path")
		}
		s.runName = cleanRunName(body.RunName)
		if s.runName == "" {
			s.runName = s.configName
		}
		if s.runName == "" {
			s.runName = friendlyName()
		}
		s.activeID = newRunID()
		var ids []string
		for _, i := range deref(body.Indices) {
			if i < 0 || i >= len(s.discovered) {
				return nil, fail(400, "Invalid index %d: only %d evals exist", i, len(s.discovered))
			}
			ids = append(ids, s.discovered[i].ID)
		}
		if err := s.start(nil, ids, body.Indices == nil, false); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "run_id": s.activeID, "run_name": s.runName}, nil
	})
	handle("POST /api/runs/pause", func(r *http.Request) (any, error) {
		if s.exec != nil {
			s.exec.Pause(true)
		}
		return map[string]any{"ok": true, "paused": true}, nil
	})
	handle("POST /api/runs/resume", func(r *http.Request) (any, error) {
		if s.exec != nil {
			s.exec.Pause(false)
			return map[string]any{"ok": true, "resumed": true, "run_id": s.activeID}, nil
		}
		run, err := s.store.Load(s.activeID)
		if err != nil {
			return nil, fail(404, "Active run not found")
		}
		var pending []int
		for i, row := range run.Results {
			if row.Result.Status == "pending" {
				pending = append(pending, i)
			}
		}
		if len(pending) == 0 {
			return map[string]any{"ok": true, "resumed": false, "run_id": s.activeID}, nil
		}
		return map[string]any{"ok": true, "resumed": true, "run_id": s.activeID}, s.run(pending, nil)
	})
	handle("POST /api/runs/stop", func(r *http.Request) (any, error) {
		if s.exec != nil {
			s.exec.Stop()
			s.exec = nil
			return map[string]any{"ok": true}, nil
		}
		if run, err := s.store.Load(s.activeID); err == nil {
			var ids []string
			for _, row := range run.Results {
				if row.Result.Status == "pending" || row.Result.Status == "running" {
					ids = append(ids, row.ID)
				}
			}
			s.store.Append(s.activeID, Event{Type: "cancelled", IDs: ids})
		}
		return map[string]any{"ok": true}, nil
	})
	handle("POST /api/server/restart", func(r *http.Request) (any, error) {
		s.discover()
		return map[string]any{"ok": true}, nil
	})

	handle("GET /api/sessions", func(r *http.Request) (any, error) {
		return map[string]any{"sessions": s.store.Sessions()}, nil
	})
	handle("GET /api/sessions/{name}/runs", func(r *http.Request) (any, error) {
		runs := []map[string]any{}
		for _, run := range s.store.Runs(r.PathValue("name")) {
			runs = append(runs, map[string]any{"run_id": run.RunID, "run_name": run.RunName, "timestamp": run.CreatedAt,
				"total_evaluations": run.TotalEvaluations, "total_passed": run.TotalPassed, "total_failed": run.TotalFailed, "total_errors": run.TotalErrors})
		}
		return map[string]any{"session_name": r.PathValue("name"), "runs": runs}, nil
	})
	handle("DELETE /api/sessions/{name}", func(r *http.Request) (any, error) {
		if err := s.store.DeleteSession(r.PathValue("name")); err != nil {
			return nil, fail(404, "Session not found")
		}
		return map[string]any{"ok": true}, nil
	})
	handle("DELETE /api/runs/{id}", func(r *http.Request) (any, error) {
		if err := s.store.Delete(r.PathValue("id")); err != nil {
			return nil, fail(404, "Run not found")
		}
		return map[string]any{"ok": true}, nil
	})
	handle("PATCH /api/runs/{id}", func(r *http.Request) (any, error) {
		var body struct {
			RunName string `json:"run_name"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		id, name := r.PathValue("id"), cleanRunName(body.RunName)
		if name == "" {
			return nil, fail(400, "Run name cannot be blank")
		}
		if err := s.store.Append(id, Event{Type: "renamed", RunName: name}); err != nil {
			return nil, fail(404, "Run not found")
		}
		if id == s.activeID {
			s.runName = name
		}
		return map[string]any{"ok": true, "run": map[string]string{"run_id": id, "run_name": name}}, nil
	})
	handle("PUT /api/pending-run-name", func(r *http.Request) (any, error) {
		var body struct {
			RunName string `json:"run_name"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if name := cleanRunName(body.RunName); name != "" {
			s.runName = name
			// A run created by "New run" but not started yet already has a file: rename it too.
			s.store.Append(s.activeID, Event{Type: "renamed", RunName: s.runName})
		}
		return map[string]any{"ok": true, "run_name": s.runName}, nil
	})
	handle("POST /api/runs/{id}/activate", func(r *http.Request) (any, error) {
		if err := s.activate(r.PathValue("id")); err != nil {
			return nil, err
		}
		s.discover()
		return map[string]any{"ok": true, "run_id": s.activeID, "run_name": s.runName}, nil
	})

	handle("GET /api/config", func(r *http.Request) (any, error) { return loadConfig(), nil })
	handle("PUT /api/config", func(r *http.Request) (any, error) {
		// The body replaces the settings the UI edits; a key that is null or missing goes back to its default.
		// Other keys in ezvals.json (configs, port, overwrite, verbose) are kept.
		var body struct {
			Concurrency             int     `json:"concurrency"`
			Timeout                 float64 `json:"timeout"`
			Trials                  int     `json:"trials"`
			ResultsDir              string  `json:"results_dir"`
			CompletionNotifications bool    `json:"completion_notifications"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		cfg, defaults := loadConfig(), defaultConfig()
		cfg.Concurrency, cfg.Timeout, cfg.Trials = cmp.Or(body.Concurrency, defaults.Concurrency), body.Timeout, body.Trials
		cfg.ResultsDir, cfg.CompletionNotifications = cmp.Or(body.ResultsDir, defaults.ResultsDir), body.CompletionNotifications
		return map[string]any{"ok": true, "config": cfg}, cfg.save()
	})
	handle("GET /api/configs", func(r *http.Request) (any, error) {
		names := []string{}
		for name := range loadConfig().Configs {
			names = append(names, name)
		}
		sort.Strings(names)
		var active *string
		if s.configName != "" {
			active = &s.configName
		}
		return map[string]any{"names": names, "active": active}, nil
	})
	handle("POST /api/configs/select", func(r *http.Request) (any, error) {
		var body struct{ Name string }
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if _, err := loadConfig().profile(body.Name); err != nil {
			return nil, fail(400, "%v", err)
		}
		s.configName = body.Name
		return map[string]any{"ok": true, "active": body.Name}, nil
	})

	download := func(w http.ResponseWriter, filename, contentType string, content []byte) {
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", "attachment; filename="+filename)
		w.Write(content)
	}
	exportRun := func(w http.ResponseWriter, r *http.Request) *Run {
		s.mu.Lock()
		defer s.mu.Unlock()
		run, err := s.loadRun(r.PathValue("id"))
		if err != nil {
			writeJSON(w, 404, map[string]string{"detail": "Run not found"})
		}
		return run
	}
	mux.HandleFunc("GET /api/runs/{id}/export/json", func(w http.ResponseWriter, r *http.Request) {
		if run := exportRun(w, r); run != nil {
			data, _ := json.MarshalIndent(run, "", "  ")
			download(w, run.RunID+".json", "application/json", data)
		}
	})
	mux.HandleFunc("GET /api/runs/{id}/export/csv", func(w http.ResponseWriter, r *http.Request) {
		if run := exportRun(w, r); run != nil {
			download(w, run.RunID+".csv", "text/csv", renderCSV(run.Results))
		}
	})
	mux.HandleFunc("POST /api/runs/{id}/export/markdown", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			VisibleIndices []int           `json:"visible_indices"`
			VisibleColumns []string        `json:"visible_columns"`
			Stats          Stats           `json:"stats"`
			RunName        string          `json:"run_name"`
			SessionName    string          `json:"session_name"`
			ComparisonMode bool            `json:"comparison_mode"`
			ComparisonRuns []ComparisonRun `json:"comparison_runs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, 400, map[string]string{"detail": err.Error()})
			return
		}
		if body.ComparisonMode && len(body.ComparisonRuns) > 0 {
			download(w, "comparison.md", "text/markdown", []byte(renderComparisonMarkdown(body.ComparisonRuns, body.SessionName)))
			return
		}
		if run := exportRun(w, r); run != nil {
			var rows []Row
			for _, i := range body.VisibleIndices {
				if i >= 0 && i < len(run.Results) {
					rows = append(rows, run.Results[i])
				}
			}
			download(w, run.RunID+".md", "text/markdown", []byte(renderMarkdown(body.RunName, body.SessionName, rows, body.VisibleColumns, body.Stats)))
		}
	})

	web, _ := fs.Sub(webFiles, "web")
	index := func(w http.ResponseWriter) {
		data, err := fs.ReadFile(web, "index.html")
		if err != nil {
			http.Error(w, "UI assets are missing. Build them with: make ui", 500)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	}
	mux.HandleFunc("GET /runs/{id}/results/{index}", func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		_, _, err := resultIndex(r)
		s.mu.Unlock()
		var he httpError
		if errors.As(err, &he) {
			writeJSON(w, he.code, map[string]string{"detail": he.msg})
			return
		}
		index(w)
	})
	files := http.FileServerFS(web)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if name := strings.TrimPrefix(r.URL.Path, "/"); name != "" && !strings.HasPrefix(name, "api/") {
			if _, err := fs.Stat(web, name); err == nil {
				files.ServeHTTP(w, r)
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeJSON(w, 404, map[string]string{"detail": "Not found"})
			return
		}
		index(w)
	})
	return mux
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(body)
}

func deref[T any](p *[]T) []T {
	if p == nil {
		return nil
	}
	return *p
}
