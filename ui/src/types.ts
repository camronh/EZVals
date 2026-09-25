export interface Score {
  key: string
  value?: number | string | boolean | null
  passed?: boolean | null
  notes?: string | null
}

export interface TraceData {
  trace_url?: string | null
  messages?: unknown[]
  [key: string]: unknown
}

export type ResultStatus = 'not_started' | 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

export interface Correction {
  field: 'annotation' | 'scores'
  before: unknown
  after: unknown
  timestamp: string
}

export interface ResultData {
  input?: unknown
  output?: unknown
  reference?: unknown
  scores?: Score[] | null
  error?: string | null
  latency?: number | null
  metadata?: Record<string, unknown> | null
  trace_data?: TraceData | null
  status?: ResultStatus
  annotation?: string | null
  correction_history?: Correction[]
}

/** An OpenTelemetry span recorded while the eval ran. */
export interface Span {
  trace_id: string
  span_id: string
  parent_span_id?: string
  name: string
  start: number // unix nanoseconds
  end: number
  attributes?: Record<string, unknown>
  status?: 'ok' | 'error'
  status_message?: string
}

export interface RunResultRow {
  id?: string
  function: string
  dataset?: string | null
  labels?: string[] | null
  trial?: number
  trial_of?: string
  span_count?: number
  /** The eval has a target, so a finished result can be regraded without re-running it. */
  regradable?: boolean
  spans?: Span[]
  result: ResultData
}

export interface ScoreChip {
  key: string
  type: 'ratio' | 'avg'
  passed?: number
  total?: number
  avg?: number
  count?: number
}

export interface RunSummary {
  run_id: string
  session_name?: string | null
  run_name?: string | null
  created_at?: number
  path?: string | null
  eval_path?: string | null
  is_paused?: boolean
  total_evaluations?: number
  selected_total?: number | null
  total_errors?: number
  total_passed?: number
  average_latency?: number
  trials?: number
  pass_at_k?: number
  pass_all_k?: number
  results: RunResultRow[]
  score_chips?: ScoreChip[]
  /** Why the eval path couldn't be discovered (e.g. an import error), for the active run. */
  discovery_error?: string
}

export interface ResultDetail {
  result: RunResultRow
  index: number
  total: number
  run_id: string
  session_name?: string | null
  run_name?: string | null
  eval_path?: string | null
}

export interface SessionRun {
  run_id: string
  run_name: string
  timestamp?: number
  total_evaluations?: number
  total_passed?: number
  total_failed?: number
  total_errors?: number
}

export interface ComparisonRun {
  runId: string
  runName: string
  color: string
}

export interface ValueRule {
  key: string
  op: '>' | '>=' | '<' | '<=' | '==' | '!='
  value: number
}

export interface PassedRule {
  key: string
  value: boolean
}

export type TriState = boolean | null

export type OutcomeFilter = 'all' | 'failed' | 'errors'

export interface FilterState {
  outcome: OutcomeFilter
  valueRules: ValueRule[]
  passedRules: PassedRule[]
  annotation: 'any' | 'yes' | 'no'
  selectedDatasets: { include: string[]; exclude: string[] }
  selectedLabels: { include: string[]; exclude: string[] }
  hasUrl: TriState
  hasMessages: TriState
  hasError: TriState
}

export interface Config {
  concurrency?: number
  results_dir?: string
  timeout?: number
  trials?: number
  completion_notifications?: boolean
}

export interface ColumnDef {
  key: string
  label: string
  width: string
  type: 'string' | 'number'
  align: 'left' | 'right'
}

export interface SortRule {
  col: string
  dir: 'asc' | 'desc'
  type: 'string' | 'number'
}
