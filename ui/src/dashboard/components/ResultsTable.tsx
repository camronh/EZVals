import { useCallback, useRef, useState } from 'react'
import type { MouseEvent, RefObject, ChangeEvent } from 'react'
import type { ColumnDef, ResultData, RunSummary, Score, SortStateItem } from '../../types'
import { formatValue } from '../utils'
import CellPreviewPopover from './CellPreviewPopover'
import type { CellPreviewTarget } from './CellPreviewPopover'

type ResultRowView = {
  index: number
  function: string
  dataset: string
  labels: string[]
  result: ResultData
  scores: Score[]
  scoresSortValue: string | number
  hasUrl: boolean
  hasMessages: boolean
  hasError: boolean
  annotation: string
  searchText: string
}

const PREVIEWABLE_COLS = new Set(['input', 'output', 'reference', 'error', 'scores', 'annotation'])
const HOVER_DELAY = 400

type ResultsTableProps = {
  data: RunSummary | null
  rows: ResultRowView[]
  selectedIndices: Set<number>
  hiddenSet: Set<string>
  sortState: SortStateItem[]
  colWidths: Record<string, number>
  columnDefs: ColumnDef[]
  pillTones: Record<string, string>
  onToggleSort: (col: string, type: string, multi: boolean) => void
  onResizeStart: (colKey: string, event: MouseEvent<HTMLDivElement>) => void
  onSelectAll: (checked: boolean) => void
  onRowSelect: (idx: number, checked: boolean, shiftKey: boolean) => void
  onSaveAnnotation: (runId: string, resultIndex: number, annotation: string | null) => Promise<void>
  selectAllRef: RefObject<HTMLInputElement>
  headerRefs: RefObject<Record<string, HTMLElement | null>>
}

