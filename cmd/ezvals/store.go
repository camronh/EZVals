package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

// A run is stored as an append-only log of events, one JSON object per line:
//
//	run        header: run_id, session_name, run_name, path, filters, config_name, at
//	evals      the eval manifest (replaces any earlier manifest)
//	queued     ids scheduled to run (grade: re-score stored results instead of re-running)
//	started    one eval began
//	result     one eval's results
//	cancelled  ids stopped before finishing
//	edit       a human edit to one result row's annotation or scores
//	renamed    new run_name
type Event struct {
	Type         string          `json:"type"`
	At           int64           `json:"at,omitempty"`
	RunID        string          `json:"run_id,omitempty"`
	SessionName  string          `json:"session_name,omitempty"`
	RunName      string          `json:"run_name,omitempty"`
	Path         string          `json:"path,omitempty"`
	Dataset      string          `json:"dataset,omitempty"`
	Labels       []string        `json:"labels,omitempty"`
	FunctionName string          `json:"function_name,omitempty"`
	ConfigName   string          `json:"config_name,omitempty"`
	Evals        []Eval          `json:"evals,omitempty"`
	IDs          []string        `json:"ids,omitempty"`
	ID           string          `json:"id,omitempty"`
	Results      []Result        `json:"results,omitempty"`
	N            int             `json:"n,omitempty"`
	Field        string          `json:"field,omitempty"`
	Value        json.RawMessage `json:"value,omitempty"`
}

type Eval struct {
	ID        string   `json:"id"`
	Function  string   `json:"function"`
	Dataset   *string  `json:"dataset"`
	Labels    []string `json:"labels"`
	Input     any      `json:"input"`
	Reference any      `json:"reference"`
	Metadata  any      `json:"metadata"`
	Trials    int      `json:"trials,omitempty"`   // requested by the eval; the host expands them
	Target    bool     `json:"target,omitempty"`   // the eval has a target, so its results can be regraded
	Trial     int      `json:"trial,omitempty"`    // this eval is trial N of TrialOf
	TrialOf   string   `json:"trial_of,omitempty"` // the SDK's id for the eval
}

// sdkID is the id the eval's SDK knows it by.
func (e Eval) sdkID() string {
	if e.TrialOf != "" {
		return e.TrialOf
	}
	return e.ID
}

type Score struct {
	Key    string  `json:"key"`
	Value  any     `json:"value,omitempty"` // usually a number; SDKs and edits may also store strings or booleans
	Passed *bool   `json:"passed,omitempty"`
	Notes  *string `json:"notes,omitempty"`
}

type Result struct {
	Input             any          `json:"input"`
	Output            any          `json:"output"`
	Reference         any          `json:"reference"`
	Scores            []Score      `json:"scores"`
	Error             *string      `json:"error"`
	Latency           *float64     `json:"latency"`
	Metadata          any          `json:"metadata"`
	TraceData         any          `json:"trace_data"`
	Status            string       `json:"status,omitempty"`
	Annotation        *string      `json:"annotation,omitempty"`
	CorrectionHistory []Correction `json:"correction_history,omitempty"`
}

type Correction struct {
	Field     string `json:"field"`
	Before    any    `json:"before"`
	After     any    `json:"after"`
	Timestamp string `json:"timestamp"`
}

type Row struct {
	ID         string   `json:"id"`
	Function   string   `json:"function"`
	Dataset    *string  `json:"dataset"`
	Labels     []string `json:"labels"`
	Trial      int      `json:"trial,omitempty"`
	TrialOf    string   `json:"trial_of,omitempty"`
	Regradable bool     `json:"regradable,omitempty"` // the eval has a target, so a finished result can be regraded
	Result     Result   `json:"result"`
}

// Run is the materialized view of a run's events.
type Run struct {
	RunID            string   `json:"run_id"`
	SessionName      string   `json:"session_name"`
	RunName          string   `json:"run_name"`
	CreatedAt        int64    `json:"created_at"`
	Path             string   `json:"path"`
	Dataset          string   `json:"dataset,omitempty"`
	Labels           []string `json:"labels,omitempty"`
	FunctionName     string   `json:"function_name,omitempty"`
	ConfigName       string   `json:"config_name,omitempty"`
	TotalEvaluations int      `json:"total_evaluations"`
	TotalFunctions   int      `json:"total_functions"`
	TotalErrors      int      `json:"total_errors"`
	TotalPassed      int      `json:"total_passed"`
	TotalFailed      int      `json:"total_failed"`
	TotalWithScores  int      `json:"total_with_scores"`
	AverageLatency   float64  `json:"average_latency"`
	Trials           int      `json:"trials,omitempty"`
	PassAtK          *float64 `json:"pass_at_k,omitempty"`  // share of evals with at least one passing trial
	PassAllK         *float64 `json:"pass_all_k,omitempty"` // share of evals whose trials all passed
	Results          []Row    `json:"results"`
}

