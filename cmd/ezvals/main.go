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
	"time"
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

// newFlagSet prints its help as one `-s, --long VALUE  usage` line per flag, folding in the flag's
// "shorthand for --long" alias.
func newFlagSet(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	fs.Usage = func() {
		short := map[string]string{}
		fs.VisitAll(func(f *flag.Flag) {
			if long, ok := strings.CutPrefix(f.Usage, "shorthand for --"); ok {
				short[long] = "-" + f.Name + ", "
			}
		})
		fmt.Fprintf(os.Stderr, "Usage: ezvals %s [flags]\n\nFlags:\n", name)
		fs.VisitAll(func(f *flag.Flag) {
			if strings.HasPrefix(f.Usage, "shorthand for --") {
				return
			}
			value, usage := flag.UnquoteUsage(f)
			fmt.Fprintf(os.Stderr, "  %-28s %s\n", short[f.Name]+"--"+f.Name+" "+strings.ToUpper(value), usage)
		})
	}
	return fs
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

func defaultConfig() Config {
	return Config{Concurrency: 1, ResultsDir: ".", Overwrite: true, Port: 8000}
}

func loadConfig() Config {
	c := defaultConfig()
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
	current := map[string]Eval{} // by SDK id; the manifest may already be expanded into trials
	for _, e := range manifest {
		current[e.sdkID()] = e
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
		jobs = append(jobs, Job{ID: row.ID, Eval: eval.sdkID(), Grade: &stored})
	}
	return jobs, noTarget
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
	fs := newFlagSet("run")
	var labels multiFlag
	dataset := fs.String("dataset", "", "filter by dataset(s), comma-separated")
	fs.StringVar(dataset, "d", "", "shorthand for --dataset")
	fs.Var(&labels, "label", "filter by `label` (repeatable)")
	fs.Var(&labels, "l", "shorthand for --label")
	limit := fs.Int("limit", 0, "run at most this many evals")
	output := fs.String("output", "", "write the results JSON here instead of the session store")
	fs.StringVar(output, "o", "", "shorthand for --output")
	concurrency := fs.Int("concurrency", -1, "evals to run in parallel (default: ezvals.json, else 1)")
	fs.IntVar(concurrency, "c", -1, "shorthand for --concurrency")
	timeout := fs.Float64("timeout", 0, "per-eval timeout in seconds")
	trials := fs.Int("trials", 0, "run every eval this many times (default: each eval's own trials)")
	verbose := fs.Bool("verbose", false, "show eval output and full error tracebacks")
	fs.BoolVar(verbose, "v", false, "shorthand for --verbose")
	quiet := fs.Bool("quiet", false, "print only the summary")
	fs.BoolVar(quiet, "q", false, "shorthand for --quiet")
	session := fs.String("session", "default", "session name")
	runName := fs.String("run-name", "", "run name (default: the --config name, else a random name)")
	noSave := fs.Bool("no-save", false, "print the results JSON instead of saving")
	jsonOut := fs.Bool("json", false, "print the results JSON (with saved_path) to stdout")
	rename := fs.String("rename", "", "rename saved run RUN_ID to the positional NEW_NAME")
	configName := fs.String("config", "", "named config profile from ezvals.json")
	positional := parseFlags(fs, args)
	cfg := loadConfig()

	if *rename != "" {
		if len(positional) != 1 || cleanRunName(positional[0]) == "" {
			fatal("usage: ezvals run --rename RUN_ID NEW_NAME")
		}
		store := openStore(cfg.sessionsDir())
		name := cleanRunName(positional[0])
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
	// A session is a directory, so its name is sanitized; one with no usable characters falls back to the default.
	if *runName = cleanRunName(*runName); *runName == "" {
		*runName = *configName
	}
	if *runName == "" {
		*runName = friendlyName()
	}
	if *session = sanitize(*session); *session == "" {
		*session = "default"
	}

	path, selectors := splitSelector(positional[0])
	info := RunInfo{RunID: newRunID(), SessionName: *session, RunName: *runName, EvalPath: path, Config: profile, Timeout: *timeout}
	workers, manifest, err := startWorkers(path, info, *verbose)
	if err != nil {
		if *jsonOut || *noSave {
			json.NewEncoder(os.Stdout).Encode(map[string]any{"error": err.Error(), "results": []Row{}})
		}
		fatal("%v", err)
	}
	header := Event{Type: "run", At: time.Now().Unix(), RunID: info.RunID, SessionName: info.SessionName, RunName: info.RunName,
		Path: path, Dataset: *dataset, Labels: labels, FunctionName: strings.Join(selectors, ","), ConfigName: *configName}
	evals := filterEvals(manifest, *dataset, labels, selectors)
	if *limit > 0 && len(evals) > *limit {
		evals = evals[:*limit]
	}
	if len(evals) == 0 {
		stopWorkers(workers)
		filters := ""
		if *dataset != "" {
			filters += " --dataset " + *dataset
		}
		for _, l := range labels {
			filters += " --label " + l
		}
		message := "No evals found in " + path
		if filters != "" {
			message += " with" + filters
		}
		for _, s := range selectors {
			if s = strings.TrimSpace(s); len(manifest) > 0 && len(filterEvals(manifest, "", nil, []string{s})) == 0 {
				message = fmt.Sprintf("No evals match '%s' in %s.", s, path)
				if guess := closest(s, manifest); guess != "" {
					message += " Did you mean " + guess + "?"
				}
				break
			}
		}
		fmt.Fprintln(os.Stderr, message)
		if *jsonOut || *noSave {
			json.NewEncoder(os.Stdout).Encode(report{Run: materialize([]Event{header})})
		}
		os.Exit(4)
	}
	evals = expandTrials(evals, *trials)
	term := &terminal{verbose: *verbose, color: os.Getenv("NO_COLOR") == ""}
	if stat, err := os.Stderr.Stat(); err != nil || stat.Mode()&os.ModeCharDevice == 0 {
		term.color = false
	}
	remaining := map[string]int{} // results still to come, by group
	var groups []string
	printed := 0 // groups print in order, each once it and every group before it are done
	for _, e := range evals {
		g := groupOf(e.ID)
		if _, seen := remaining[g]; !seen {
			groups = append(groups, g)
		}
		remaining[g]++
		_, fn, _ := strings.Cut(g, "::")
		term.width = max(term.width, len(fn))
	}
	if !*quiet {
		fmt.Fprintf(os.Stderr, "ezvals run %s  %s\n", positional[0], term.paint(dim, "(session "+info.SessionName+" · run "+info.RunName+")"))
	}

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
		for i := range es {
			es[i].At = time.Now().Unix() // the in-memory copy needs timestamps too (e.g. for created_at)
		}
		events = append(events, es...)
		if save {
			if err := store.Append(info.RunID, es...); err != nil {
				fatal("%v", err)
			}
		}
		for _, e := range es {
			if e.Type != "result" || *quiet {
				continue
			}
			if remaining[groupOf(e.ID)]--; printed < len(groups) && remaining[groups[printed]] == 0 {
				run := materialize(events)
				for ; printed < len(groups) && remaining[groups[printed]] == 0; printed++ {
					term.group(run, groups[printed])
				}
			}
		}
	}
	emit(Event{Type: "evals", Evals: evals}, Event{Type: "queued", IDs: ids(evals)})
	start := time.Now()
	runJobs(workers, jobs(evals), *concurrency, emit)

	report := report{Run: materialize(events)}
	for ; printed < len(groups) && !*quiet; printed++ { // cancelled before all their results came in
		term.group(report.Run, groups[printed])
	}
	term.summary(report.Run, len(groups), time.Since(start), *quiet)
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
		fmt.Fprintf(os.Stderr, "Saved to %s %s\n", report.SavedPath, term.paint(dim, "· view: ezvals serve "+report.SavedPath))
	}
}

