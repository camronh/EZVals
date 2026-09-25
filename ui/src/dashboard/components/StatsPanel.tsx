import { useRef, useState } from 'react'
import type { ComparisonRun, ScoreChip, SessionRun } from '../../types'
import { Icon } from '../../components/Icon'
import { barTone, chipStats, type SubsetStats } from '../../lib/stats'
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
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const chipText = (chip: ScoreChip) => (chip.type === 'ratio' ? `${chipStats(chip).pct}%` : chipStats(chip).value)

function Bar({ value, tone }: { value: number; tone: string }) {
  return <div className={`summary-bar ${tone}`}><div style={{ width: `${Math.max(value, 0)}%` }} /></div>
}

function ScoreBars({ chips }: { chips: ScoreChip[] }) {
  if (!chips.length) return null
  return (
    <div id="score-bars" className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-center gap-x-8 gap-y-2.5">
      {chips.map((chip) => {
        const { pct: value, value: detail } = chipStats(chip)
        return (
          <div key={chip.key} className="score-bar grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
            <span className="truncate text-[13px] text-theme-text-secondary" title={chip.key}>{chip.key}</span>
            <span className="font-mono text-[12px] tabular-nums text-theme-text">
              {chip.type === 'ratio' ? <>{value}%<span className="ml-1.5 text-theme-text-muted">{detail}</span></> : <>{detail}<span className="ml-1.5 text-theme-text-muted">avg</span></>}
            </span>
            <div className="col-span-2"><Bar value={value} tone={barTone(value)} /></div>
          </div>
        )
      })}
    </div>
  )
}

