import type { ResultData, RunResultRow, RunSummary, ScoreChip } from '../types'

export const COMPARISON_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']

/** Progress of the current (possibly selective) run. */
export function runProgress(data: RunSummary) {
  const count = (status: string) => data.results.filter((r) => (r.result.status ?? 'completed') === status).length
  const inProgress = count('pending') + count('running')
  const selective = data.selected_total != null && data.selected_total > 0
  const total = selective ? data.selected_total! : data.results.length
  return { running: inProgress > 0, total, completed: selective ? total - inProgress : total - inProgress - count('not_started') }
}

export type Outcome = 'not_run' | 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'scored' | 'cancelled'

/** What a row's result means: passed needs at least one pass/fail score and none failed; numeric-only rows are just "scored". */
export function outcomeOf(r: ResultData): Outcome {
  const status = r.status ?? 'completed'
  if (status === 'not_started') return 'not_run'
  if (status === 'pending') return 'queued'
  if (status === 'running' || status === 'cancelled') return status
  if (status === 'error' || r.error) return 'error'
  const scores = r.scores ?? []
  if (scores.some((s) => s.passed === false)) return 'failed'
  return scores.some((s) => s.passed != null) ? 'passed' : 'scored'
}

/** Passed over finished rows (passed, failed and errored), or null when nothing has a pass/fail result. */
export function passRate(passed: number, failed: number, errors: number) {
  return passed + failed > 0 ? passed / (passed + failed + errors) : null
}

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

/** The score keys worth showing beside the pass rate: none when the only key is pass/fail, since the pass rate already says it. */
export function extraChips(chips: ScoreChip[]) {
  return chips.length === 1 && chips[0].type === 'ratio' ? [] : chips
}

export function barTone(pct: number) {
  return pct >= 80 ? 'tone-good' : pct >= 50 ? 'tone-mid' : 'tone-bad'
}

/** pass@k and pass^k over the finished trial rows among `rows` (null when there are none), matching the server's definition. */
export function trialStats(rows: RunResultRow[]) {
  const groups = new Map<string, boolean[]>()
  let k = 0
  for (const row of rows) {
    const status = row.result.status ?? 'completed'
    if (!row.trial || !row.trial_of || (status !== 'completed' && status !== 'error')) continue
    k = Math.max(k, row.trial)
    groups.set(row.trial_of, [...(groups.get(row.trial_of) ?? []), outcomeOf(row.result) === 'passed'])
  }
  if (!groups.size) return null
  const all = [...groups.values()]
  return { k, passAtK: all.filter((g) => g.includes(true)).length / all.length, passAllK: all.filter((g) => !g.includes(false)).length / all.length }
}

/** Outcome counts, score chips and average latency for any subset of rows (e.g. the filtered view). Chips follow `order` (keys) when given. */
export function statsFor(rows: RunResultRow[], order: string[] = []) {
  const outcomes: Partial<Record<Outcome, number>> = {}
  let latencySum = 0
  let latencyCount = 0
  const byKey = new Map<string, { passed: number; bools: number; sum: number; values: number }>()
  for (const { result } of rows) {
    const outcome = outcomeOf(result)
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
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
  const [passed, failed, errors] = [outcomes.passed ?? 0, outcomes.failed ?? 0, outcomes.error ?? 0]
  return {
    count: rows.length,
    passed,
    failed,
    errors,
    finished: passed + failed + errors + (outcomes.scored ?? 0),
    notRun: outcomes.not_run ?? 0,
    rate: passRate(passed, failed, errors),
    avgLatency: latencyCount ? latencySum / latencyCount : 0,
    chips,
  }
}

export type SubsetStats = ReturnType<typeof statsFor>