// groupOf is the file and function (without its case or trial) of an eval id: <file>::<function>[case]~trial.
func groupOf(id string) string {
	group, _, _ := strings.Cut(id, "[")
	group, _, _ = strings.Cut(group, "~")
	return group
}

// closest suggests the function (or function@case) nearest a selector that matched nothing: one it prefixes, else
// one within a few edits.
func closest(selector string, evals []Eval) string {
	best, bestDistance := "", max(2, len(selector)/3)+1
	for _, e := range evals {
		fn, c, _ := strings.Cut(strings.TrimSuffix(e.Function, "]"), "[")
		candidates := []string{fn}
		if c != "" {
			candidates = append(candidates, fn+"@"+c)
		}
		for _, candidate := range candidates {
			distance := 0
			if !strings.HasPrefix(candidate, selector) { // Levenshtein distance
				prev := make([]int, len(candidate)+1)
				for j := range prev {
					prev[j] = j
				}
				for i := 1; i <= len(selector); i++ {
					cur := []int{i}
					for j := 1; j <= len(candidate); j++ {
						cost := 1
						if selector[i-1] == candidate[j-1] {
							cost = 0
						}
						cur = append(cur, min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost))
					}
					prev = cur
				}
				distance = prev[len(candidate)]
			}
			if distance < bestDistance {
				best, bestDistance = candidate, distance
			}
		}
	}
	return best
}

