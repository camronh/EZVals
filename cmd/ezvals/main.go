package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	mrand "math/rand/v2"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"syscall"
)

var version = "dev"

const usage = `EZVals: code-first evals for AI agents and LLM apps.

Usage:
  ezvals run PATH[::function,...] [flags]   Run evals headlessly and save the results
  ezvals serve PATH [flags]                 Open the web UI to browse and run evals
  ezvals regrade RUN [flags]                Re-score a run's results without re-running targets
  ezvals query "SQL" [--json]               Query saved runs with SQL (see: ezvals query --schema)
  ezvals export RUN_FILE [-f json|csv|md]   Export a saved run
  ezvals skills add|remove|doctor           Manage the evals skill for coding agents

PATH is an eval file or a directory. Python evals are .py files; TypeScript evals are *.eval.ts files.
Run 'ezvals COMMAND -h' for a command's flags.
`

func main() {
	if len(os.Args) < 2 {
		fmt.Print(usage)
		os.Exit(2)
	}
	switch args := os.Args[2:]; os.Args[1] {
	case "run":
		runCmd(args)
	case "serve":
		serveCmd(args)
	case "regrade":
		regradeCmd(args)
	case "query":
		queryCmd(args)
	case "export":
		exportCmd(args)
	case "skills":
		skillsCmd(args)
	case "--version", "version":
		fmt.Println(version)
	default:
		fmt.Print(usage)
		os.Exit(2)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
	os.Exit(1)
}

// parseFlags parses flags that may appear before, between or after positional arguments.
func parseFlags(fs *flag.FlagSet, args []string) []string {
	var positional []string
	for fs.Parse(args); fs.NArg() > 0; fs.Parse(args) {
		positional = append(positional, fs.Arg(0))
		args = fs.Args()[1:]
	}
	return positional
}

type multiFlag []string

func (m *multiFlag) String() string     { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error { *m = append(*m, v); return nil }

type Config struct {
	Concurrency             int                       `json:"concurrency"`
	Trials                  int                       `json:"trials,omitempty"`
	Timeout                 float64                   `json:"timeout,omitempty"`
	Verbose                 bool                      `json:"verbose,omitempty"`
	ResultsDir              string                    `json:"results_dir"`
	Overwrite               bool                      `json:"overwrite"`
	CompletionNotifications bool                      `json:"completion_notifications"`
	Port                    int                       `json:"port,omitempty"`
	Configs                 map[string]map[string]any `json:"configs,omitempty"`
}

func loadConfig() Config {
	c := Config{Concurrency: 1, ResultsDir: ".", Overwrite: true, Port: 8000}
	if data, err := os.ReadFile("ezvals.json"); err == nil {
		if err := json.Unmarshal(data, &c); err != nil {
			fatal("ezvals.json: %v", err)
		}
	}
	return c
}

func (c Config) save() error {
	data, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile("ezvals.json", data, 0o644)
}

func (c Config) sessionsDir() string { return filepath.Join(c.ResultsDir, ".ezvals", "sessions") }

// profile returns a named entry of "configs" (exposed to evals as ctx.config).
func (c Config) profile(name string) (map[string]any, error) {
	if name == "" {
		return map[string]any{}, nil
	}
	if p, ok := c.Configs[name]; ok {
		return p, nil
	}
	available := "(none defined)"
	if len(c.Configs) > 0 {
		names := make([]string, 0, len(c.Configs))
		for n := range c.Configs {
			names = append(names, n)
		}
		sort.Strings(names)
		available = strings.Join(names, ", ")
	}
	return nil, fmt.Errorf("Config '%s' not found in ezvals.json. Available: %s", name, available)
}

func newRunID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

var adjectives = strings.Fields(`swift bright calm bold keen warm cool quick sharp gentle fierce quiet loud soft strong
	light dark fresh wild tame brave wise kind proud humble eager patient lively mellow vivid clever steady nimble
	silent golden silver ancient cosmic mystic lucid subtle radiant serene noble polar azure coral jade amber
	scarlet violet rustic sleek brisk dusky frosty hazy misty`)
var nouns = strings.Fields(`falcon river mountain thunder whisper shadow crystal phoenix dragon tiger eagle wolf bear
	hawk raven storm frost flame wave stone cloud star moon forest meadow canyon glacier comet spark breeze panda
	otter heron viper lynx fox owl crane orchid lotus cedar maple birch oak pine willow nebula quasar nova aurora
	zenith horizon prism summit ridge valley delta reef grove shore`)

func friendlyName() string {
	return adjectives[mrand.IntN(len(adjectives))] + "-" + nouns[mrand.IntN(len(nouns))]
}

// splitSelector splits "path::fn_a,fn_b@case" into the path and its function selectors.
func splitSelector(arg string) (string, []string) {
	path, selector, found := strings.Cut(arg, "::")
	if !found {
		return path, nil
	}
	return path, strings.Split(selector, ",")
}

// filterEvals keeps evals matching any dataset, any label, and any selector (each filter is skipped when empty).
func filterEvals(evals []Eval, datasets string, labels []string, selectors []string) []Eval {
	var kept []Eval
	for _, e := range evals {
		matchesSelector := len(selectors) == 0
		for _, s := range selectors {
			s = strings.TrimSpace(s)
			if fn, c, ok := strings.Cut(s, "@"); ok {
				s = fn + "[" + c + "]"
			}
			matchesSelector = matchesSelector || e.Function == s || strings.HasPrefix(e.Function, s+"[")
		}
		matchesDataset := datasets == "" || e.Dataset != nil && slices.Contains(strings.Split(datasets, ","), *e.Dataset)
		matchesLabel := len(labels) == 0 || slices.ContainsFunc(e.Labels, func(l string) bool { return slices.Contains(labels, l) })
		if matchesSelector && matchesDataset && matchesLabel {
			kept = append(kept, e)
		}
	}
	return kept
}

func ids(evals []Eval) []string {
	out := make([]string, len(evals))
	for i, e := range evals {
		out[i] = e.ID
	}
	return out
}

// expandTrials turns an eval with N trials into N evals, <id>~1 ... <id>~N. A positive override applies to every eval.
func expandTrials(evals []Eval, override int) []Eval {
	var out []Eval
	for _, e := range evals {
		n := e.Trials
		if override > 0 {
			n = override
		}
		if n <= 1 {
			out = append(out, e)
			continue
		}
		for t := 1; t <= n; t++ {
			trial := e
			trial.ID, trial.Trial, trial.TrialOf = fmt.Sprintf("%s~%d", e.ID, t), t, e.ID
			out = append(out, trial)
		}
	}
	return out
}

// regradeJobs re-scores stored results (rows nil = every row). Only finished results of evals with a target
// qualify: the target produced the output, so the eval body and evaluators can score it again without it.
func regradeJobs(run *Run, manifest []Eval, rows []int) (jobs []Job, noTarget int) {
	current := map[string]Eval{}
	for _, e := range manifest {
		current[e.ID] = e
	}
	resultsPerEval := map[string]int{}
	for _, row := range run.Results {
		resultsPerEval[row.ID]++
	}
	if rows == nil {
		for i := range run.Results {
			rows = append(rows, i)
		}
	}
	for _, i := range rows {
		row := run.Results[i]
		eval, ok := current[Eval{ID: row.ID, TrialOf: row.TrialOf}.sdkID()]
		if row.Result.Status != "completed" || !ok || resultsPerEval[row.ID] > 1 {
			continue
		}
		if !eval.Target {
			noTarget++
			continue
		}
		stored := row.Result
		jobs = append(jobs, Job{ID: row.ID, Eval: eval.ID, Grade: &stored})
	}
	return jobs, noTarget
}

// listenForTraces starts a collector on a free local port for the lifetime of the command.
func listenForTraces() (*Collector, string) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fatal("%v", err)
	}
	collector := &Collector{}
	mux := http.NewServeMux()
	mux.Handle("POST /otlp/{run}/v1/traces", collector)
	go http.Serve(listener, mux)
	return collector, "http://" + listener.Addr().String()
}

