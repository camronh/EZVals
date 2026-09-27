import { useRef, useState } from 'react'
import type { ComparisonRun, ScoreChip, SessionRun } from '../../types'
import { Icon } from '../../components/Icon'
import { barTone, chipStats, extraChips, type SubsetStats } from '../../lib/stats'
import { RunsMenu } from './Header'

export type Comparison = {
  runs: ComparisonRun[]
  stats: Record<string, SubsetStats>
  onMove: (runId: string, direction: -1 | 1) => void
  onRemove: (runId: string) => void
  onAdd: (runId: string) => void
}

type Props = {
  stats: SubsetStats
  /** All evals in the run; the eval count reads "5 of 20" when `stats` covers fewer rows. */
  total: number
  progress: { running: boolean; completed: number; total: number }
  trials?: { k: number; passAtK: number; passAllK: number } | null
  /** Pass-rate change in points since the previous run, and how to compare with it. */
  delta?: { points: number; previous: string; onCompare: () => void } | null
  sessionRuns: SessionRun[]
  comparison?: Comparison
  /** Pass rate of each of the session's runs, oldest first; the current one is marked. */
  trend?: { name: string; rate: number; current: boolean }[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const chipText = (chip: ScoreChip) => (chip.type === 'ratio' ? `${chipStats(chip).pct}%` : chipStats(chip).value)

function Metrics({ chips }: { chips: ScoreChip[] }) {
  return (
    <div id="score-metrics" className="grid min-w-0 flex-[1.2] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-8 gap-y-4">
      {chips.map((chip) => {
        const { pct: value, value: detail } = chipStats(chip)
        return (
          <div key={chip.key} className="score-metric min-w-0">
            <div className="truncate text-xs text-fg-muted" title={chip.key}>{chip.key}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums text-fg">{chip.type === 'ratio' ? `${value}%` : detail}</span>
              <span className="text-xs tabular-nums text-fg-muted">{chip.type === 'ratio' ? detail : 'avg'}</span>
            </div>
            <div className={`summary-bar mt-1.5 ${barTone(value)}`}><div style={{ width: `${Math.max(value, 0)}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

/** Pass rate across the session's runs as a sparkline; the current run is the filled dot. */
function Trend({ points }: { points: NonNullable<Props['trend']> }) {
  const [w, h, pad] = [168, 40, 5]
  const at = (i: number, rate: number) => [pad + (i / (points.length - 1)) * (w - 2 * pad), pad + (1 - rate) * (h - 2 * pad)]
  const label = points.map((p) => `${p.name} ${Math.round(p.rate * 100)}%`).join(', ')
  return (
    <figure className="m-0 shrink-0" id="pass-rate-trend">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Pass rate by run: ${label}`} className="block overflow-visible">
        <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} className="stroke-line" strokeDasharray="2 3" />
        <polyline fill="none" className="stroke-accent" strokeWidth="1.5" strokeLinejoin="round" points={points.map((p, i) => at(i, p.rate).join(',')).join(' ')} />
        {points.map((p, i) => {
          const [x, y] = at(i, p.rate)
          return <circle key={i} cx={x} cy={y} r={p.current ? 4 : 2.5} className={p.current ? 'fill-accent stroke-surface' : 'fill-surface stroke-accent'} strokeWidth="1.5"><title>{`${p.name}: ${Math.round(p.rate * 100)}%`}</title></circle>
        })}
      </svg>
      <figcaption className="mt-1 text-right text-2xs text-fg-muted">Pass rate, last {points.length} runs</figcaption>
    </figure>
  )
}

function Headline({ stats, total, progress, trials, delta, trend }: Props) {
  const evals = stats.count < total ? `${stats.count} of ${plural(total, 'eval')}` : plural(total, 'eval')
  if (!stats.finished && !progress.running && stats.notRun === stats.count) {
    return (
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-fg">{stats.count}</span>
        <span className="text-sm text-fg-muted">{stats.count < total ? `of ${plural(total, 'eval')} ready to run` : `${stats.count === 1 ? 'eval' : 'evals'} ready to run`}</span>
      </div>
    )
  }
  const facts = [
    stats.passed ? <span key="p" className="text-success">{stats.passed} passed</span> : null,
    stats.failed ? <span key="f" className="text-danger">{stats.failed} failed</span> : null,
    <span key="e" id="stats-errors" className={stats.errors ? 'text-danger' : undefined}>{plural(stats.errors, 'error')}</span>,
    <span key="n">{evals}</span>,
    stats.avgLatency ? <span key="l">{stats.avgLatency.toFixed(2)}s avg</span> : null,
    trials && trials.k > 1 ? <span key="k" id="stats-pass-at-k" title={`Evals where at least one of ${trials.k} trials passed`}>pass@{trials.k} {pct(trials.passAtK)}</span> : null,
    trials && trials.k > 1 ? <span key="a" id="stats-pass-all-k" title={`Evals where all ${trials.k} trials passed`}>pass^{trials.k} {pct(trials.passAllK)}</span> : null,
  ].filter(Boolean)
  return (
    <div className="min-w-[260px] flex-1">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-2.5">
          {stats.rate != null ? (
            <span id="pass-rate" className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-fg">{pct(stats.rate)}</span>
          ) : (
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-fg">{stats.finished}</span>
          )}
          <span className="text-sm text-fg-muted">{stats.rate != null ? 'pass rate' : 'scored'}</span>
          {delta ? (
            <button
              id="pass-rate-delta"
              className={`btn btn-ghost btn-xs tabular-nums ${delta.points > 0 ? '!text-success' : delta.points < 0 ? '!text-danger' : ''}`}
              title={`vs ${delta.previous}. Click to compare`}
              onClick={delta.onCompare}
            >
              {delta.points > 0 ? '▲' : delta.points < 0 ? '▼' : '±'} {Math.abs(delta.points)} pts
            </button>
          ) : null}
        </div>
        {trend && trend.length > 1 ? <Trend points={trend} /> : null}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div id="outcome-bar" className="flex h-1.5 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full bg-surface-muted">
          {([
            [stats.passed, 'bg-success'],
            [stats.failed, 'bg-danger'],
            [stats.errors, 'bg-danger opacity-50'],
            [stats.finished - stats.passed - stats.failed - stats.errors, 'bg-fg-muted opacity-40'],
          ] as const).map(([n, tone]) => (n ? <div key={tone} className={`${tone} rounded-full transition-[width] duration-500`} style={{ width: `${(n / stats.count) * 100}%` }} /> : null))}
        </div>
        {progress.running ? <span id="run-progress" className="font-mono text-xs tabular-nums text-fg-muted">{progress.completed}/{progress.total}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm tabular-nums text-fg-secondary">
        {facts.map((fact, i) => <span key={i} className="flex items-center gap-2">{i ? <span aria-hidden="true" className="text-line-strong">·</span> : null}{fact}</span>)}
      </div>
    </div>
  )
}

function ComparisonSummary({ comparison, sessionRuns }: { comparison: Comparison; sessionRuns: SessionRun[] }) {
  const [adding, setAdding] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const available = sessionRuns.filter((r) => !comparison.runs.some((c) => c.runId === r.run_id))
  const chips = comparison.runs.flatMap((run) => comparison.stats[run.runId].chips)
  const keys = extraChips([...new Map(chips.map((c) => [c.key, c])).values()]).map((c) => c.key)
  // Each column: a sortable number per run (higher is better unless `lower`) and its text.
  const columns = [
    { key: 'Pass rate', lower: false, cell: (s: SubsetStats) => (s.rate == null ? null : { n: s.rate, text: pct(s.rate) }) },
    ...keys.map((key) => ({ key, lower: false, cell: (s: SubsetStats) => { const c = s.chips.find((chip) => chip.key === key); return c ? { n: chipStats(c).pct, text: chipText(c) } : null } })),
    { key: 'Latency', lower: true, cell: (s: SubsetStats) => (s.avgLatency ? { n: s.avgLatency, text: `${s.avgLatency.toFixed(2)}s` } : null) },
  ]
  const best = columns.map((col) => {
    const values = comparison.runs.map((run) => col.cell(comparison.stats[run.runId])?.n).filter((n): n is number => n != null)
    return new Set(values).size > 1 ? (col.lower ? Math.min(...values) : Math.max(...values)) : null
  })
  const th = 'px-3 py-2 text-right text-xs font-medium text-fg-muted'
  const baseRate = comparison.stats[comparison.runs[0].runId].rate
  return (
    <div className="overflow-x-auto p-1">
      <table id="comparison-summary" className="text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className={`${th} min-w-[200px] !text-left`}>Run</th>
            {columns.map((col) => <th key={col.key} className={`${th} min-w-[96px] max-w-[160px] truncate`} title={col.key}>{col.key}</th>)}
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {comparison.runs.map((run, i) => {
            const stats = comparison.stats[run.runId]
            const change = i && stats.rate != null && baseRate != null ? Math.round(stats.rate * 100) - Math.round(baseRate * 100) : null
            return (
              <tr key={run.runId} className="comparison-run border-b border-line-subtle last:border-0">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: run.color }} />
                    <span className="max-w-[240px] truncate font-medium text-fg">{run.runName}</span>
                    <span className="text-xs tabular-nums text-fg-muted">{stats.count}</span>
                  </span>
                </td>
                {columns.map((col, c) => {
                  const cell = col.cell(stats)
                  return (
                    <td key={col.key} className={`px-3 py-2 text-right tabular-nums ${cell && cell.n === best[c] ? 'font-semibold text-fg' : 'text-fg-secondary'}`}>
                      {c === 0 && cell ? (
                        <span className="flex items-center justify-end gap-2">
                          {change ? <span className={`text-xs font-medium ${change > 0 ? 'text-success' : 'text-danger'}`}>{change > 0 ? '+' : '−'}{Math.abs(change)}</span> : null}
                          <span className="summary-bar w-12"><div style={{ width: `${cell.n * 100}%`, background: run.color }} /></span>
                          {cell.text}
                        </span>
                      ) : cell?.text ?? '—'}
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-right">
                  <span className="inline-flex items-center">
                    <button className="move-comparison btn btn-ghost btn-xs btn-icon disabled:invisible" data-run-id={run.runId} data-direction="up" disabled={i === 0} onClick={() => comparison.onMove(run.runId, -1)} title="Move up" aria-label="Move up"><Icon name="chevron-up" className="h-3.5 w-3.5" /></button>
                    <button className="move-comparison btn btn-ghost btn-xs btn-icon disabled:invisible" data-run-id={run.runId} data-direction="down" disabled={i === comparison.runs.length - 1} onClick={() => comparison.onMove(run.runId, 1)} title="Move down" aria-label="Move down"><Icon name="chevron-down" className="h-3.5 w-3.5" /></button>
                    <button className="remove-comparison btn btn-ghost btn-xs btn-icon disabled:invisible" disabled={i === 0} onClick={() => comparison.onRemove(run.runId)} title="Remove from comparison" aria-label="Remove from comparison"><Icon name="close" className="h-3 w-3" /></button>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {comparison.runs.length < 4 && available.length ? (
        <button ref={anchor} id="add-more-compare" className="btn btn-ghost btn-sm mt-1 !text-accent" aria-haspopup="menu" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          <Icon name="plus" className="h-3 w-3" />Add run
        </button>
      ) : null}
      <RunsMenu anchor={anchor} open={adding} onClose={() => setAdding(false)} runs={available} onPick={(run) => comparison.onAdd(run.run_id)} />
    </div>
  )
}

/** How the run did at a glance: pass rate, counts and an outcome bar, plus each score key when there is more than one; in comparison mode, a table of runs. */
export function StatsPanel(props: Props) {
  return (
    <section id="stats-expanded" aria-label="Summary" className={props.comparison ? 'rounded-lg border border-line' : 'pb-1 pt-1'}>
      {props.comparison ? (
        <ComparisonSummary comparison={props.comparison} sessionRuns={props.sessionRuns} />
      ) : (
        <div className="flex flex-wrap items-start gap-x-16 gap-y-5">
          <Headline {...props} />
          {extraChips(props.stats.chips).length ? <Metrics chips={props.stats.chips} /> : null}
        </div>
      )}
    </section>
  )
}
