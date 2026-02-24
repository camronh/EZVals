import type { ReactNode, RefObject } from 'react'
import type { FilteredStats, NormalizedComparisonRun, RunSummary, ScoreChip, SessionRun, StatsSummary } from '../../types'
import CopyableText from './CopyableText'
import { chipStats, getBarColor } from '../utils'

type StatsExpandedProps = {
  stats: StatsSummary
  hasFilters: boolean
  displayFilteredCount: number | null
  displayChips: ScoreChip[]
  isComparisonMode: boolean
  normalizedComparisonRuns: NormalizedComparisonRun[]
  comparisonData: Record<string, RunSummary>
  comparisonDisplayStats: Record<string, FilteredStats>
  sessionRuns: SessionRun[]
  currentRunLabel: string
  editingRunName: boolean
  runNameDraft: string
  setRunNameDraft: (value: string) => void
  setEditingRunName: (value: boolean) => void
  onRunNameSave: () => void
  onCreateNewRun: () => void
  onRunDropdownToggle: () => void
  onAddCompareToggle: () => void
  onAddMoreCompareToggle: () => void
  onRemoveComparison: (runId: string) => void
  onMoveComparison: (runId: string, direction: 'up' | 'down') => void
  runDropdownExpandedRef: RefObject<HTMLButtonElement>
  compareDropdownAnchorRef: RefObject<HTMLButtonElement>
  addCompareAnchorRef: RefObject<HTMLButtonElement>
  animateStats: boolean
}