// runJobs executes jobs until they finish or the user interrupts, which cancels whatever hasn't finished.
func runJobs(workers []*Worker, jobs []Job, concurrency int, emit func(...Event)) {
	x := execute(workers, jobs, concurrency, emit)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	select {
	case <-x.Done:
	case <-interrupt:
		fmt.Fprintln(os.Stderr, "\nStopping...")
		x.Stop()
	}
}

func printErrors(events []Event) {
	for _, e := range events {
		for _, r := range e.Results {
			if r.Error != nil {
				fmt.Fprintf(os.Stderr, "\nERROR in %s:\n%s\n", e.ID, *r.Error)
			}
		}
	}
}

type report struct {
	*Run
	SavedPath string `json:"saved_path,omitempty"`
}

func runCmd(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	var labels multiFlag
	dataset := fs.String("dataset", "", "filter by dataset(s), comma-separated")
	fs.StringVar(dataset, "d", "", "shorthand for --dataset")
	fs.Var(&labels, "label", "filter by label (repeatable)")
	fs.Var(&labels, "l", "shorthand for --label")
	limit := fs.Int("limit", 0, "run at most this many evals")
	output := fs.String("output", "", "write the results JSON here instead of the session store")
	fs.StringVar(output, "o", "", "shorthand for --output")
	concurrency := fs.Int("concurrency", -1, "evals to run in parallel (default: ezvals.json, else 1)")
	fs.IntVar(concurrency, "c", -1, "shorthand for --concurrency")
	timeout := fs.Float64("timeout", 0, "per-eval timeout in seconds")
	trials := fs.Int("trials", 0, "run every eval this many times (default: each eval's own trials)")
	verbose := fs.Bool("verbose", false, "show eval output and errors")
	fs.BoolVar(verbose, "v", false, "shorthand for --verbose")
	session := fs.String("session", "default", "session name")
	runName := fs.String("run-name", "", "run name (default: the --config name, else a random name)")
	noSave := fs.Bool("no-save", false, "print the results JSON instead of saving")
	jsonOut := fs.Bool("json", false, "print the results JSON (with saved_path) to stdout")
	rename := fs.String("rename", "", "rename saved run RUN_ID to the positional NEW_NAME")
	configName := fs.String("config", "", "named config profile from ezvals.json")
	positional := parseFlags(fs, args)
	cfg := loadConfig()

	if *rename != "" {
		if len(positional) != 1 {
			fatal("usage: ezvals run --rename RUN_ID NEW_NAME")
		}
		store := openStore(cfg.sessionsDir())
		name := sanitize(positional[0])
		if err := store.Append(*rename, Event{Type: "renamed", RunName: name}); err != nil {
			fatal("Run '%s' not found.", *rename)
		}
		fmt.Printf("Renamed run '%s' to '%s'.\n", *rename, name)
		return
	}
	if len(positional) != 1 {
		fatal("Missing PATH. Provide PATH to run evaluations, or use --rename RUN_ID NEW_NAME.")
	}
	if *concurrency == -1 {
		*concurrency = cfg.Concurrency
	}
	if *concurrency < 1 {
		fatal("concurrency must be at least 1, got %d", *concurrency)
	}
	if *timeout == 0 {
		*timeout = cfg.Timeout
	}
	if *trials == 0 {
		*trials = cfg.Trials
	}
	*verbose = *verbose || cfg.Verbose
	profile, err := cfg.profile(*configName)
	if err != nil {
		fatal("%v", err)
	}
	if *runName == "" {
		*runName = *configName
	}
	if *runName == "" {
		*runName = friendlyName()
	}

	path, selectors := splitSelector(positional[0])
	collector, tracesBase := listenForTraces()
	info := RunInfo{RunID: newRunID(), SessionName: sanitize(*session), RunName: sanitize(*runName), EvalPath: path, Config: profile, Timeout: *timeout}
	info.TracesEndpoint = endpoint(tracesBase, info.RunID)
	fmt.Fprintf(os.Stderr, "Running %s\n", positional[0])
	workers, manifest, err := startWorkers(path, info, *verbose)
	if err != nil {
		fatal("%v", err)
	}
	evals := filterEvals(manifest, *dataset, labels, selectors)
	if *limit > 0 && len(evals) > *limit {
		evals = evals[:*limit]
	}
	if len(evals) == 0 {
		stopWorkers(workers)
		fmt.Fprintln(os.Stderr, "No evaluations found")
		return
	}
	evals = expandTrials(evals, *trials)

	header := Event{Type: "run", RunID: info.RunID, SessionName: info.SessionName, RunName: info.RunName, Path: path,
		Dataset: *dataset, Labels: labels, FunctionName: strings.Join(selectors, ","), ConfigName: *configName}
	store := openStore(cfg.sessionsDir())
	save := *output == "" && !*noSave
	if save {
		if err := store.Create(header, cfg.Overwrite); err != nil {
			fatal("%v", err)
		}
	}
	events := []Event{header}
	var mu sync.Mutex
	emit := func(es ...Event) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, es...)
		if save {
			if err := store.Append(info.RunID, es...); err != nil {
				fatal("%v", err)
			}
		}
		if *verbose {
			printErrors(es)
		}
	}
	collector.Track(info.RunID, emit)
	emit(Event{Type: "evals", Evals: evals}, Event{Type: "queued", IDs: ids(evals)})
	runJobs(workers, jobs(evals), *concurrency, emit)

	report := report{Run: materialize(events)}
	if *output != "" {
		data, _ := json.MarshalIndent(report.Run, "", "  ")
		os.MkdirAll(filepath.Dir(*output), 0o755)
		if err := os.WriteFile(*output, data, 0o644); err != nil {
			fatal("%v", err)
		}
		report.SavedPath = *output
	}
	if save {
		report.SavedPath, _ = store.file(info.RunID)
	}
	if *jsonOut || *noSave {
		json.NewEncoder(os.Stdout).Encode(report)
	}
	if report.SavedPath != "" {
		fmt.Fprintf(os.Stderr, "Results saved to %s\n", report.SavedPath)
	}
}