const (
	dim     = "2"
	red     = "31"
	green   = "32"
	yellow  = "33"
	magenta = "35"
)

// marks shows each outcome, plus "partial" for a function whose results were mixed.
var marks = map[string][2]string{"passed": {"✓", green}, "failed": {"✗", red}, "partial": {"◐", yellow},
	"error": {"!", magenta}, "scored": {"○", ""}}

// terminal prints a run's progress and summary to stderr.
type terminal struct {
	color, verbose bool
	width          int    // of the longest function name
	file           string // of the last function printed
}

func (t *terminal) paint(color, s string) string {
	if !t.color || color == "" {
		return s
	}
	return "\x1b[" + color + "m" + s + "\x1b[0m"
}

func (t *terminal) mark(outcome string) string { return t.paint(marks[outcome][1], marks[outcome][0]) }

// chips shows each score key's pass rate or average.
func (t *terminal) chips(chips []ScoreChip) []string {
	var out []string
	for _, c := range chips {
		if c.Type == "ratio" {
			out = append(out, fmt.Sprintf("%s %d%%", c.Key, c.Passed*100/c.Total))
		} else if c.Count > 0 {
			out = append(out, fmt.Sprintf("%s %.2f", c.Key, c.Avg))
		}
	}
	return out
}

// group prints one line for a function, folding its cases and trials.
func (t *terminal) group(run *Run, group string) {
	var rows []Row
	count := map[string]int{}
	cases := map[string]bool{}
	latency := 0.0
	for _, row := range run.Results {
		if groupOf(row.ID) != group {
			continue
		}
		rows = append(rows, row)
		count[outcome(row.Result)]++
		cases[Eval{ID: row.ID, TrialOf: row.TrialOf}.sdkID()] = true
		if row.Result.Latency != nil {
			latency += *row.Result.Latency
		}
	}
	file, fn, _ := strings.Cut(group, "::")
	if file != t.file {
		fmt.Fprintf(os.Stderr, "\n%s\n", file)
		t.file = file
	}
	n := len(rows)
	kind := "partial"
	switch {
	case count["error"] == n:
		kind = "error"
	case count["scored"] == n:
		kind = "scored"
	case count["passed"]+count["scored"] == n:
		kind = "passed"
	case count["passed"] == 0:
		kind = "failed"
	}
	var details []string
	if n > 1 {
		unit := "results"
		if rows[0].Trial > 0 && len(cases) == 1 {
			unit = "trials"
		} else if len(cases) == n {
			unit = "cases"
		}
		if kind == "scored" {
			details = append(details, fmt.Sprintf("%d %s", n, unit))
		} else {
			details = append(details, fmt.Sprintf("%d/%d %s", count["passed"], n, unit))
		}
		if unit == "trials" {
			anyPassed, allPassed := "failed", "failed"
			if count["passed"] > 0 {
				anyPassed = "passed"
			}
			if count["passed"] == n {
				allPassed = "passed"
			}
			details = append(details, fmt.Sprintf("pass@%d %s", n, t.mark(anyPassed)), fmt.Sprintf("pass^%d %s", n, t.mark(allPassed)))
		}
	}
	if chips := scoreChips(rows); len(chips) > 1 || len(chips) == 1 && chips[0].Type != "ratio" {
		details = append(details, t.chips(chips)...)
	}
	line := fmt.Sprintf("%-*s %s  %s", t.width, fn, t.paint(dim, fmt.Sprintf("%5.1fs", latency)), strings.Join(details, "  "))
	fmt.Fprintf(os.Stderr, "  %s %s\n", t.mark(kind), strings.TrimSpace(line))
}

