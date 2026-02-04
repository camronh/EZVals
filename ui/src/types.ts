export type ScoreValue = number | string | boolean | null

export interface Score {
  key: string
  value?: ScoreValue
  passed?: boolean | null
  notes?: string | null
}

export interface TraceData {
  trace_url?: string | null
  messages?: unknown[]
  [key: string]: unknown
}

export type ResultStatus =
  | 'not_started'
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled'
  | string

export interface ResultData {
  input?: unknown
  reference?: unknown
  metadata?: unknown
  output?: unknown
  error?: string | null
  scores?: Score[] | null
  latency?: number | null
  trace_data?: TraceData | null
  annotation?: string | null
  annotations?: unknown
  status?: ResultStatus
}

export interface RunResultRow {
  function: string
  dataset?: string | null
  labels?: string[] | null
  result?: ResultData | null
}

export interface ScoreChip {
  key: string
  type: 'ratio' | 'avg' | string
  passed?: number
  total?: number
  avg?: number
  count?: number
}

export interface RunSummary {
  session_name?: string | null
  run_name?: string | null
  run_id: string
  total_evaluations?: number
  selected_total?: number | null
  total_errors?: number
  total_passed?: number
  average_latency?: number
  results?: RunResultRow[]
  score_chips?: ScoreChip[]
  eval_path?: string | null
  path?: string | null
  dataset?: string | null
  labels?: string[] | null
  function_name?: string | null
}

export interface SessionRun {
  run_id: string
  run_name: string
  total_evaluations?: number
  total_passed?: number
  total_errors?: number
  timestamp?: number
}

export interface ComparisonRun {
  runId?: string
  run_id?: string
  runName?: string
  run_name?: string
  color?: string
}

export interface NormalizedComparisonRun {
  runId: string
  runName: string
  color: string
}

export interface ValueRule {
  key: string
  op: '>' | '>=' | '<' | '<=' | '==' | '!=' | string
  value: number
}

export interface PassedRule {
  key: string
  value: boolean
}

export interface FilterState {
  valueRules: ValueRule[]
  passedRules: PassedRule[]
  annotation: 'any' | 'yes' | 'no' | string
  selectedDatasets: { include: string[]; exclude: string[] }
  selectedLabels: { include: string[]; exclude: string[] }
  hasUrl: boolean | null
  hasMessages: boolean | null
  hasError: boolean | null
}

export interface Config {
  concurrency?: number | null
  results_dir?: string | null
  timeout?: number | null
  verbose?: boolean | null
}

export interface ColumnDef {
  key: string
  label: string
  width?: string
  type: 'string' | 'number'
  align?: 'left' | 'right' | 'center'
}

export interface SortStateItem {
  col: string
  dir: 'asc' | 'desc'
  type?: 'string' | 'number' | string
}

export interface RunButtonState {
  hidden: boolean
  text: string
  showDropdown: boolean
  isRunning: boolean
}

export interface StatsSummary {
  results: RunResultRow[]
  chips: ScoreChip[]
  total: number
  totalErrors: number
  progressTotal: number
  progressCompleted: number
  avgLatency: number
  completed: number
  pending: number
  running: number
  notStarted: number
  pctDone: number
  progressPending: number
  sessionName?: string | null
  runName?: string | null
  runId?: string | null
  isRunning: boolean
}

export interface FilteredStats {
  total: number
  filtered: number
  avgLatency: number
  chips: ScoreChip[]
}