func regradeCmd(args []string) {
	fs := flag.NewFlagSet("regrade", flag.ExitOnError)
	concurrency := fs.Int("concurrency", 0, "results to regrade in parallel (default: ezvals.json, else 1)")
	fs.IntVar(concurrency, "c", 0, "shorthand for --concurrency")
	verbose := fs.Bool("verbose", false, "show eval output and errors")
	fs.BoolVar(verbose, "v", false, "shorthand for --verbose")
	jsonOut := fs.Bool("json", false, "print the regraded run JSON to stdout")
	positional := parseFlags(fs, args)
	if len(positional) != 1 {
		fatal("usage: ezvals regrade RUN_ID|RUN_FILE [flags]")
	}
	cfg := loadConfig()
	if *concurrency == 0 {
		*concurrency = cfg.Concurrency
	}
	store := openStore(cfg.sessionsDir())
	runID := positional[0]
	if _, err := os.Stat(runID); err == nil {
		if runID, err = store.Import(runID); err != nil {
			fatal("%v", err)
		}
	}
	run, err := store.Load(runID)
	if err != nil {
		fatal("Run '%s' not found.", runID)
	}
	if _, err := os.Stat(run.Path); err != nil {
		fatal("Eval path %s not found: regrading runs the eval code again", run.Path)
	}
	profile, _ := cfg.profile(run.ConfigName)
	collector, tracesBase := listenForTraces()
	info := RunInfo{RunID: run.RunID, SessionName: run.SessionName, RunName: run.RunName, EvalPath: run.Path, Config: profile,
		Timeout: cfg.Timeout, TracesEndpoint: endpoint(tracesBase, run.RunID)}
	workers, manifest, err := startWorkers(run.Path, info, *verbose)
	if err != nil {
		fatal("%v", err)
	}
	jobs, noTarget := regradeJobs(run, manifest, nil)
	if noTarget > 0 {
		fmt.Fprintf(os.Stderr, "Skipping %d result(s) from evals without a target: their output can't be regraded without re-running them.\n", noTarget)
	}
	if len(jobs) == 0 {
		stopWorkers(workers)
		fmt.Fprintln(os.Stderr, "Nothing to regrade")
		return
	}
	emit := func(es ...Event) {
		if err := store.Append(run.RunID, es...); err != nil {
			fatal("%v", err)
		}
		if *verbose {
			printErrors(es)
		}
	}
	collector.Track(run.RunID, emit)
	fmt.Fprintf(os.Stderr, "Regrading %d result(s) of %s\n", len(jobs), run.RunName)
	queued := Event{Type: "queued", Grade: true}
	for _, job := range jobs {
		queued.IDs = append(queued.IDs, job.ID)
	}
	emit(queued)
	runJobs(workers, jobs, *concurrency, emit)
	path, _ := store.file(run.RunID)
	if *jsonOut {
		regraded, _ := store.Load(run.RunID)
		json.NewEncoder(os.Stdout).Encode(report{Run: regraded, SavedPath: path})
	}
	fmt.Fprintf(os.Stderr, "Results saved to %s\n", path)
}