function Headline({ stats, total, progress, trials, delta }: Props) {
  const evals = stats.count < total ? `${stats.count} of ${plural(total, 'eval')}` : plural(total, 'eval')
  if (!stats.finished && !progress.running && stats.notRun === stats.count) {
    return (
      <div>
        <div className="text-2xl font-semibold tracking-tight text-theme-text">{evals}</div>
        <div className="mt-1 text-[13px] text-theme-text-muted">Not run yet</div>
      </div>
    )
  }
  const facts = [
    stats.passed ? <span key="p" className="text-accent-success">{stats.passed} passed</span> : null,
    stats.failed ? <span key="f" className="text-accent-error">{stats.failed} failed</span> : null,
    <span key="e" id="stats-errors" className={stats.errors ? 'text-accent-error' : undefined}>{plural(stats.errors, 'error')}</span>,
    <span key="n">{evals}</span>,
    stats.avgLatency ? <span key="l" className="font-mono">{stats.avgLatency.toFixed(2)}s avg</span> : null,
    trials && trials.k > 1 ? <span key="k" id="stats-pass-at-k" title={`Evals where at least one of ${trials.k} trials passed`}>pass@{trials.k} {pct(trials.passAtK)}</span> : null,
    trials && trials.k > 1 ? <span key="a" id="stats-pass-all-k" title={`Evals where all ${trials.k} trials passed`}>pass^{trials.k} {pct(trials.passAllK)}</span> : null,
  ].filter(Boolean)
  return (
    <div className="min-w-[220px]">
      <div className="flex items-baseline gap-2.5">
        {stats.rate != null ? (
          <span id="pass-rate" className="text-3xl font-semibold tabular-nums tracking-tight text-theme-text">{pct(stats.rate)}</span>
        ) : (
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-theme-text">{stats.finished}</span>
        )}
        <span className="text-[13px] text-theme-text-muted">{stats.rate != null ? 'pass rate' : 'scored'}</span>
        {delta ? (
          <button
            id="pass-rate-delta"
            className={`rounded-md px-1.5 py-0.5 text-[12px] font-medium tabular-nums hover:bg-theme-bg-elevated ${delta.points > 0 ? 'text-accent-success' : delta.points < 0 ? 'text-accent-error' : 'text-theme-text-muted'}`}
            title={`vs ${delta.previous}. Click to compare`}
            onClick={delta.onCompare}
          >
            {delta.points > 0 ? '▲' : delta.points < 0 ? '▼' : '±'} {Math.abs(delta.points)} pts
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-theme-text-secondary">{facts}</div>
      {progress.running ? (
        <div id="run-progress" className="mt-3 flex items-center gap-2.5">
          <div className="summary-bar tone-progress w-40"><div style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} /></div>
          <span className="font-mono text-[12px] tabular-nums text-theme-text-muted">{progress.completed}/{progress.total}</span>
        </div>
      ) : null}
    </div>
  )
}

function ComparisonSummary({ comparison, sessionRuns }: { comparison: Comparison; sessionRuns: SessionRun[] }) {
  const [adding, setAdding] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const available = sessionRuns.filter((r) => !comparison.runs.some((c) => c.runId === r.run_id))
  const keys = [...new Set(comparison.runs.flatMap((run) => comparison.stats[run.runId].chips.map((c) => c.key)))]
  // Each column: a sortable number per run (higher is better unless `lower`) and its text.
  const columns = [
    { key: 'Pass rate', lower: false, cell: (s: SubsetStats) => (s.rate == null ? null : { n: s.rate, text: pct(s.rate) }) },
    ...keys.map((key) => ({ key, lower: false, cell: (s: SubsetStats) => { const c = s.chips.find((chip) => chip.key === key); return c ? { n: chipStats(c).pct, text: chipText(c) } : null } })),
    { key: 'Latency', lower: true, cell: (s: SubsetStats) => (s.avgLatency ? { n: s.avgLatency, text: `${s.avgLatency.toFixed(2)}s` } : null) },
  ]
  const best = columns.map((col) => {
    const values = comparison.runs.map((run) => col.cell(comparison.stats[run.runId])?.n).filter((n): n is number => n != null)
    return values.length > 1 ? (col.lower ? Math.min(...values) : Math.max(...values)) : null
  })
  const th = 'px-3 py-2 text-right text-[12px] font-medium text-theme-text-muted'
  return (
    <div className="overflow-x-auto">
      <table id="comparison-summary" className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-theme-border">
            <th className={`${th} !text-left`}>Run</th>
            {columns.map((col) => <th key={col.key} className={`${th} max-w-[140px] truncate`} title={col.key}>{col.key}</th>)}
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {comparison.runs.map((run, i) => (
            <tr key={run.runId} className="comparison-run border-b border-theme-border-subtle last:border-0">
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: run.color }} />
                  <span className="max-w-[240px] truncate font-medium text-theme-text">{run.runName}</span>
                  <span className="font-mono text-[12px] text-theme-text-muted">{comparison.stats[run.runId].count}</span>
                </span>
              </td>
              {columns.map((col, c) => {
                const cell = col.cell(comparison.stats[run.runId])
                return (
                  <td key={col.key} className={`px-3 py-2 text-right font-mono tabular-nums ${cell && cell.n === best[c] ? 'font-semibold text-theme-text' : 'text-theme-text-secondary'}`}>
                    {cell?.text ?? '—'}
                  </td>
                )
              })}
              <td className="px-2 py-1 text-right">
                <span className="inline-flex items-center text-theme-text-muted">
                  <button className="move-comparison flex h-6 w-6 items-center justify-center rounded hover:bg-theme-bg-elevated hover:text-theme-text disabled:invisible" data-run-id={run.runId} data-direction="up" disabled={i === 0} onClick={() => comparison.onMove(run.runId, -1)} title="Move up" aria-label="Move up"><Icon name="chevron-up" className="h-3.5 w-3.5" /></button>
                  <button className="move-comparison flex h-6 w-6 items-center justify-center rounded hover:bg-theme-bg-elevated hover:text-theme-text disabled:invisible" data-run-id={run.runId} data-direction="down" disabled={i === comparison.runs.length - 1} onClick={() => comparison.onMove(run.runId, 1)} title="Move down" aria-label="Move down"><Icon name="chevron-down" className="h-3.5 w-3.5" /></button>
                  <button className="remove-comparison flex h-6 w-6 items-center justify-center rounded hover:bg-theme-bg-elevated hover:text-theme-text disabled:invisible" disabled={i === 0} onClick={() => comparison.onRemove(run.runId)} title="Remove from comparison" aria-label="Remove from comparison"><Icon name="close" className="h-3 w-3" /></button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {comparison.runs.length < 4 && available.length ? (
        <button ref={anchor} id="add-more-compare" className="mt-1 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-accent-link hover:bg-theme-bg-elevated" onClick={() => setAdding(!adding)}>
          <Icon name="plus" className="h-3 w-3" />Add run
        </button>
      ) : null}
      <RunsMenu anchor={anchor} open={adding} onClose={() => setAdding(false)} runs={available} onPick={(run) => comparison.onAdd(run.run_id)} />
    </div>
  )
}

/** How the run did at a glance: pass rate, counts and one bar per score key; in comparison mode, a table of runs. */
export function StatsPanel(props: Props) {
  return (
    <section id="stats-expanded" className="rounded-lg border border-theme-border bg-theme-bg-secondary p-4">
      {props.comparison ? (
        <ComparisonSummary comparison={props.comparison} sessionRuns={props.sessionRuns} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <Headline {...props} />
          <ScoreBars chips={props.stats.chips} />
        </div>
      )}
    </section>
  )
}