export default function ResultsTable({
  data,
  rows,
  selectedIndices,
  hiddenSet,
  sortState,
  colWidths,
  columnDefs,
  pillTones,
  onToggleSort,
  onResizeStart,
  onSelectAll,
  onRowSelect,
  onSaveAnnotation,
  selectAllRef,
  headerRefs,
}: ResultsTableProps) {
  const [previewTarget, setPreviewTarget] = useState<CellPreviewTarget>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHoverRef = useRef<{ rowIdx: number; col: string } | null>(null)

  const clearHover = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    activeHoverRef.current = null
    setPreviewTarget(null)
  }, [])

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  const handleCellMouseEnter = useCallback((rowIdx: number, col: string, result: ResultData, element: HTMLElement) => {
    if (!PREVIEWABLE_COLS.has(col)) return

    // Cancel any pending dismiss
    cancelDismiss()

    // Same cell already active
    if (activeHoverRef.current?.rowIdx === rowIdx && activeHoverRef.current?.col === col) return

    // Clear any pending timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    activeHoverRef.current = { rowIdx, col }

    hoverTimerRef.current = setTimeout(() => {
      // Verify still hovering the same cell
      if (activeHoverRef.current?.rowIdx !== rowIdx || activeHoverRef.current?.col !== col) return

      const rect = element.getBoundingClientRect()
      const content = col === 'input' ? result.input
        : col === 'output' ? result.output
        : col === 'reference' ? result.reference
        : col === 'annotation' ? result.annotation
        : col === 'error' ? result.error
        : null

      setPreviewTarget({
        col,
        rect,
        content,
        scores: col === 'scores' ? (result.scores || []) : undefined,
        error: col === 'error' ? result.error : undefined,
        runId: data?.run_id,
        resultIndex: rowIdx,
      })
    }, HOVER_DELAY)
  }, [cancelDismiss, data?.run_id])

  const handleCellMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    // Short delay to allow mouse to reach the popover
    dismissTimerRef.current = setTimeout(() => {
      activeHoverRef.current = null
      setPreviewTarget(null)
    }, 150)
  }, [])

  const handleAnnotationClick = useCallback((rowIdx: number, result: ResultData, element: HTMLElement) => {
    cancelDismiss()
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    activeHoverRef.current = { rowIdx, col: 'annotation' }
    const rect = element.getBoundingClientRect()
    setPreviewTarget({
      col: 'annotation',
      rect,
      content: result.annotation,
      runId: data?.run_id,
      resultIndex: rowIdx,
      editMode: true,
    })
  }, [cancelDismiss, data?.run_id])

  let avgVisibleLatency: number | null = null
  let latencyTotal = 0
  let latencyCount = 0
  rows.forEach((row) => {
    const lat = row.result.latency
    if (typeof lat === 'number' && !Number.isNaN(lat)) {
      latencyTotal += lat
      latencyCount += 1
    }
  })
  if (latencyCount > 0) avgVisibleLatency = latencyTotal / latencyCount

  return (
    <>
      <table id="results-table" data-run-id={data?.run_id} className="w-full table-fixed border-collapse text-sm text-theme-text">
        <thead>
          <tr className="border-b border-theme-border">
            <th style={{ width: '32px' }} className="bg-theme-bg px-2 py-2 text-center align-middle">
              <input
                type="checkbox"
                id="select-all-checkbox"
                ref={selectAllRef}
                className="accent-emerald-500"
                checked={rows.length > 0 && rows.every((row) => selectedIndices.has(row.index))}
                onChange={(e) => onSelectAll(e.currentTarget.checked)}
              />
            </th>
          {columnDefs.map((col) => (
            <th
              key={col.key}
              data-col={col.key}
              data-type={col.type}
              title={col.key === 'latency' && avgVisibleLatency != null ? `(Avg: ${avgVisibleLatency.toFixed(2)}s)` : undefined}
              ref={(el) => { if (headerRefs?.current) headerRefs.current[col.key] = el }}
              style={{ width: colWidths[col.key] ? `${colWidths[col.key]}px` : col.width, textAlign: col.align }}
              className={`relative bg-theme-bg px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-theme-text-muted ${hiddenSet.has(col.key) ? 'hidden' : ''}`}
              aria-sort={(() => {
                const s = sortState.find((item) => item.col === col.key)
                if (!s) return 'none'
                return s.dir === 'asc' ? 'ascending' : 'descending'
              })()}
              onClick={(e) => onToggleSort(col.key, col.type, e.shiftKey)}
            >
              {col.label}
              <div className="col-resizer" onMouseDown={(e) => onResizeStart(col.key, e)}></div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-theme-border-subtle">
        {rows.length === 0 && (
          <tr>
            <td colSpan={columnDefs.length + 1} className="px-4 py-12 text-center text-sm text-theme-text-muted">
              No results yet
            </td>
          </tr>
        )}
        {rows.map((row) => {
          const result = row.result
          const annotationText = result.annotation?.trim()
          const status = result.status || 'completed'
          const isRunning = status === 'running'
          const isNotStarted = status === 'not_started'
          const scores = result.scores || []
          const functionCell = (
            <a
              href={`/runs/${data?.run_id}/results/${row.index}`}
              className={`font-mono text-[12px] font-medium ${isNotStarted ? 'text-zinc-500 hover:text-zinc-400' : 'text-accent-link hover:text-accent-link-hover'}`}
              onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
            >
              {row.function}
            </a>
          )
          let statusPill = null
          if (status === 'running') {
            statusPill = (
              <span className="status-indicator-running inline-flex h-3 w-3 items-center justify-center text-cyan-400" role="status" aria-label="running">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-cyan-500/40 border-t-cyan-400" />
              </span>
            )
          }
          else if (status === 'error') statusPill = <span className={`status-pill rounded px-1.5 py-0.5 text-[10px] font-medium ${pillTones.error}`}>err</span>

            let outputCell
            if (isNotStarted) outputCell = <span className="text-zinc-600">--</span>
            else if (isRunning) outputCell = (
              <div className="space-y-1">
                <div className="h-2.5 w-3/4 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-zinc-800"></div>
              </div>
            )
            else if (result.output != null) outputCell = <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.output)}</div>
            else outputCell = <span className="text-zinc-600">--</span>

            let scoresCell
            if (isNotStarted) scoresCell = <span className="text-zinc-600">--</span>
            else if (isRunning) scoresCell = (
              <div className="flex gap-1">
                <div className="h-4 w-14 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-4 w-10 animate-pulse rounded bg-zinc-800"></div>
              </div>
            )
            else if (scores.length) {
              scoresCell = (
                <div className="flex flex-wrap gap-1">
                  {scores.map((s, idx) => {
                    let badgeClass = 'bg-theme-bg-elevated text-theme-text-muted'
                    if (s.passed === true) badgeClass = 'bg-accent-success-bg text-accent-success'
                    else if (s.passed === false) badgeClass = 'bg-accent-error-bg text-accent-error'
                    const val = s.value != null ? `:${typeof s.value === 'number' ? s.value.toFixed(1) : s.value}` : ''
                    const title = `${s.key}${s.value != null ? ': ' + (typeof s.value === 'number' ? s.value.toFixed(3) : s.value) : ''}${s.notes ? ' -- ' + s.notes : ''}`
                    return (
                      <span key={`${s.key}-${idx}`} className={`score-badge shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`} title={title}>
                        {s.key}{val}
                      </span>
                    )
                  })}
                </div>
              )
            } else scoresCell = <span className="text-zinc-600">--</span>

            let latencyCell
            if (result.latency != null) {
              const lat = result.latency
              const latColor = lat <= 1 ? 'text-accent-success' : (lat <= 5 ? 'text-theme-text-muted' : 'text-accent-error')
              latencyCell = <span className={`latency-value font-mono text-[11px] ${latColor}`}>{lat.toFixed(2)}s</span>
            } else if (isRunning) latencyCell = <div className="latency-skeleton ml-auto h-3 w-8 animate-pulse rounded bg-zinc-800"></div>
            else latencyCell = <span className="text-zinc-600">--</span>

            return (
              <tr
                key={row.index}
                data-row="main"
                data-row-id={row.index}
                data-status={status}
                data-scores={JSON.stringify(scores)}
                data-annotation={row.annotation}
                data-dataset={row.dataset}
                data-labels={JSON.stringify(row.labels)}
                data-has-url={row.hasUrl}
                data-has-messages={row.hasMessages}
                data-has-error={row.hasError}
                className={`group hover:bg-theme-bg-elevated/50 transition-colors cursor-pointer ${isNotStarted ? 'opacity-60' : ''}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('input[type=checkbox]') || target.closest('[data-annotation-indicator]') || target.closest('a')) return
                  sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())
                  window.location.href = `/runs/${data?.run_id}/results/${row.index}`
                }}
              >
                <td className="px-2 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    data-row-id={row.index}
                    checked={selectedIndices.has(row.index)}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const shiftKey = (e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey === true
                      onRowSelect(row.index, e.currentTarget.checked, shiftKey)
                    }}
                  />
                </td>
                <td data-col="function" className={`px-3 py-3 align-middle ${hiddenSet.has('function') ? 'hidden' : ''}`}>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">{functionCell}</div>
                    <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">
                      {statusPill}
                      <span
                        className="dataset-chip max-w-[160px] truncate"
                        title={row.dataset || undefined}
                      >
                        {row.dataset || ''}
                      </span>
                      {row.labels?.length ? (
                        <>
                          <span className="text-zinc-700">.</span>
                          {row.labels.map((la) => (
                            <span
                              key={la}
                              className="label-chip max-w-[140px] truncate rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted"
                              title={la}
                            >
                              {la}
                            </span>
                          ))}
                        </>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td
                  data-col="input"
                  className={`px-3 py-3 align-middle ${hiddenSet.has('input') ? 'hidden' : ''}`}
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'input', result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.input)}</div>
                </td>
                <td
                  data-col="reference"
                  className={`px-3 py-3 align-middle ${hiddenSet.has('reference') ? 'hidden' : ''}`}
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'reference', result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  {result.reference != null ? (
                    <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.reference)}</div>
                  ) : (
                    <span className="text-zinc-600">--</span>
                  )}
                </td>
                <td
                  data-col="output"
                  className={`px-3 py-3 align-middle ${hiddenSet.has('output') ? 'hidden' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="min-w-0 flex-1"
                      onMouseEnter={(e) => handleCellMouseEnter(row.index, 'output', result, e.currentTarget)}
                      onMouseLeave={handleCellMouseLeave}
                    >
                      {outputCell}
                    </div>
                    {annotationText ? (
                      <button
                        type="button"
                        data-annotation-indicator="true"
                        data-preview-target="annotation"
                        className="annotation-indicator group/icon inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                        title="Show annotation"
                        onMouseEnter={(e) => handleCellMouseEnter(row.index, 'annotation', result, e.currentTarget)}
                        onMouseLeave={handleCellMouseLeave}
                        onClick={(e) => handleAnnotationClick(row.index, result, e.currentTarget)}
                      >
                        <svg className="h-3 w-3 group-hover/icon:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        <svg className="hidden h-3 w-3 group-hover/icon:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </td>
                <td
                  data-col="error"
                  className={`px-3 py-3 align-middle ${hiddenSet.has('error') ? 'hidden' : ''}`}
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'error', result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  {result.error ? (
                    <div className="line-clamp-4 text-[12px] text-accent-error">{result.error}</div>
                  ) : (
                    <span className="text-zinc-600">--</span>
                  )}
                </td>
                <td
                  data-col="scores"
                  data-value={row.scoresSortValue}
                  className={`px-3 py-3 align-middle ${hiddenSet.has('scores') ? 'hidden' : ''}`}
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'scores', result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  {scoresCell}
                </td>
                <td data-col="latency" data-value={result.latency ?? ''} className={`px-3 py-3 align-middle text-right ${hiddenSet.has('latency') ? 'hidden' : ''}`}>
                  {latencyCell}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover
        target={previewTarget}
        onMouseEnter={cancelDismiss}
        onMouseLeave={clearHover}
        onSaveAnnotation={onSaveAnnotation}
      />
    </>
  )
}