func materialize(events []Event) *Run {
	run := &Run{Results: []Row{}}
	var manifest []Eval
	status := map[string]string{}
	results := map[string][]Result{}
	var edits []Event
	for _, e := range events {
		switch e.Type {
		case "run":
			run.RunID, run.SessionName, run.RunName, run.CreatedAt = e.RunID, e.SessionName, e.RunName, e.At
			run.Path, run.Dataset, run.Labels, run.FunctionName, run.ConfigName = e.Path, e.Dataset, e.Labels, e.FunctionName, e.ConfigName
		case "renamed":
			run.RunName = e.RunName
		case "evals":
			manifest = e.Evals
		case "queued":
			run.CreatedAt = e.At
			for _, id := range e.IDs {
				status[id] = "pending"
				edits = keepAnnotationEdits(edits, id)
			}
		case "started":
			status[e.ID] = "running"
		case "result":
			delete(status, e.ID)
			results[e.ID] = e.Results
			edits = keepAnnotationEdits(edits, e.ID)
		case "cancelled":
			for _, id := range e.IDs {
				if status[id] == "pending" || status[id] == "running" {
					status[id] = "cancelled"
				}
			}
		case "edit":
			edits = append(edits, e)
		}
	}

	firstRow := map[string]int{}
	for _, ev := range manifest {
		firstRow[ev.ID] = len(run.Results)
		row := Row{ID: ev.ID, Function: ev.Function, Dataset: ev.Dataset, Labels: ev.Labels, Trial: ev.Trial, TrialOf: ev.TrialOf,
			Regradable: ev.Target}
		if s, ok := status[ev.ID]; ok || len(results[ev.ID]) == 0 {
			if !ok {
				s = "not_started"
			}
			row.Result = Result{Input: ev.Input, Reference: ev.Reference, Metadata: ev.Metadata, Status: s}
			run.Results = append(run.Results, row)
			continue
		}
		for _, r := range results[ev.ID] {
			r.Status = "completed"
			if r.Error != nil {
				r.Status = "error"
			}
			row.Result = r
			run.Results = append(run.Results, row)
		}
	}

	for _, e := range edits {
		i, ok := firstRow[e.ID]
		if !ok || i+e.N >= len(run.Results) || run.Results[i+e.N].ID != e.ID {
			continue
		}
		r := &run.Results[i+e.N].Result
		var before any = r.Annotation
		if e.Field == "scores" {
			before = r.Scores // an edit replaces the slice below, so this keeps the old scores
			r.Scores = nil
			json.Unmarshal(e.Value, &r.Scores)
		} else {
			r.Annotation = nil
			json.Unmarshal(e.Value, &r.Annotation)
		}
		var after any
		json.Unmarshal(e.Value, &after)
		r.CorrectionHistory = append(r.CorrectionHistory, Correction{e.Field, before, after, time.Unix(e.At, 0).UTC().Format(time.RFC3339)})
	}

	run.computeTotals()
	return run
}

func (run *Run) computeTotals() {
	functions := map[string]bool{}
	latencies := 0
	for _, row := range run.Results {
		r := row.Result
		functions[row.Function] = true
		if r.Error != nil {
			run.TotalErrors++
		}
		if len(r.Scores) > 0 {
			run.TotalWithScores++
		}
		switch outcome(r) {
		case "passed":
			run.TotalPassed++
		case "failed":
			run.TotalFailed++
		}
		if r.Latency != nil {
			run.AverageLatency += *r.Latency
			latencies++
		}
	}
	if latencies > 0 {
		run.AverageLatency /= float64(latencies)
	}
	run.TotalEvaluations = len(run.Results)
	run.TotalFunctions = len(functions)

	trials := map[string][]bool{}
	var order []string
	for _, row := range run.Results {
		if row.Trial == 0 {
			continue
		}
		if _, seen := trials[row.TrialOf]; !seen {
			order = append(order, row.TrialOf)
		}
		trials[row.TrialOf] = append(trials[row.TrialOf], passed(row.Result))
		run.Trials = max(run.Trials, row.Trial)
	}
	if len(order) > 0 {
		anyPassed, allPassed := 0.0, 0.0
		for _, id := range order {
			if slices.Contains(trials[id], true) {
				anyPassed++
			}
			if !slices.Contains(trials[id], false) {
				allPassed++
			}
		}
		run.PassAtK, run.PassAllK = ptr(anyPassed/float64(len(order))), ptr(allPassed/float64(len(order)))
	}
}

