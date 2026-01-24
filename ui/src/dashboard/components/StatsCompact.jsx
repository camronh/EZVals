import CopyableText from './CopyableText.jsx'
import { chipStats, getBgBarColor, getTextColor } from '../utils.js'

/**
 * @param {{
 *   stats: any,
 *   statsExpanded: boolean,
 *   setStatsExpanded: (value: boolean) => void,
 *   displayChips: Array<any>,
 *   displayFilteredCount: number | null,
 *   hasFilters: boolean,
 *   sessionRuns: Array<any>,
 *   currentRunLabel: string,
 *   editingRunName: boolean,
 *   runNameDraft: string,
 *   setRunNameDraft: (value: string) => void,
 *   setEditingRunName: (value: boolean) => void,
 *   onRunNameSave: () => void,
 *   onRunDropdownToggle: () => void,
 *   runDropdownCompactRef: { current: HTMLElement | null },
 * }} props
 */
export default function StatsCompact({
  stats,
  statsExpanded,
  setStatsExpanded,
  displayChips,
  displayFilteredCount,
  hasFilters,
  sessionRuns,
  currentRunLabel,
  editingRunName,
  runNameDraft,
  setRunNameDraft,
  setEditingRunName,
  onRunNameSave,
  onRunDropdownToggle,
  runDropdownCompactRef,
}) {
  const { total, avgLatency, pctDone, progressPending, notStarted, progressCompleted, progressTotal } = stats
  const showFiltered = hasFilters && displayFilteredCount != null

  let progressHtml
  if (notStarted === total) {
    progressHtml = (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Discovered</span>
        <span className="font-mono text-[11px] text-zinc-400">{total} eval{total !== 1 ? 's' : ''}</span>
      </div>
    )
  } else if (progressPending > 0) {
    progressHtml = (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Progress</span>
        <div className="h-1 w-6 overflow-hidden rounded-full bg-theme-progress-bar">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pctDone}%` }}></div>
        </div>
        <span className="font-mono text-[11px] text-accent-link">{pctDone}% ({progressCompleted}/{progressTotal})</span>
      </div>
    )
  } else {
    const testsDisplay = showFiltered ? `${displayFilteredCount}/${total}` : total
    progressHtml = (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Tests</span>
        <span className="font-mono text-[11px] text-accent-link">{testsDisplay}</span>
      </div>
    )
  }

  return (
    <div id="stats-compact" className={`mb-3 flex flex-wrap items-center gap-3 border-b border-theme-border bg-theme-bg-secondary/50 px-4 py-2${statsExpanded ? ' hidden' : ''}`}>
      {(stats.sessionName || stats.runName) ? (
        <>
          <div className="flex items-center gap-2">
            {stats.sessionName ? (
              <>
                <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Session</span>
                <CopyableText text={stats.sessionName} className="copyable font-mono text-[11px] text-theme-text cursor-pointer hover:text-zinc-300" />
              </>
            ) : null}
            {stats.runName ? (
              <>
                {stats.sessionName ? <span className="text-zinc-600">.</span> : null}
                <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Run</span>
                {sessionRuns.length > 1 ? (
                  <div className="group flex items-center gap-1">
                    <button
                      ref={runDropdownCompactRef}
                      id="run-dropdown-compact"
                      className="stats-run-dropdown-compact run-dropdown-btn"
                      data-run-id={stats.runId}
                      onClick={onRunDropdownToggle}
                    >
                      {currentRunLabel} <span className="dropdown-arrow">v</span>
                    </button>
                    <button className="edit-run-btn flex h-4 w-4 items-center justify-center rounded text-zinc-600 transition hover:text-zinc-400" title="Rename run" onClick={() => { setEditingRunName(true); setRunNameDraft(stats.runName || '') }}>
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                    </button>
                  </div>
                ) : (
                  <div className="group flex items-center gap-1">
                    {editingRunName ? (
                      <input
                        className="font-mono text-[11px] bg-zinc-800 border border-zinc-600 rounded px-1 w-24 text-accent-link outline-none focus:border-zinc-500"
                        value={runNameDraft}
                        onChange={(e) => setRunNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onRunNameSave(); if (e.key === 'Escape') setEditingRunName(false) }}
                        onBlur={() => setEditingRunName(false)}
                      />
                    ) : (
                      <CopyableText text={stats.runName} className="copyable font-mono text-[11px] text-accent-link cursor-pointer hover:text-accent-link-hover" />
                    )}
                    <button className="edit-run-btn flex h-4 w-4 items-center justify-center rounded text-zinc-600 transition hover:text-zinc-400" title="Rename run" onClick={() => { setEditingRunName(true); setRunNameDraft(stats.runName || '') }}>
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <div className="h-3 w-px bg-zinc-700"></div>
        </>
      ) : null}
      {progressHtml}
      <div className="h-3 w-px bg-zinc-700"></div>
      {displayChips.flatMap((chip, i) => {
        const statsChip = chipStats(chip, 1)
        const chipNode = (
          <div key={`chip-${chip.key}`} className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-theme-text-secondary">{chip.key}</span>
            <div className="h-1 w-5 overflow-hidden rounded-full bg-theme-progress-bar">
              <div className={`h-full rounded-full ${getBgBarColor(statsChip.pct)}`} style={{ width: `${statsChip.pct}%` }}></div>
            </div>
            <span className={`font-mono text-[11px] ${getTextColor(statsChip.pct)}`}>{statsChip.pct}% ({statsChip.value})</span>
          </div>
        )
        if (i < displayChips.length - 1) {
          return [chipNode, <div key={`sep-${chip.key}`} className="h-3 w-px bg-zinc-700"></div>]
        }
        return [chipNode]
      })}
      {avgLatency > 0 ? (
        <>
          <div className="h-3 w-px bg-zinc-700"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-theme-text-secondary">Latency</span>
            <span className="font-mono text-[11px] text-zinc-400">{avgLatency.toFixed(2)}s</span>
          </div>
        </>
      ) : null}
      <div className="ml-auto">
        <button id="stats-expand-btn" className="stats-toggle-btn" title="Expand stats" onClick={() => setStatsExpanded(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-chevron-down"></use></svg>
        </button>
      </div>
    </div>
  )
}
