import type { ReactNode, RefObject } from 'react'
import type { NormalizedComparisonRun, RunSummary, ScoreChip, SessionRun, StatsSummary } from '../../types'
import CopyableText from './CopyableText'
import { chipStats, getBarColor } from '../utils'

type StatsExpandedProps = {
  stats: StatsSummary
  statsExpanded: boolean
  setStatsExpanded: (value: boolean) => void
  hasFilters: boolean
  displayFilteredCount: number | null
  displayChips: ScoreChip[]
  displayLatency: number
  isComparisonMode: boolean
  normalizedComparisonRuns: NormalizedComparisonRun[]
  comparisonData: Record<string, RunSummary>
  sessionRuns: SessionRun[]
  currentRunLabel: string
  editingRunName: boolean
  runNameDraft: string
  setRunNameDraft: (value: string) => void
  setEditingRunName: (value: boolean) => void
  onRunNameSave: () => void
  onRunDropdownToggle: () => void
  onAddCompareToggle: () => void
  onAddMoreCompareToggle: () => void
  onRemoveComparison: (runId: string) => void
  runDropdownExpandedRef: RefObject<HTMLButtonElement>
  compareDropdownAnchorRef: RefObject<HTMLButtonElement>
  addCompareAnchorRef: RefObject<HTMLButtonElement>
  animateStats: boolean
}

export default function StatsExpanded({
  stats,
  statsExpanded,
  setStatsExpanded,
  hasFilters,
  displayFilteredCount,
  displayChips,
  displayLatency,
  isComparisonMode,
  normalizedComparisonRuns,
  comparisonData,
  sessionRuns,
  currentRunLabel,
  editingRunName,
  runNameDraft,
  setRunNameDraft,
  setEditingRunName,
  onRunNameSave,
  onRunDropdownToggle,
  onAddCompareToggle,
  onAddMoreCompareToggle,
  onRemoveComparison,
  runDropdownExpandedRef,
  compareDropdownAnchorRef,
  addCompareAnchorRef,
  animateStats,
}: StatsExpandedProps) {
  const inComparison = isComparisonMode
  const chips = inComparison ? [] : displayChips

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
              <CopyableText text={stats.sessionName ?? ''} className="stats-session copyable cursor-pointer hover:text-zinc-300" />
            </div>
          ) : null}
          <div className="stats-info-row"><span className="stats-info-label">comparing</span></div>
          <div className="comparison-chips flex flex-wrap gap-2 items-center">
            {normalizedComparisonRuns.map((run, idx) => {
              const runData = comparisonData[run.runId]
              const testCount = runData?.results?.length || 0
              return (
                <span
                  key={run.runId}
                  className="comparison-chip rounded-full px-3 py-1 text-[11px] font-medium flex items-center gap-1.5"
                  style={{ background: `${run.color}20`, border: `1px solid ${run.color}`, color: run.color }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: run.color }}></span>
                  <span className="truncate max-w-[120px]">{run.runName}</span>
                  <span className="text-zinc-500">({testCount})</span>
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
                className="rounded-full px-2 py-1 text-[10px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
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
              <CopyableText text={stats.sessionName ?? ''} className="stats-session copyable cursor-pointer hover:text-zinc-300" />
            </div>
          ) : null}
          {stats.runName ? (
            <div className="stats-info-row group">
              <span className="stats-info-label">run</span>
              {editingRunName ? (
                <input
                  className="font-mono text-sm bg-zinc-800 border border-zinc-600 rounded px-1 w-28 text-white outline-none focus:border-zinc-500"
                  value={runNameDraft}
                  onChange={(e) => setRunNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onRunNameSave(); if (e.key === 'Escape') setEditingRunName(false) }}
                  onBlur={() => setEditingRunName(false)}
                  autoFocus
                />
              ) : sessionRuns.length > 1 ? (
                <button
                  ref={runDropdownExpandedRef}
                  id="run-dropdown-expanded"
                  className="stats-run-dropdown run-dropdown-btn"
                  data-run-id={stats.runId}
                  onClick={onRunDropdownToggle}
                >
                  {currentRunLabel} <span className="dropdown-arrow">v</span>
                </button>
              ) : (
                <CopyableText text={stats.runName ?? ''} className="stats-run copyable cursor-pointer hover:text-zinc-300" />
              )}
              <button
                className="edit-run-btn-expanded ml-1 text-zinc-600 transition hover:text-zinc-400"
                title={editingRunName ? 'Save' : 'Rename run'}
                onClick={() => {
                  if (editingRunName) {
                    onRunNameSave()
                  } else {
                    setEditingRunName(true)
                    setRunNameDraft(stats.runName || '')
                  }
                }}
              >
                {editingRunName ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                )}
              </button>
            </div>
          ) : null}
          {sessionRuns.length > 1 && stats.runName ? (
            <div className="stats-info-row">
              <span className="stats-info-label"></span>
              <button
                ref={compareDropdownAnchorRef}
                id="add-compare-btn"
                className="add-compare-btn"
                title="Compare with another run"
                onClick={onAddCompareToggle}
              >
                + Compare
              </button>
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
        {displayLatency > 0 ? (
          <div className="stats-metric stats-metric-sm stats-latency">
            <span className="stats-metric-value">{displayLatency.toFixed(2)}<span className="stats-metric-unit">s</span></span>
            <span className="stats-metric-label">avg latency</span>
          </div>
        ) : null}
      </div>
    </>
  ) : null

  if (inComparison) {
    const allKeys = new Set<string>()
    Object.values(comparisonData).forEach((runData) => {
      ;(runData?.score_chips || []).forEach((chip) => allKeys.add(chip.key))
    })
    allKeys.add('_latency')
    const keys = Array.from(allKeys)
    let maxLatency = 0
    Object.values(comparisonData).forEach((runData) => {
      const lat = runData?.average_latency || 0
      if (lat > maxLatency) maxLatency = lat
    })

    keys.forEach((key, keyIdx) => {
      const groupBars = normalizedComparisonRuns.map((run) => {
        const runData = comparisonData[run.runId]
        let pct = 0
        let displayVal = '--'
        if (key === '_latency') {
          const lat = runData?.average_latency || 0
          pct = maxLatency > 0 ? (lat / maxLatency) * 100 : 0
          displayVal = lat > 0 ? `${lat.toFixed(2)}s` : '--'
        } else {
          const chip = (runData?.score_chips || []).find((c) => c.key === key)
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
    <div id="stats-expanded" className={`stats-expanded${statsExpanded ? '' : ' hidden'}${inComparison ? ' comparison-mode' : ''}`}>
      <div className="stats-layout">
        <button id="stats-collapse-btn" className="stats-collapse-btn" title="Collapse" onClick={() => setStatsExpanded(false)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-chevron-up"></use></svg>
        </button>
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
