package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	_ "modernc.org/sqlite"
)

// JSON columns hold JSON text: read them with json_extract(output, '$.field').
const querySchema = `CREATE TABLE runs (
  run_id TEXT, session_name TEXT, run_name TEXT, created_at INTEGER, path TEXT, config_name TEXT,
  total_evaluations INTEGER, total_passed INTEGER, total_errors INTEGER, average_latency REAL,
  trials INTEGER, pass_at_k REAL, pass_all_k REAL
);
CREATE TABLE results (
  run_id TEXT, row INTEGER, eval_id TEXT, function TEXT, dataset TEXT, labels JSON, trial INTEGER,
  status TEXT, passed INTEGER, input JSON, output JSON, reference JSON, error TEXT, latency REAL,
  metadata JSON, trace_data JSON, annotation TEXT
);
CREATE TABLE scores (
  run_id TEXT, row INTEGER, eval_id TEXT, function TEXT, key TEXT, value REAL, passed INTEGER, notes TEXT
);
CREATE TABLE spans (
  run_id TEXT, eval_id TEXT, trace_id TEXT, span_id TEXT, parent_span_id TEXT, name TEXT,
  start_ms REAL, duration_ms REAL, status TEXT, attributes JSON
);`

const queryHelp = `Every saved run is loaded into these tables (results.passed: the row finished and all its pass/fail scores passed):

%s

Examples:
  ezvals query "SELECT run_name, total_passed, total_evaluations FROM runs ORDER BY created_at DESC"
  ezvals query "SELECT function, avg(passed) FROM results WHERE run_id = 'a1b2c3d4' GROUP BY function"
  ezvals query "SELECT key, avg(value) FROM scores GROUP BY key"
  ezvals query "SELECT name, sum(json_extract(attributes, '$.\"gen_ai.usage.input_tokens\"')) FROM spans GROUP BY name"
`

func queryCmd(args []string) {
	fs := flag.NewFlagSet("query", flag.ExitOnError)
	jsonOut := fs.Bool("json", false, "print rows as a JSON array")
	schema := fs.Bool("schema", false, "print the tables and example queries")
	positional := parseFlags(fs, args)
	if *schema || len(positional) != 1 {
		fmt.Printf(queryHelp, querySchema)
		return
	}
	db, err := loadRunsDB(openStore(loadConfig().sessionsDir()))
	if err != nil {
		fatal("%v", err)
	}
	rows, err := db.Query(positional[0])
	if err != nil {
		fatal("%v", err)
	}
	columns, _ := rows.Columns()
	var records [][]any
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		rows.Scan(pointers...)
		records = append(records, values)
	}
	if err := rows.Err(); err != nil {
		fatal("%v", err)
	}

	if *jsonOut {
		objects := []map[string]any{}
		for _, record := range records {
			object := map[string]any{}
			for i, c := range columns {
				object[c] = record[i]
			}
			objects = append(objects, object)
		}
		json.NewEncoder(os.Stdout).Encode(objects)
		return
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, strings.Join(columns, "\t"))
	for _, record := range records {
		cells := make([]string, len(record))
		for i, v := range record {
			if v != nil {
				cells[i] = strings.ReplaceAll(fmt.Sprint(v), "\n", " ")
			}
		}
		fmt.Fprintln(w, strings.Join(cells, "\t"))
	}
	w.Flush()
}

func loadRunsDB(store *Store) (*sql.DB, error) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // one connection, so every query sees the same in-memory database
	if _, err := db.Exec(querySchema); err != nil {
		return nil, err
	}
	tx, _ := db.Begin()
	for _, session := range store.Sessions() {
		for _, run := range store.Runs(session) {
			tx.Exec(`INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, run.RunID, run.SessionName, run.RunName, run.CreatedAt,
				run.Path, run.ConfigName, run.TotalEvaluations, run.TotalPassed, run.TotalErrors, run.AverageLatency,
				run.Trials, run.PassAtK, run.PassAllK)
			for i, row := range run.Results {
				r := row.Result
				tx.Exec(`INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, run.RunID, i, row.ID, row.Function,
					row.Dataset, jsonString(row.Labels), row.Trial, r.Status, passed(r), jsonString(r.Input), jsonString(r.Output),
					jsonString(r.Reference), r.Error, r.Latency, jsonString(r.Metadata), jsonString(r.TraceData), r.Annotation)
				for _, s := range r.Scores {
					tx.Exec(`INSERT INTO scores VALUES (?,?,?,?,?,?,?,?)`, run.RunID, i, row.ID, row.Function, s.Key, s.Value, s.Passed, s.Notes)
				}
			}
			for id, spans := range run.spans {
				for _, s := range spans {
					tx.Exec(`INSERT INTO spans VALUES (?,?,?,?,?,?,?,?,?,?)`, run.RunID, id, s.TraceID, s.SpanID, s.ParentSpanID, s.Name,
						float64(s.Start)/1e6, float64(s.End-s.Start)/1e6, s.Status, jsonString(s.Attributes))
				}
			}
		}
	}
	return db, tx.Commit()
}
