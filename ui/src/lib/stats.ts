import type { RunResultRow, RunSummary, ScoreChip } from '../types'

export const COMPARISON_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']

/** Summary numbers for the stats panel, including progress of the current (possibly selective) run. */
export function summarizeStats(data: RunSummary) {
  const count = (status: string) => data.results.filter((r) => (r.result.status ?? 'completed') === status).length
  const pending = count('pending')
  const running = count('running')
  const inProgress = pending + running
  const total = data.total_evaluations ?? data.results.length
  const selective = data.selected_total != null && data.selected_total > 0
  const progressTotal = selective ? data.selected_total! : total
  const progressCompleted = selective ? progressTotal - inProgress : total - inProgress - count('not_started')
  return {
    total,
    totalErrors: data.total_errors ?? 0,
    chips: data.score_chips ?? [],
    avgLatency: data.average_latency ?? 0,
    progressTotal,
    progressCompleted,
    pctDone: progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0,
    isRunning: inProgress > 0,
    trials: data.trials,
    passAtK: data.pass_at_k,
    passAllK: data.pass_all_k,
  }
}

export type StatsSummary = ReturnType<typeof summarizeStats>

/** A chip's bar height (percent) and label: pass ratio, or the average for numeric scores. */
export function chipStats(chip: ScoreChip) {
  if (chip.type === 'ratio') {
    const total = chip.total ?? 0
    return { pct: total > 0 ? Math.round(((chip.passed ?? 0) / total) * 100) : 0, value: `${chip.passed}/${total}` }
  }
  const avg = chip.avg ?? 0
  const pct = avg <= 1 ? Math.round(avg * 100) : avg <= 10 ? Math.round(avg * 10) : Math.min(Math.round(avg), 100)
  return { pct, value: avg.toFixed(2) }
}

export function barTone(pct: number) {
  return pct >= 80 ? 'vbar-green' : pct >= 50 ? 'vbar-amber' : 'vbar-red'
}

/** Score chips and average latency for any subset of rows (e.g. the filtered view). */
export function statsFor(rows: RunResultRow[]) {
  let latencySum = 0
  let latencyCount = 0
  const byKey = new Map<string, { passed: number; bools: number; sum: number; values: number }>()
  for (const { result } of rows) {
    if (typeof result.latency === 'number') {
      latencySum += result.latency
      latencyCount += 1
    }
    for (const s of result.scores ?? []) {
      const d = byKey.get(s.key) ?? { passed: 0, bools: 0, sum: 0, values: 0 }
      byKey.set(s.key, d)
      if (s.passed != null) {
        d.bools += 1
        if (s.passed) d.passed += 1
      }
      const value = Number(s.value)
      if (s.value != null && !Number.isNaN(value)) {
        d.sum += value
        d.values += 1
      }
    }
  }
  const chips: ScoreChip[] = []
  byKey.forEach((d, key) => {
    if (d.bools > 0) chips.push({ key, type: 'ratio', passed: d.passed, total: d.bools })
    else if (d.values > 0) chips.push({ key, type: 'avg', avg: d.sum / d.values, count: d.values })
  })
  return { count: rows.length, avgLatency: latencyCount ? latencySum / latencyCount : 0, chips }
}

export type SubsetStats = ReturnType<typeof statsFor>
