package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
)

func jsonString(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func renderCSV(rows []Row) []byte {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Write([]string{"function", "dataset", "labels", "input", "output", "reference", "scores", "error", "latency", "metadata", "trace_data", "annotation"})
	for _, row := range rows {
		r := row.Result
		latency, errText, dataset, annotation := "", "", "", ""
		if r.Latency != nil {
			latency = fmt.Sprint(*r.Latency)
		}
		if r.Error != nil {
			errText = *r.Error
		}
		if row.Dataset != nil {
			dataset = *row.Dataset
		}
		if r.Annotation != nil {
			annotation = *r.Annotation
		}
		w.Write([]string{row.Function, dataset, strings.Join(row.Labels, ";"), jsonString(r.Input), jsonString(r.Output),
			jsonString(r.Reference), jsonString(r.Scores), errText, latency, jsonString(r.Metadata), jsonString(r.TraceData), annotation})
	}
	w.Flush()
	return buf.Bytes()
}

// Stats is the summary shown above an exported table. The UI sends it for filtered exports.
type Stats struct {
	Total      int         `json:"total"`
	Filtered   int         `json:"filtered"`
	AvgLatency float64     `json:"avgLatency"`
	Chips      []ScoreChip `json:"chips"`
}

func runStats(rows []Row, total int) Stats {
	run := &Run{Results: rows}
	run.computeTotals()
	return Stats{Total: total, Filtered: len(rows), AvgLatency: run.AverageLatency, Chips: scoreChips(rows)}
}

func chipPercent(c ScoreChip) int {
	if c.Type == "ratio" {
		if c.Total == 0 {
			return 0
		}
		return int(math.Round(float64(c.Passed) / float64(c.Total) * 100))
	}
	return min(100, int(math.Round(c.Avg*100)))
}

func chipScore(c ScoreChip) string {
	if c.Type == "ratio" {
		return fmt.Sprintf("%d%% (%d/%d)", chipPercent(c), c.Passed, c.Total)
	}
	return fmt.Sprintf("%d%% (avg: %.2f)", chipPercent(c), c.Avg)
}

func cell(s string) string { return strings.NewReplacer("|", `\|`, "\n", " ").Replace(s) }

func scoreMarks(scores []Score, withValues bool) string {
	var parts []string
	for _, s := range scores {
		switch {
		case s.Passed != nil && *s.Passed:
			parts = append(parts, "✅ "+s.Key)
		case s.Passed != nil:
			parts = append(parts, "❌ "+s.Key)
		case s.Value != nil && withValues:
			parts = append(parts, fmt.Sprintf("%s:%v", s.Key, *s.Value))
		}
	}
	return strings.Join(parts, " ")
}

var markdownColumns = map[string]string{"function": "Eval", "dataset": "Dataset", "input": "Input", "output": "Output",
	"reference": "Reference", "scores": "Scores", "error": "Error", "latency": "Latency"}

func renderMarkdown(runName, session string, rows []Row, columns []string, stats Stats) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n", runName)
	if session != "" {
		fmt.Fprintf(&b, "**Session:** %s\n", session)
	}
	summary := []string{fmt.Sprintf("**%d/%d** tests", stats.Filtered, stats.Total)}
	run := &Run{Results: rows}
	run.computeTotals()
	if run.TotalErrors > 0 {
		summary = append(summary, fmt.Sprintf("**%d** errors", run.TotalErrors))
	}
	if stats.AvgLatency > 0 {
		summary = append(summary, fmt.Sprintf("**%.2fs** avg latency", stats.AvgLatency))
	}
	fmt.Fprintf(&b, "\n%s\n\n", strings.Join(summary, " · "))

	if len(stats.Chips) > 0 {
		b.WriteString("## Scores\n\n| Metric | Progress | Score |\n|--------|----------|-------|\n")
		for _, c := range stats.Chips {
			pct := chipPercent(c)
			indicator := "🔴"
			if pct >= 80 {
				indicator = "🟢"
			} else if pct >= 50 {
				indicator = "🟡"
			}
			bar := strings.Repeat("█", pct/5) + strings.Repeat("░", 20-pct/5)
			fmt.Fprintf(&b, "| **%s** | %s %s | %s |\n", c.Key, bar, indicator, chipScore(c))
		}
		b.WriteString("\n")
	}

	b.WriteString("## Results\n")
	if len(rows) == 0 {
		b.WriteString("*No results*")
		return b.String()
	}
	var known []string
	for _, c := range columns {
		if markdownColumns[c] != "" {
			known = append(known, c)
		}
	}
	if len(known) == 0 {
		known = []string{"function", "dataset", "input", "output", "reference", "scores", "error", "latency"}
	}
	headers := make([]string, len(known))
	for i, c := range known {
		headers[i] = markdownColumns[c]
	}
	fmt.Fprintf(&b, "| %s |\n|%s|\n", strings.Join(headers, " | "), strings.Repeat("---|", len(known)))
	for _, row := range rows {
		r := row.Result
		values := make([]string, len(known))
		for i, c := range known {
			switch c {
			case "function":
				values[i] = row.Function
			case "dataset":
				if row.Dataset != nil {
					values[i] = *row.Dataset
				}
			case "input":
				values[i] = jsonString(r.Input)
			case "output":
				values[i] = jsonString(r.Output)
			case "reference":
				values[i] = jsonString(r.Reference)
			case "scores":
				values[i] = scoreMarks(r.Scores, true)
			case "error":
				if r.Error != nil {
					values[i] = *r.Error
				}
			case "latency":
				if r.Latency != nil && *r.Latency > 0 {
					values[i] = fmt.Sprintf("%.2fs", *r.Latency)
				}
			}
			values[i] = cell(values[i])
		}
		fmt.Fprintf(&b, "| %s |\n", strings.Join(values, " | "))
	}
	return b.String()
}