// loadRunFile materializes a run file: an event log (.jsonl) or a legacy run (.json).
func loadRunFile(path string) (*Run, error) {
	events, err := readEvents(path)
	if strings.HasSuffix(path, ".json") {
		events, err = legacyEvents(path)
	}
	if err != nil {
		return nil, err
	}
	return materialize(events), nil
}

func exportCmd(args []string) {
	fs := flag.NewFlagSet("export", flag.ExitOnError)
	format := fs.String("format", "json", "json, csv or md")
	fs.StringVar(format, "f", "json", "shorthand for --format")
	output := fs.String("output", "", "output file (default: RUN_NAME.FORMAT)")
	fs.StringVar(output, "o", "", "shorthand for --output")
	positional := parseFlags(fs, args)
	if len(positional) != 1 {
		fatal("usage: ezvals export RUN_FILE [-f json|csv|md] [-o OUTPUT]")
	}
	run, err := loadRunFile(positional[0])
	if err != nil {
		fatal("%v", err)
	}
	if *output == "" {
		*output = run.RunName + "." + *format
	}
	var content []byte
	switch *format {
	case "json":
		content, _ = json.MarshalIndent(run, "", "  ")
	case "csv":
		content = renderCSV(run.Results)
	case "md":
		content = []byte(renderMarkdown(run.RunName, run.SessionName, run.Results, nil, runStats(run.Results, len(run.Results))))
	default:
		fatal("unknown format %q (use json, csv or md)", *format)
	}
	if err := os.WriteFile(*output, content, 0o644); err != nil {
		fatal("%v", err)
	}
	fmt.Printf("Exported to %s\n", *output)
}
