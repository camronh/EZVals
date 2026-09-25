import type { ColumnDef, ComparisonRun, ResultData, RunResultRow, SortRule } from '../types'
import type { ComparisonEntry } from './comparison'
import type { FilterableRow } from './filters'
import { formatValue } from './format'
import { outcomeOf } from './stats'

export const COLUMNS: ColumnDef[] = [
  { key: 'function', label: 'Eval', width: '15%', type: 'string', align: 'left' },
  { key: 'input', label: 'Input', width: '18%', type: 'string', align: 'left' },
  { key: 'reference', label: 'Reference', width: '18%', type: 'string', align: 'left' },
  { key: 'output', label: 'Output', width: '18%', type: 'string', align: 'left' },
  { key: 'error', label: 'Error', width: '18%', type: 'string', align: 'left' },
  { key: 'scores', label: 'Scores', width: '140px', type: 'number', align: 'left' },
  { key: 'latency', label: 'Time', width: '70px', type: 'number', align: 'right' },
]
export const COLUMN_KEYS = COLUMNS.map((c) => c.key)
export const DEFAULT_HIDDEN_COLUMNS = ['error']

export type TableRow = FilterableRow & {
  index: number
  row: RunResultRow
  result: ResultData
  searchText: string
}

export function filterable(row: RunResultRow): FilterableRow {
  const r = row.result
  return {
    outcome: outcomeOf(r),
    annotation: r.annotation,
    dataset: row.dataset,
    labels: row.labels,
    scores: r.scores,
    hasError: !!r.error,
    hasUrl: !!r.trace_data?.trace_url,
    hasMessages: !!r.trace_data?.messages?.length,
  }
}

function searchText(row: RunResultRow, columns: Set<string>) {
  const r = row.result
  const parts: unknown[] = []
  if (columns.has('function')) parts.push(row.function, row.dataset, ...(row.labels ?? []))
  if (columns.has('input')) parts.push(formatValue(r.input))
  if (columns.has('reference')) parts.push(formatValue(r.reference))
  if (columns.has('output')) parts.push(formatValue(r.output))
  if (columns.has('error')) parts.push(r.error)
  if (columns.has('scores')) parts.push(r.annotation, ...(r.scores ?? []).map((s) => `${s.key} ${s.value ?? ''} ${s.passed ?? ''}`))
  if (columns.has('latency')) parts.push(r.latency)
  return parts.filter((p) => p != null && p !== '').join(' ').toLowerCase()
}

export function tableRows(results: RunResultRow[], searchColumns: Set<string>): TableRow[] {
  return results.map((row, index) => ({ ...filterable(row), index, row, result: row.result, searchText: searchText(row, searchColumns) }))
}

export function comparisonSearchText(entry: ComparisonEntry, runs: ComparisonRun[], columns: Set<string>) {
  return [
    columns.has('function') ? `${entry.function} ${entry.dataset ?? ''} ${(entry.labels ?? []).join(' ')}` : '',
    ...runs.map((run) => (entry.byRun[run.runId] ? searchText(entry.byRun[run.runId].row, new Set([...columns].filter((c) => c !== 'function'))) : '')),
  ].join(' ').toLowerCase()
}

function scoreSortValue(result: ResultData) {
  const first = result.scores?.[0]
  if (!first) return ''
  if (first.value != null) return typeof first.value === 'number' ? first.value : String(first.value)
  return first.passed ? 1 : 0
}

export function sortValue(result: ResultData | undefined, row: Pick<RunResultRow, 'function'>, col: string): string | number {
  if (col === 'function') return row.function
  if (!result) return ''
  if (col === 'scores') return scoreSortValue(result)
  if (col === 'latency') return result.latency ?? ''
  if (col === 'error') return result.error ?? ''
  return formatValue(result[col as 'input' | 'output' | 'reference'])
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compare(a: string | number, b: string | number, type: SortRule['type']) {
  if (type === 'string') return collator.compare(String(a), String(b))
  const x = a === '' ? Infinity : Number(a)
  const y = b === '' ? Infinity : Number(b)
  return x === y ? 0 : x < y ? -1 : 1
}

/** Sorts by each rule in turn, keeping the original order for ties. */
export function sortBy<T extends { index: number }>(items: T[], rules: SortRule[], value: (item: T, col: string) => string | number) {
  if (!rules.length) return items
  return [...items].sort((a, b) => {
    for (const rule of rules) {
      const cmp = compare(value(a, rule.col), value(b, rule.col), rule.type)
      if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp
    }
    return a.index - b.index
  })
}

/** Click: sort by a column (asc → desc → off). Shift-click: add it as a secondary sort. */
export function toggleSort(rules: SortRule[], col: string, type: SortRule['type'], multi: boolean): SortRule[] {
  const existing = rules.find((r) => r.col === col)
  if (!multi) {
    if (rules[0]?.col !== col) return [{ col, dir: 'asc', type }]
    return rules[0].dir === 'asc' ? [{ col, dir: 'desc', type }] : []
  }
  if (!existing) return [...rules, { col, dir: 'asc', type }]
  if (existing.dir === 'asc') return rules.map((r) => (r.col === col ? { ...r, dir: 'desc' } : r))
  return rules.filter((r) => r.col !== col)
}
