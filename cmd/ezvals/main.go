package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	mrand "math/rand/v2"
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
	info := RunInfo{RunID: newRunID(), SessionName: sanitize(*session), RunName: sanitize(*runName), EvalPath: path, Config: profile, Timeout: *timeout}
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
		for _, e := range es {
			for _, r := range e.Results {
				if *verbose && r.Error != nil {
					fmt.Fprintf(os.Stderr, "\nERROR in %s:\n%s\n", e.ID, *r.Error)
				}
			}
		}
	}
	emit(Event{Type: "evals", Evals: evals}, Event{Type: "queued", IDs: ids(evals)})
	x := execute(workers, ids(evals), *concurrency, emit)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	select {
	case <-x.Done:
	case <-interrupt:
		fmt.Fprintln(os.Stderr, "\nStopping...")
		x.Stop()
	}

	report := struct {
		*Run
		SavedPath string `json:"saved_path,omitempty"`
	}{Run: materialize(events)}
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
