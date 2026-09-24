import { useRef, useState } from 'react'
import type { ComparisonRun, ScoreChip, SessionRun } from '../../types'
import { CopyableText } from '../../components/CopyableText'
import { FloatingMenu } from '../../components/FloatingMenu'
import { Icon } from '../../components/Icon'
import { formatRunTimestamp } from '../../lib/format'
import { barTone, chipStats, type StatsSummary, type SubsetStats } from '../../lib/stats'
import { RunPicker } from './RunPicker'

export type Comparison = {
  runs: ComparisonRun[]
  stats: Record<string, SubsetStats>
  onMove: (runId: string, direction: -1 | 1) => void
  onRemove: (runId: string) => void
  onAdd: (runId: string) => void
}

type Props = {
  stats: StatsSummary
  sessionName?: string | null
  runName?: string | null
  runId: string
  chips: ScoreChip[]
  filteredCount: number | null
  sessionRuns: SessionRun[]
  onRename: (name: string) => void
  onRenameRun: (runId: string, name: string) => void
  onSelectRun: (runId: string) => void
  onNewRun: () => void
  onCompare: (runId: string) => void
  comparison?: Comparison
}

function RunsMenu({ anchor, open, onClose, runs, onPick }: {
  anchor: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  runs: SessionRun[]
  onPick: (run: SessionRun) => void
}) {
  return (
    <FloatingMenu anchorRef={anchor} open={open} onClose={onClose}>
      {runs.length === 0 ? <div className="p-2 text-[10px] text-theme-text-muted">No other runs available</div> : runs.map((run) => (
        <button key={run.run_id} className="compare-option w-full px-3 py-2 text-left text-xs text-theme-text-secondary" onClick={() => { onPick(run); onClose() }}>
          {run.run_name || run.run_id} <span className="text-theme-text-muted">({formatRunTimestamp(run.timestamp)})</span>
        </button>
      ))}
    </FloatingMenu>
  )
}