// summary prints the failures (unless quiet) and the counts of each outcome.
func (t *terminal) summary(run *Run, evals int, elapsed time.Duration, quiet bool) {
	count := map[string]int{}
	var failures []Row
	for _, row := range run.Results {
		kind := outcome(row.Result)
		count[kind]++
		if kind == "failed" || kind == "error" {
			failures = append(failures, row)
		}
	}
	if !quiet && len(failures) > 0 {
		fmt.Fprintf(os.Stderr, "\n%s\n", t.paint(dim, "── failures ──"))
		truncate := func(v any) string {
			data, _ := json.Marshal(v)
			if s := []rune(string(data)); len(s) > 60 {
				return string(s[:60]) + "…"
			}
			return string(data)
		}
		for i, row := range failures {
			if i == 20 {
				fmt.Fprintf(os.Stderr, "… and %d more\n", len(failures)-20)
				break
			}
			file, name, _ := strings.Cut(row.ID, "::")
			r := row.Result
			fmt.Fprintf(os.Stderr, "%s %s  %s\n", t.mark(outcome(r)), name, t.paint(dim, file))
			if r.Error != nil {
				text := *r.Error
				if !t.verbose {
					text, _, _ = strings.Cut(text, "\n")
				}
				fmt.Fprintf(os.Stderr, "  %s\n", strings.ReplaceAll(strings.TrimSpace(text), "\n", "\n  "))
			}
			for _, s := range r.Scores {
				if s.Passed != nil && !*s.Passed {
					notes := "failed"
					if s.Notes != nil && *s.Notes != "" {
						notes = *s.Notes
					}
					fmt.Fprintf(os.Stderr, "  %s: %s\n", s.Key, notes)
				}
			}
			fmt.Fprintf(os.Stderr, "  %s\n", t.paint(dim, "input: "+truncate(r.Input)+"  output: "+truncate(r.Output)))
		}
	}
	parts := []string{t.paint(green, fmt.Sprintf("%d passed", count["passed"])), t.paint(red, fmt.Sprintf("%d failed", count["failed"]))}
	for _, kind := range []string{"error", "scored", "cancelled"} {
		if count[kind] > 0 {
			label := kind
			if kind == "error" && count[kind] > 1 {
				label = "errors"
			}
			parts = append(parts, t.paint(marks[kind][1], fmt.Sprintf("%d %s", count[kind], label)))
		}
	}
	if !quiet {
		fmt.Fprintln(os.Stderr)
	}
	fmt.Fprintf(os.Stderr, "%s  %s\n", strings.Join(parts, "  "),
		t.paint(dim, fmt.Sprintf("(%d results · %d evals · %.1fs)", len(run.Results), evals, elapsed.Seconds())))
	stats := t.chips(scoreChips(run.Results))
	if run.PassAtK != nil {
		stats = append(stats, fmt.Sprintf("pass@%d %.0f%%", run.Trials, *run.PassAtK*100), fmt.Sprintf("pass^%d %.0f%%", run.Trials, *run.PassAllK*100))
	}
	if len(stats) > 0 {
		fmt.Fprintln(os.Stderr, t.paint(dim, strings.Join(stats, " · ")))
	}
}

func regradeCmd(args []string) {
	fs := newFlagSet("regrade")
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
	info := RunInfo{RunID: run.RunID, SessionName: run.SessionName, RunName: run.RunName, EvalPath: run.Path, Config: profile,
		Timeout: cfg.Timeout}
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
	fmt.Fprintf(os.Stderr, "Regrading %d result(s) of %s\n", len(jobs), run.RunName)
	queued := Event{Type: "queued"}
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
	fs := newFlagSet("export")
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