type ComparisonRun struct {
	RunID      string      `json:"run_id"`
	RunName    string      `json:"run_name"`
	Chips      []ScoreChip `json:"chips"`
	AvgLatency float64     `json:"avg_latency"`
	Results    []Row       `json:"results"`
}

func renderComparisonMarkdown(runs []ComparisonRun, session string) string {
	var b strings.Builder
	names := make([]string, len(runs))
	for i, r := range runs {
		names[i] = r.RunName
	}
	fmt.Fprintf(&b, "# Comparison: %s\n", strings.Join(names, " vs "))
	if session != "" {
		fmt.Fprintf(&b, "**Session:** %s\n", session)
	}
	b.WriteString("\n## Scores\n\n")
	keys := map[string]bool{}
	maxLatency := 0.0
	for _, r := range runs {
		for _, c := range r.Chips {
			keys[c.Key] = true
		}
		maxLatency = max(maxLatency, r.AvgLatency)
	}
	sortedKeys := make([]string, 0, len(keys))
	for k := range keys {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)
	for _, key := range sortedKeys {
		fmt.Fprintf(&b, "### %s\n\n| Run | Progress | Score |\n|-----|----------|-------|\n", key)
		for _, r := range runs {
			bar, score := "—", "—"
			for _, c := range r.Chips {
				if c.Key == key {
					bar, score = fmt.Sprintf("![](https://geps.dev/progress/%d)", chipPercent(c)), chipScore(c)
				}
			}
			fmt.Fprintf(&b, "| %s | %s | %s |\n", r.RunName, bar, score)
		}
		b.WriteString("\n")
	}
	if maxLatency > 0 {
		b.WriteString("### latency\n\n| Run | Progress | Value |\n|-----|----------|-------|\n")
		for _, r := range runs {
			fmt.Fprintf(&b, "| %s | ![](https://geps.dev/progress/%d) | %.2fs |\n", r.RunName, int(r.AvgLatency/maxLatency*100), r.AvgLatency)
		}
		b.WriteString("\n")
	}

	b.WriteString("## Results\n\n")
	type entry struct {
		function string
		byRun    map[string]*Result
	}
	entries := map[string]*entry{}
	for _, r := range runs {
		for _, row := range r.Results {
			dataset := ""
			if row.Dataset != nil {
				dataset = *row.Dataset
			}
			key := row.Function + "::" + dataset
			if entries[key] == nil {
				entries[key] = &entry{function: row.Function, byRun: map[string]*Result{}}
			}
			entries[key].byRun[r.RunID] = &row.Result
		}
	}
	if len(entries) == 0 {
		b.WriteString("*No results*")
		return b.String()
	}
	fmt.Fprintf(&b, "| Eval | Input | %s |\n|%s|\n", strings.Join(names, " | "), strings.Repeat("---|", len(runs)+2))
	entryKeys := make([]string, 0, len(entries))
	for k := range entries {
		entryKeys = append(entryKeys, k)
	}
	sort.Strings(entryKeys)
	for _, k := range entryKeys {
		e := entries[k]
		values := []string{e.function, `""`}
		for _, r := range runs {
			if res := e.byRun[r.RunID]; res != nil {
				values[1] = jsonString(res.Input)
				break
			}
		}
		for _, r := range runs {
			res := e.byRun[r.RunID]
			if res == nil {
				values = append(values, "—")
				continue
			}
			out := jsonString(res.Output)
			if marks := scoreMarks(res.Scores, false); marks != "" {
				out += "<br>" + marks
			}
			values = append(values, out)
		}
		for i := range values {
			values[i] = cell(values[i])
		}
		fmt.Fprintf(&b, "| %s |\n", strings.Join(values, " | "))
	}
	return b.String()
}