function RunInfo({ sessionName, runName, runId, sessionRuns, onRename, onRenameRun, onSelectRun, onNewRun, onCompare }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<'runs' | 'compare' | null>(null)
  const runsAnchor = useRef<HTMLButtonElement | null>(null)
  const compareAnchor = useRef<HTMLButtonElement | null>(null)
  const current = sessionRuns.find((r) => r.run_id === runId)
  const others = sessionRuns.filter((r) => r.run_id !== runId)
  const save = () => {
    if (draft.trim() && draft.trim() !== runName) onRename(draft.trim())
    setEditing(false)
  }
  return (
    <div className="stats-left-header">
      {sessionName ? (
        <div className="stats-info-row">
          <span className="stats-info-label">session</span>
          <CopyableText text={sessionName} className="stats-session copyable cursor-pointer hover:text-theme-text-secondary" />
        </div>
      ) : null}
      {runName ? (
        <>
          <div className="stats-info-row group">
            <span className="stats-info-label">run</span>
            <div className="stats-run-row-main">
              {others.length ? (
                <button ref={runsAnchor} id="run-dropdown-expanded" className="stats-run-dropdown run-dropdown-btn" data-run-id={runId} onClick={() => setMenu(menu === 'runs' ? null : 'runs')}>
                  {current ? `${current.run_name} (${formatRunTimestamp(current.timestamp)})` : runName} <span className="dropdown-arrow">v</span>
                </button>
              ) : editing ? (
                <input
                  className="w-28 rounded border border-theme-border bg-theme-bg-elevated px-1 font-mono text-sm text-theme-text outline-none focus:border-blue-500"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                  onBlur={() => setEditing(false)}
                  autoFocus
                />
              ) : (
                <>
                  <CopyableText text={runName} className="stats-run copyable cursor-pointer hover:text-theme-text-secondary" />
                  <button className="edit-run-btn-expanded ml-1 text-theme-text-muted transition hover:text-theme-text-secondary" title="Rename run" onClick={() => { setDraft(runName); setEditing(true) }}>
                    <Icon name="pencil" className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="stats-info-row stats-run-actions-row">
            <div className="stats-run-actions">
              <button id="new-run-btn-expanded" className="stats-run-action-btn" title="Create new run" aria-label="Create new run" onClick={onNewRun}>
                <Icon name="plus" /><span>New run</span>
              </button>
              <button
                ref={compareAnchor}
                id="add-compare-btn"
                className="stats-run-action-btn"
                title={others.length ? 'Compare runs' : 'Need at least 2 runs to compare'}
                aria-label="Compare runs"
                onClick={() => setMenu(menu === 'compare' ? null : 'compare')}
                disabled={!others.length}
              >
                <Icon name="compare" /><span>Compare</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
      {menu === 'runs' ? <RunPicker anchorRef={runsAnchor} onClose={() => setMenu(null)} sessionRuns={sessionRuns} activeRunId={runId} onSelectRun={onSelectRun} onRenameRun={onRenameRun} /> : null}
      <RunsMenu anchor={compareAnchor} open={menu === 'compare'} onClose={() => setMenu(null)} runs={others} onPick={(run) => onCompare(run.run_id)} />
    </div>
  )
}

function ComparisonInfo({ sessionName, sessionRuns, comparison }: { sessionName?: string | null; sessionRuns: SessionRun[]; comparison: Comparison }) {
  const [adding, setAdding] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const available = sessionRuns.filter((r) => !comparison.runs.some((c) => c.runId === r.run_id))
  return (
    <div className="stats-left-header">
      {sessionName ? (
        <div className="stats-info-row">
          <span className="stats-info-label">session</span>
          <CopyableText text={sessionName} className="stats-session copyable cursor-pointer hover:text-theme-text-secondary" />
        </div>
      ) : null}
      <div className="stats-info-row"><span className="stats-info-label">comparing</span></div>
      <div className="comparison-chips flex flex-wrap items-center gap-2">
        {comparison.runs.map((run, i) => (
          <span key={run.runId} className="comparison-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: `${run.color}20`, border: `1px solid ${run.color}`, color: run.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: run.color }} />
            <span className="comparison-chip-name max-w-[120px] truncate">{run.runName}</span>
            <span className="text-theme-text-muted">({comparison.stats[run.runId]?.count ?? 0})</span>
            {i > 0 ? <button className="move-comparison ml-1 text-[12px] leading-none hover:text-white" data-run-id={run.runId} data-direction="up" onClick={() => comparison.onMove(run.runId, -1)} title="Move up">&uarr;</button> : null}
            {i < comparison.runs.length - 1 ? <button className="move-comparison text-[12px] leading-none hover:text-white" data-run-id={run.runId} data-direction="down" onClick={() => comparison.onMove(run.runId, 1)} title="Move down">&darr;</button> : null}
            {i > 0 ? <button className="remove-comparison ml-1 text-[14px] leading-none hover:text-white" onClick={() => comparison.onRemove(run.runId)} title="Remove from comparison">&times;</button> : null}
          </span>
        ))}
        {comparison.runs.length < 4 && available.length ? (
          <button ref={anchor} id="add-more-compare" className="rounded-full bg-theme-bg-elevated px-2 py-1 text-[10px] text-theme-text-muted hover:bg-theme-btn-bg-hover hover:text-theme-text-secondary" title="Add another run to compare" onClick={() => setAdding(!adding)}>+</button>
        ) : null}
      </div>
      <RunsMenu anchor={anchor} open={adding} onClose={() => setAdding(false)} runs={available} onPick={(run) => comparison.onAdd(run.run_id)} />
    </div>
  )
}

function Metrics({ stats, filteredCount }: { stats: StatsSummary; filteredCount: number | null }) {
  const trials = stats.trials ?? 0
  return (
    <>
      <div className="stats-metric-row-main">
        <div className="stats-metric">
          <span className="stats-metric-value">
            {filteredCount != null ? <>{filteredCount}<span className="stats-metric-divisor">/{stats.total}</span></> : stats.total}
          </span>
          <span className="stats-metric-label">tests</span>
        </div>
        {stats.isRunning ? (
          <div className="stats-progress">
            <div className="stats-progress-bar"><div className="stats-progress-fill" style={{ width: `${stats.pctDone}%` }} /></div>
            <span className="stats-progress-text text-emerald-400">{stats.pctDone}% ({stats.progressCompleted}/{stats.progressTotal})</span>
          </div>
        ) : null}
      </div>
      <div className="stats-metric-row">
        <div id="stats-errors" className="stats-metric stats-metric-sm stats-errors">
          <span className="stats-metric-value text-accent-error">{stats.totalErrors}</span>
          <span className="stats-metric-label">errors</span>
        </div>
        {trials > 1 && stats.passAtK != null ? (
          <>
            <div id="stats-pass-at-k" className="stats-metric stats-metric-sm" title={`Evals where at least one of ${trials} trials passed`}>
              <span className="stats-metric-value">{Math.round(stats.passAtK * 100)}%</span>
              <span className="stats-metric-label">pass@{trials}</span>
            </div>
            <div id="stats-pass-all-k" className="stats-metric stats-metric-sm" title={`Evals where all ${trials} trials passed`}>
              <span className="stats-metric-value">{Math.round((stats.passAllK ?? 0) * 100)}%</span>
              <span className="stats-metric-label">pass^{trials}</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

type ChartColumn = { key: string; label: string; bars: { key: string; pct: number; color?: string; text?: string }[]; value?: { pct: number; detail: string } }

function chartColumns(chips: ScoreChip[], comparison?: Comparison): ChartColumn[] {
  if (!comparison) {
    return chips.map((chip) => {
      const { pct, value } = chipStats(chip)
      return { key: chip.key, label: chip.key, bars: [{ key: chip.key, pct }], value: { pct, detail: value } }
    })
  }
  const keys = [...new Set(Object.values(comparison.stats).flatMap((s) => s.chips.map((c) => c.key)))]
  const maxLatency = Math.max(0, ...Object.values(comparison.stats).map((s) => s.avgLatency))
  const columns = keys.map((key) => ({
    key,
    label: key,
    bars: comparison.runs.map((run) => {
      const chip = comparison.stats[run.runId]?.chips.find((c) => c.key === key)
      const pct = chip ? chipStats(chip).pct : 0
      return { key: run.runId, pct, color: run.color, text: chip ? `${pct}%` : '--' }
    }),
  }))
  columns.push({
    key: '_latency',
    label: 'Latency',
    bars: comparison.runs.map((run) => {
      const latency = comparison.stats[run.runId]?.avgLatency ?? 0
      return { key: run.runId, pct: maxLatency ? (latency / maxLatency) * 100 : 0, color: run.color, text: latency ? `${latency.toFixed(2)}s` : '--' }
    }),
  })
  return columns
}

function ScoreChart({ columns, comparison }: { columns: ChartColumn[]; comparison: boolean }) {
  return (
    <div className="stats-right">
      <div className="stats-chart-area">
        {[0, 25, 50, 75].map((top) => <div key={top} className="stats-gridline" style={{ top: `${top}%` }} />)}
        <div className="stats-chart-bars">
          {columns.map((col) => (
            <div key={col.key} className={comparison ? 'stats-bar-group' : 'stats-bar-col'}>
              {col.bars.map((bar) => comparison ? (
                <div key={bar.key} className="comparison-bar-wrapper">
                  <span className="comparison-bar-label" style={{ color: bar.color }}>{bar.text}</span>
                  <div className="comparison-bar" style={{ background: bar.color, height: `${bar.pct}%` }} />
                </div>
              ) : (
                <div key={bar.key} className={`stats-chart-fill ${barTone(bar.pct)}`} style={{ height: `${bar.pct}%` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="stats-xaxis">
        <div className="stats-chart-labels">{columns.map((col) => <span key={col.key} className="stats-chart-label">{col.label}</span>)}</div>
        <div className="stats-chart-values">
          {columns.map((col) => (
            <span key={col.key} className={`stats-chart-value${comparison ? ' comparison-value' : ''}`}>
              {col.value ? <><span className="stats-pct">{col.value.pct}%</span><span className="stats-ratio">{col.value.detail}</span></> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Run details and the score chart above the results table. */
export function StatsPanel(props: Props) {
  const { comparison } = props
  // Re-keying the chart replays its entrance animation when the run or comparison changes.
  const view = `${props.runId}:${comparison?.runs.map((r) => r.runId).join(',') ?? ''}`
  return (
    <div id="stats-expanded" className={`stats-expanded${comparison ? ' comparison-mode' : ''}`}>
      <div className="stats-layout">
        <div className="stats-left">
          <div className="stats-left-content">
            {comparison ? <ComparisonInfo sessionName={props.sessionName} sessionRuns={props.sessionRuns} comparison={comparison} /> : <RunInfo {...props} />}
            {comparison ? null : <Metrics stats={props.stats} filteredCount={props.filteredCount} />}
          </div>
          <div className="stats-yaxis">{['100%', '75%', '50%', '25%', '0%'].map((l) => <span key={l} className="stats-axis-label">{l}</span>)}</div>
        </div>
        <ScoreChart key={view} columns={chartColumns(props.chips, comparison)} comparison={!!comparison} />
      </div>
    </div>
  )
}
