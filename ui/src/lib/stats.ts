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
  const avg = Number((chip.avg ?? 0).toFixed(2)) // so the bar and its label agree
  const pct = avg <= 1 ? Math.round(avg * 100) : avg <= 10 ? Math.round(avg * 10) : Math.min(Math.round(avg), 100)
  return { pct, value: avg.toFixed(2) }
}

export function barTone(pct: number) {
  return pct >= 80 ? 'vbar-green' : pct >= 50 ? 'vbar-amber' : 'vbar-red'
}

const passedResult = (r: RunResultRow['result']) =>
  (r.status ?? 'completed') === 'completed' && !r.error && (r.scores ?? []).some((s) => s.passed != null) && (r.scores ?? []).every((s) => s.passed !== false)

/** pass@k and pass^k over the finished trial rows among `rows` (null when there are none), matching the server's definition. */
export function trialStats(rows: RunResultRow[]) {
  const groups = new Map<string, boolean[]>()
  let k = 0
  for (const row of rows) {
    const status = row.result.status ?? 'completed'
    if (!row.trial || !row.trial_of || (status !== 'completed' && status !== 'error')) continue
    k = Math.max(k, row.trial)
    groups.set(row.trial_of, [...(groups.get(row.trial_of) ?? []), passedResult(row.result)])
  }
  if (!groups.size) return null
  const all = [...groups.values()]
  return { k, passAtK: all.filter((g) => g.includes(true)).length / all.length, passAllK: all.filter((g) => !g.includes(false)).length / all.length }
}

/** Score chips, errors and average latency for any subset of rows (e.g. the filtered view). Chips follow `order` (keys) when given. */
export function statsFor(rows: RunResultRow[], order: string[] = []) {
  let errors = 0
  let latencySum = 0
  let latencyCount = 0
  const byKey = new Map<string, { passed: number; bools: number; sum: number; values: number }>()
  for (const { result } of rows) {
    if (result.error) errors += 1
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
      if (typeof s.value === 'number' && Number.isFinite(s.value)) {
        d.sum += s.value
        d.values += 1
      }
    }
  }
  const chips: ScoreChip[] = []
  byKey.forEach((d, key) => {
    if (d.bools > 0) chips.push({ key, type: 'ratio', passed: d.passed, total: d.bools })
    else if (d.values > 0) chips.push({ key, type: 'avg', avg: d.sum / d.values, count: d.values })
  })
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  chips.sort((a, b) => rank(a.key) - rank(b.key))
  return { count: rows.length, errors, avgLatency: latencyCount ? latencySum / latencyCount : 0, chips }
}

export type SubsetStats = ReturnType<typeof statsFor>