// passed is true for a finished result whose pass/fail scores all passed.
func passed(r Result) bool { return outcome(r) == "passed" }

// outcome is "passed", "failed" (a pass/fail score failed), "error", "scored" (only numeric scores, or none),
// or the status of an unfinished result.
func outcome(r Result) string {
	if r.Error != nil {
		return "error"
	}
	if r.Status != "completed" {
		return r.Status
	}
	kind := "scored"
	for _, s := range r.Scores {
		if s.Passed != nil {
			if !*s.Passed {
				return "failed"
			}
			kind = "passed"
		}
	}
	return kind
}

// keepAnnotationEdits drops score edits for an eval that is being re-run; annotations survive reruns.
func keepAnnotationEdits(edits []Event, id string) []Event {
	kept := edits[:0]
	for _, e := range edits {
		if e.ID != id || e.Field == "annotation" {
			kept = append(kept, e)
		}
	}
	return kept
}

type ScoreChip struct {
	Key    string  `json:"key"`
	Type   string  `json:"type"`
	Passed int     `json:"passed"`
	Total  int     `json:"total"`
	Avg    float64 `json:"avg"`
	Count  int     `json:"count"`
}

// scoreChips summarizes each score key: a pass ratio for boolean scores, otherwise an average value.
func scoreChips(rows []Row) []ScoreChip {
	chips := []ScoreChip{}
	index := map[string]int{}
	for _, row := range rows {
		for _, s := range row.Result.Scores {
			i, ok := index[s.Key]
			if !ok {
				i = len(chips)
				index[s.Key] = i
				chips = append(chips, ScoreChip{Key: s.Key, Type: "avg"})
			}
			c := &chips[i]
			if s.Passed != nil {
				c.Type = "ratio"
				c.Total++
				if *s.Passed {
					c.Passed++
				}
			}
			if v, ok := s.Value.(float64); ok {
				c.Avg += v
				c.Count++
			}
		}
	}
	for i := range chips {
		if chips[i].Type == "ratio" {
			chips[i].Avg, chips[i].Count = 0, 0
		} else if chips[i].Count > 0 {
			chips[i].Avg /= float64(chips[i].Count)
		}
	}
	return chips
}

// Store keeps runs under <dir>/<session>/<run_id>.jsonl.
type Store struct {
	dir string
	mu  sync.Mutex
}

var unsafeName = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

func sanitize(name string) string { return unsafeName.ReplaceAllString(name, "") }

// cleanRunName cleans a run name. Run files are named by run id, so any printable text works; blank means none.
func cleanRunName(name string) string {
	name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name))
	if runes := []rune(name); len(runes) > 100 {
		name = strings.TrimSpace(string(runes[:100]))
	}
	return name
}

func openStore(dir string) *Store {
	s := &Store{dir: dir}
	legacy, _ := filepath.Glob(filepath.Join(dir, "*", "*.json"))
	for _, path := range legacy {
		events, err := legacyEvents(path)
		if err == nil {
			err = writeEvents(filepath.Join(filepath.Dir(path), events[0].RunID+".jsonl"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, events...)
		}
		if err == nil {
			err = os.Remove(path)
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "Could not migrate %s: %v\n", path, err)
		}
	}
	return s
}

func (s *Store) file(id string) (string, error) {
	matches, _ := filepath.Glob(filepath.Join(s.dir, "*", sanitize(id)+".jsonl"))
	if len(matches) == 0 {
		return "", fmt.Errorf("run %s not found", id)
	}
	return matches[0], nil
}

// Create starts a run file with its header. With overwrite, other runs in the session with the same name are deleted.
func (s *Store) Create(header Event, overwrite bool) error {
	if overwrite {
		for _, r := range s.Runs(header.SessionName) {
			if r.RunName == header.RunName {
				s.Delete(r.RunID)
			}
		}
	}
	path := filepath.Join(s.dir, header.SessionName, header.RunID+".jsonl")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return writeEvents(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, header)
}

func (s *Store) Append(id string, events ...Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.file(id)
	if err != nil {
		return err
	}
	return writeEvents(path, os.O_APPEND|os.O_WRONLY, events...)
}

