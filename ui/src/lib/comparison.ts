import type { ComparisonRun, RunResultRow, RunSummary } from '../types'
import { COMPARISON_COLORS } from './stats'

/** Results are matched across runs by function, dataset and trial. */
export function resultKey(row: RunResultRow) {
  return `${row.function}::${row.dataset ?? ''}::${row.trial ?? 0}`
}

/** Runs being compared, in order; each gets the palette color for its position. */
export function withColors(runs: { runId: string; runName?: string }[]): ComparisonRun[] {
  return runs.filter((r) => r.runId).map((r, i) => ({ runId: r.runId, runName: r.runName || r.runId, color: COMPARISON_COLORS[i] ?? COMPARISON_COLORS[0] }))
}

export type ComparisonEntry = {
  key: string
  function: string
  dataset?: string | null
  labels?: string[] | null
  byRun: Record<string, { row: RunResultRow; index: number }>
}

export function buildComparison(runs: ComparisonRun[], data: Record<string, RunSummary>) {
  const entries = new Map<string, ComparisonEntry>()
  for (const run of runs) {
    data[run.runId]?.results.forEach((row, index) => {
      const key = resultKey(row)
      const entry = entries.get(key) ?? { key, function: row.function, dataset: row.dataset, labels: row.labels, byRun: {} }
      entry.byRun[run.runId] = { row, index }
      entries.set(key, entry)
    })
  }
  return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key))
}