export default function StatsExpanded({
  stats,
  hasFilters,
  displayFilteredCount,
  displayChips,
  isComparisonMode,
  normalizedComparisonRuns,
  comparisonData,
  comparisonDisplayStats,
  sessionRuns,
  currentRunLabel,
  editingRunName,
  runNameDraft,
  setRunNameDraft,
  setEditingRunName,
  onRunNameSave,
  onCreateNewRun,
  onRunDropdownToggle,
  onAddCompareToggle,
  onAddMoreCompareToggle,
  onRemoveComparison,
  onMoveComparison,
  runDropdownExpandedRef,
  compareDropdownAnchorRef,
  addCompareAnchorRef,
  animateStats,
}: StatsExpandedProps) {
  const inComparison = isComparisonMode
  const chips = inComparison ? [] : displayChips
  const currentInSessionRuns = sessionRuns.some((run) => run.run_id === stats.runId)
  const canSwitchRuns = sessionRuns.length > 0 && (sessionRuns.length + (currentInSessionRuns ? 0 : 1)) > 1
  const hasOtherSessionRuns = sessionRuns.some((run) => run.run_id !== stats.runId)

  let bars: ReactNode[] = []
  let labels: ReactNode[] = []
  let values: ReactNode[] = []

  const headerContent = (() => {
    if (inComparison) {
      return (
        <div className="stats-left-header">
          {stats.sessionName ? (
            <div className="stats-info-row">
              <span className="stats-info-label">session</span>
              <CopyableText text={stats.sessionName ?? ''} className="stats-session copyable cursor-pointer hover:text-theme-text-secondary" />
            </div>
          ) : null}
          <div className="stats-info-row"><span className="stats-info-label">comparing</span></div>
          <div className="comparison-chips flex flex-wrap gap-2 items-center">
            {normalizedComparisonRuns.map((run, idx) => {
              const runData = comparisonData[run.runId]
              const testCount = comparisonDisplayStats[run.runId]?.filtered ?? runData?.results?.length ?? 0
              return (
                <span
                  key={run.runId}
                  className="comparison-chip rounded-full px-3 py-1 text-[11px] font-medium flex items-center gap-1.5"
                  style={{ background: `${run.color}20`, border: `1px solid ${run.color}`, color: run.color }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: run.color }}></span>
                  <span className="comparison-chip-name truncate max-w-[120px]">{run.runName}</span>
                  <span className="text-theme-text-muted">({testCount})</span>
                  {idx > 0 ? (
                    <button
                      className="move-comparison ml-1 hover:text-white text-[12px] leading-none"
                      data-run-id={run.runId}
                      data-direction="up"
                      onClick={() => onMoveComparison(run.runId, 'up')}
                      title="Move up"
                    >
                      <span aria-hidden="true">&uarr;</span>
                    </button>
                  ) : null}
                  {idx < normalizedComparisonRuns.length - 1 ? (
                    <button
                      className="move-comparison hover:text-white text-[12px] leading-none"
                      data-run-id={run.runId}
                      data-direction="down"
                      onClick={() => onMoveComparison(run.runId, 'down')}
                      title="Move down"
                    >
                      <span aria-hidden="true">&darr;</span>
                    </button>
                  ) : null}
                  {idx !== 0 ? (
                    <button
                      className="remove-comparison ml-1 hover:text-white text-[14px] leading-none"
                      onClick={() => onRemoveComparison(run.runId)}
                      title="Remove from comparison"
                    >
                      &times;
                    </button>
                  ) : null}
                </span>
              )
            })}
            {normalizedComparisonRuns.length < 4 && sessionRuns.some((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id)) ? (
              <button
                ref={addCompareAnchorRef}
                id="add-more-compare"
                className="rounded-full px-2 py-1 text-[10px] bg-theme-bg-elevated text-theme-text-muted hover:bg-theme-btn-bg-hover hover:text-theme-text-secondary"
                title="Add another run to compare"
                onClick={onAddMoreCompareToggle}
              >
                +
              </button>
            ) : null}
          </div>
        </div>
      )
    }

    if (stats.sessionName || stats.runName) {
      return (
        <div className="stats-left-header">
          {stats.sessionName ? (
            <div className="stats-info-row">
              <span className="stats-info-label">session</span>
              <CopyableText text={stats.sessionName ?? ''} className="stats-session copyable cursor-pointer hover:text-theme-text-secondary" />
            </div>
          ) : null}
          {stats.runName ? (
            <div className="stats-info-row group">
              <span className="stats-info-label">run</span>
              <div className="stats-run-row-main">
                {canSwitchRuns ? (
                  <button
                    ref={runDropdownExpandedRef}
                    id="run-dropdown-expanded"
                    className="stats-run-dropdown run-dropdown-btn"
                    data-run-id={stats.runId}
                    onClick={onRunDropdownToggle}
                  >
                    {currentRunLabel} <span className="dropdown-arrow">v</span>
                  </button>
                ) : editingRunName ? (
                  <input
                    className="font-mono text-sm bg-theme-bg-elevated border border-theme-border rounded px-1 w-28 text-theme-text outline-none focus:border-blue-500"
                    value={runNameDraft}
                    onChange={(e) => setRunNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onRunNameSave(); if (e.key === 'Escape') setEditingRunName(false) }}
                    onBlur={() => setEditingRunName(false)}
                    autoFocus
                  />
                ) : (
                  <>
                    <CopyableText text={stats.runName ?? ''} className="stats-run copyable cursor-pointer hover:text-theme-text-secondary" />
                    <button
                      className="edit-run-btn-expanded ml-1 text-theme-text-muted transition hover:text-theme-text-secondary"
                      title="Rename run"
                      onClick={() => {
                        setEditingRunName(true)
                        setRunNameDraft(stats.runName || '')
                      }}
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
          {stats.runName ? (
            <div className="stats-info-row stats-run-actions-row">
              <div className="stats-run-actions">
                <button
                  id="new-run-btn-expanded"
                  className="stats-run-action-btn"
                  title="Create new run"
                  aria-label="Create new run"
                  onClick={onCreateNewRun}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-plus"></use>
                  </svg>
                  <span>New run</span>
                </button>
                <button
                  ref={compareDropdownAnchorRef}
                  id="add-compare-btn"
                  className="stats-run-action-btn"
                  title={hasOtherSessionRuns ? 'Compare runs' : 'Need at least 2 runs to compare'}
                  aria-label="Compare runs"
                  onClick={onAddCompareToggle}
                  disabled={!hasOtherSessionRuns}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-compare"></use>
                  </svg>
                  <span>Compare</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )
    }
    return null
  })()

  const metricsHtml = !inComparison ? (
    <>
      <div className="stats-metric-row-main">
        <div className="stats-metric">
          <span className="stats-metric-value">
            {hasFilters ? (
              <>
                {displayFilteredCount ?? stats.total}
                <span className="stats-metric-divisor">/{stats.total}</span>
              </>
            ) : (
              stats.total
            )}
          </span>
          <span className="stats-metric-label">tests</span>
        </div>
        {stats.isRunning ? (
          <div className="stats-progress">
            <div className="stats-progress-bar"><div className="stats-progress-fill" style={{ width: `${stats.pctDone}%` }}></div></div>
            <span className="stats-progress-text text-emerald-400">{stats.pctDone}% ({stats.progressCompleted}/{stats.progressTotal})</span>
          </div>
        ) : null}
      </div>
      <div className="stats-metric-row">
        <div id="stats-errors" className="stats-metric stats-metric-sm stats-errors">
          <span className="stats-metric-value text-accent-error">{stats.totalErrors}</span>
          <span className="stats-metric-label">errors</span>
        </div>
      </div>
    </>
  ) : null

  if (inComparison) {
    const allKeys = new Set<string>()
    Object.values(comparisonDisplayStats).forEach((runStats) => {
      ;(runStats?.chips || []).forEach((chip) => allKeys.add(chip.key))
    })
    allKeys.add('_latency')
    const keys = Array.from(allKeys)
    let maxLatency = 0
    Object.values(comparisonDisplayStats).forEach((runStats) => {
      const lat = runStats?.avgLatency || 0
      if (lat > maxLatency) maxLatency = lat
    })

    keys.forEach((key, keyIdx) => {
      const groupBars = normalizedComparisonRuns.map((run) => {
        const runStats = comparisonDisplayStats[run.runId]
        let pct = 0
        let displayVal = '--'
        if (key === '_latency') {
          const lat = runStats?.avgLatency || 0
          pct = maxLatency > 0 ? (lat / maxLatency) * 100 : 0
          displayVal = lat > 0 ? `${lat.toFixed(2)}s` : '--'
        } else {
          const chip = (runStats?.chips || []).find((c) => c.key === key)
          if (chip) {
            const statsChip = chipStats(chip, 2)
            pct = statsChip.pct
            displayVal = `${statsChip.pct}%`
          }
        }
        return (
          <div key={`${run.runId}-${key}`} className="comparison-bar-wrapper">
            <span className="comparison-bar-label" style={{ color: run.color }}>{displayVal}</span>
            <div className="comparison-bar" style={{ background: run.color, height: animateStats ? `${pct}%` : '0%' }} data-target-height={pct}></div>
          </div>
        )
      })
      bars.push(
        <div key={`group-${key}`} className="stats-bar-group" style={{ opacity: animateStats ? 1 : 0, transform: animateStats ? 'translateY(0)' : 'translateY(20px)' }}>
          {groupBars}
        </div>
      )
      labels.push(
        <span key={`label-${key}`} className="stats-chart-label" style={{ opacity: animateStats ? 1 : 0 }}>
          {key === '_latency' ? 'Latency' : key}
        </span>
      )
      values.push(<span key={`value-${keyIdx}`} className="stats-chart-value comparison-value" style={{ opacity: animateStats ? 1 : 0 }}></span>)
    })
  } else {
    bars = chips.map((chip, i) => {
      const { pct } = chipStats(chip, 2)
      return (
        <div key={`${chip.key}-${i}`} className="stats-bar-col" style={{ opacity: animateStats ? 1 : 0, transform: animateStats ? 'translateY(0)' : 'translateY(20px)' }}>
          <div className={`stats-chart-fill ${getBarColor(pct)}`} data-target-height={pct} style={{ height: animateStats ? `${pct}%` : '0%' }}></div>
        </div>
      )
    })
    labels = chips.map((chip) => (
      <span key={`label-${chip.key}`} className="stats-chart-label" style={{ opacity: animateStats ? 1 : 0 }}>{chip.key}</span>
    ))
    values = chips.map((chip) => {
      const { pct, value } = chipStats(chip, 2)
      return (
        <span key={`value-${chip.key}`} className="stats-chart-value" style={{ opacity: animateStats ? 1 : 0 }}>
          <span className="stats-pct">{pct}%</span>
          <span className="stats-ratio">{value}</span>
        </span>
      )
    })
  }

  return (
    <div id="stats-expanded" className={`stats-expanded${inComparison ? ' comparison-mode' : ''}`}>
      <div className="stats-layout">
        <div className="stats-left">
          <div className="stats-left-content">
            {headerContent}
            {metricsHtml}
          </div>
          <div className="stats-yaxis">
            <span className="stats-axis-label">100%</span>
            <span className="stats-axis-label">75%</span>
            <span className="stats-axis-label">50%</span>
            <span className="stats-axis-label">25%</span>
            <span className="stats-axis-label">0%</span>
          </div>
        </div>
        <div className="stats-right">
          <div className="stats-chart-area">
            <div className="stats-gridline" style={{ top: '0%' }}></div>
            <div className="stats-gridline" style={{ top: '25%' }}></div>
            <div className="stats-gridline" style={{ top: '50%' }}></div>
            <div className="stats-gridline" style={{ top: '75%' }}></div>
            <div className="stats-chart-bars">{bars}</div>
          </div>
          <div className="stats-xaxis">
            <div className="stats-chart-labels">{labels}</div>
            <div className="stats-chart-values">{values}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