func writeEvents(path string, flag int, events ...Event) error {
	f, err := os.OpenFile(path, flag, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, e := range events {
		if e.At == 0 {
			e.At = time.Now().Unix()
		}
		if err := enc.Encode(e); err != nil {
			return err
		}
	}
	return nil
}

func readEvents(path string) ([]Event, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var events []Event
	scanner := bufio.NewScanner(f)
	scanner.Buffer(nil, 256<<20)
	var bad error
	for scanner.Scan() {
		if bad != nil { // only the last line may be unreadable: it can be mid-append
			return nil, bad
		}
		var e Event
		if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
			bad = fmt.Errorf("%s: %w", path, err)
			continue
		}
		events = append(events, e)
	}
	return events, scanner.Err()
}

func (s *Store) Load(id string) (*Run, error) {
	path, err := s.file(id)
	if err != nil {
		return nil, err
	}
	events, err := readEvents(path)
	if err != nil {
		return nil, err
	}
	return materialize(events), nil
}

func (s *Store) Sessions() []string {
	dirs, _ := filepath.Glob(filepath.Join(s.dir, "*", "*.jsonl"))
	seen := map[string]bool{}
	sessions := []string{}
	for _, d := range dirs {
		name := filepath.Base(filepath.Dir(d))
		if !seen[name] {
			seen[name] = true
			sessions = append(sessions, name)
		}
	}
	sort.Strings(sessions)
	return sessions
}

// Runs returns a session's runs, newest first.
func (s *Store) Runs(session string) []*Run {
	paths, _ := filepath.Glob(filepath.Join(s.dir, sanitize(session), "*.jsonl"))
	runs := []*Run{}
	for _, p := range paths {
		if run, err := s.Load(strings.TrimSuffix(filepath.Base(p), ".jsonl")); err == nil {
			runs = append(runs, run)
		}
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i].CreatedAt > runs[j].CreatedAt })
	return runs
}

// FindByName returns the run named name in session, or nil. More than one match is an error.
func (s *Store) FindByName(session, name string) (*Run, error) {
	var found []*Run
	for _, r := range s.Runs(session) {
		if r.RunName == name {
			found = append(found, r)
		}
	}
	if len(found) > 1 {
		return nil, fmt.Errorf("run name '%s' is ambiguous in session '%s'", name, session)
	}
	if len(found) == 0 {
		return nil, nil
	}
	return found[0], nil
}

func (s *Store) Delete(id string) error {
	path, err := s.file(id)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func (s *Store) DeleteSession(name string) error {
	dir := filepath.Join(s.dir, sanitize(name))
	if _, err := os.Stat(dir); err != nil {
		return errors.New("session not found")
	}
	return os.RemoveAll(dir)
}

// Import copies a run file from outside the store (e.g. `ezvals serve path/to/run.jsonl`) and returns its id.
func (s *Store) Import(path string) (string, error) {
	events, err := readEvents(path)
	if strings.HasSuffix(path, ".json") {
		events, err = legacyEvents(path)
	}
	if err != nil {
		return "", err
	}
	run := materialize(events)
	if _, err := s.file(run.RunID); err == nil {
		return run.RunID, nil
	}
	dst := filepath.Join(s.dir, sanitize(run.SessionName), run.RunID+".jsonl")
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}
	return run.RunID, writeEvents(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, events...)
}

// legacyEvents converts a pre-event-log run file (<run_name>_<run_id>.json) into events.
func legacyEvents(path string) ([]Event, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var legacy struct {
		Event
		CreatedAt int64 `json:"created_at"`
		Results   []struct {
			Function string   `json:"function"`
			Dataset  *string  `json:"dataset"`
			Labels   []string `json:"labels"`
			Result   Result   `json:"result"`
		} `json:"results"`
	}
	if err := json.Unmarshal(data, &legacy); err != nil {
		return nil, err
	}
	header := legacy.Event
	header.Type, header.At = "run", legacy.CreatedAt
	manifest := Event{Type: "evals"}
	var rest []Event
	for i, r := range legacy.Results {
		id := fmt.Sprintf("%s#%d", r.Function, i)
		manifest.Evals = append(manifest.Evals, Eval{ID: id, Function: r.Function, Dataset: r.Dataset, Labels: r.Labels,
			Input: r.Result.Input, Reference: r.Result.Reference, Metadata: r.Result.Metadata})
		if r.Result.Status == "completed" || r.Result.Status == "error" {
			rest = append(rest, Event{Type: "result", ID: id, Results: []Result{r.Result}})
		}
		if r.Result.Annotation != nil {
			value, _ := json.Marshal(r.Result.Annotation)
			rest = append(rest, Event{Type: "edit", ID: id, Field: "annotation", Value: value})
		}
	}
	return append([]Event{header, manifest}, rest...), nil
}
