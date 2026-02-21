import { useCallback, useMemo, useRef, useState } from 'react'
import type { NormalizedComparisonRun, RunResultRow } from '../../types'
import type { ComparisonMatrixEntry } from '../utils'
import InlineScoreBadges from './InlineScoreBadges'
import CellPreviewPopover from './CellPreviewPopover'
import type { CellPreviewTarget } from './CellPreviewPopover'
import { formatValue } from '../utils'

type ComparisonRow = {
  key: string
  entry: ComparisonMatrixEntry
  index: number
  linkRunId?: string
  linkIndex?: number | null
  firstResult?: RunResultRow | null
}

type ComparisonTableProps = {
  sortedRows: ComparisonRow[]
  normalizedComparisonRuns: NormalizedComparisonRun[]
  onToggleSort: (col: string, type: string, multi: boolean) => void
  currentRunId?: string
}

const HOVER_DELAY = 400

export default function ComparisonTable({ sortedRows, normalizedComparisonRuns, onToggleSort, currentRunId }: ComparisonTableProps) {
  const [previewTarget, setPreviewTarget] = useState<CellPreviewTarget>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHoverRef = useRef<{ rowIdx: number; key: string } | null>(null)

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

  const handleCellMouseEnter = useCallback((
    rowIdx: number,
    hoverKey: string,
    col: 'input' | 'reference' | 'output' | 'error' | 'scores',
    result: RunResultRow['result'] | null | undefined,
    element: HTMLElement,
  ) => {
    cancelDismiss()
    if (activeHoverRef.current?.rowIdx === rowIdx && activeHoverRef.current?.key === hoverKey) return

    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    activeHoverRef.current = { rowIdx, key: hoverKey }

    hoverTimerRef.current = setTimeout(() => {
      if (activeHoverRef.current?.rowIdx !== rowIdx || activeHoverRef.current?.key !== hoverKey) return
      const rect = element.getBoundingClientRect()
      setPreviewTarget({
        col,
        rect,
        content: col === 'input' ? result?.input : col === 'reference' ? result?.reference : col === 'output' ? result?.output : null,
        scores: col === 'scores' ? (result?.scores || []) : undefined,
        error: col === 'error' ? result?.error : undefined,
      })
    }, HOVER_DELAY)
  }, [cancelDismiss])

  const handleCellMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    dismissTimerRef.current = setTimeout(() => {
      activeHoverRef.current = null
      setPreviewTarget(null)
    }, 150)
  }, [])

  const comparisonQuerySuffix = useMemo(() => {
    if (normalizedComparisonRuns.length < 2) return ''
    const params = new URLSearchParams()
    normalizedComparisonRuns.forEach((run) => {
      params.append('compare_run_id', run.runId)
    })
    return `?${params.toString()}`
  }, [normalizedComparisonRuns])

  return (
    <>
      <table id="results-table" className="w-full table-fixed border-collapse text-sm text-theme-text comparison-table">
        <thead>
          <tr className="border-b border-theme-border">
            <th data-col="function" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('function', 'string', e.shiftKey)}>Eval</th>
            <th data-col="input" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('input', 'string', e.shiftKey)}>Input</th>
            <th data-col="reference" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('reference', 'string', e.shiftKey)}>Reference</th>
            {normalizedComparisonRuns.map((run) => (
              <th
                key={run.runId}
                data-col={`output-${run.runId}`}
                style={{ width: `${Math.floor(50 / normalizedComparisonRuns.length)}%`, borderLeft: `2px solid ${run.color}40` }}
                className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider comparison-output-header"
                onClick={(e) => onToggleSort(`output-${run.runId}`, 'string', e.shiftKey)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: run.color }}></span>
                  <span className="truncate">{run.runName}</span>
                </span>
              </th>
            ))}
            <th style={{ width: '28px' }} className="bg-theme-bg px-1 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border-subtle">
          {sortedRows.map((row) => {
            const meta = (row.entry?._meta || {}) as { function?: string; dataset?: string; labels?: string[] }
            const labelsHtml = meta.labels?.length ? (
              <>
                <span className="text-zinc-700">.</span>
                {meta.labels.map((la) => (
                  <span
                    key={la}
                    className="label-chip max-w-[140px] truncate rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted"
                    title={la}
                  >
                    {la}
                  </span>
                ))}
              </>
            ) : null
            return (
              <tr key={row.key} data-row="main" data-row-id={row.index} data-compare-key={row.key} className="group hover:bg-theme-bg-elevated/50 transition-colors">
                <td data-col="function" className="px-3 py-3 align-middle">
                  <div className="flex flex-col gap-0.5">
                    {row.linkIndex != null ? (
                      <a
                        href={`/runs/${row.linkRunId || currentRunId}/results/${row.linkIndex}${comparisonQuerySuffix}`}
                        className="font-mono text-[12px] font-medium text-accent-link hover:text-accent-link-hover"
                        onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
                      >
                        {meta.function}
                      </a>
                    ) : (
                      <span className="font-mono text-[12px] font-medium text-theme-text">{meta.function}</span>
                    )}
                    <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">
                      <span
                        className="dataset-chip max-w-[160px] truncate"
                        title={meta.dataset || undefined}
                      >
                        {meta.dataset || ''}
                      </span>
                      {labelsHtml}
                    </div>
                  </div>
                </td>
                <td
                  data-col="input"
                  className="px-3 py-3 align-middle"
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'input', 'input', row.firstResult?.result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.input)}</div>
                </td>
                <td
                  data-col="reference"
                  className="px-3 py-3 align-middle"
                  onMouseEnter={(e) => handleCellMouseEnter(row.index, 'reference', 'reference', row.firstResult?.result, e.currentTarget)}
                  onMouseLeave={handleCellMouseLeave}
                >
                  {row.firstResult?.result?.reference != null ? (
                    <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.reference)}</div>
                  ) : (
                    <span className="text-zinc-600">--</span>
                  )}
                </td>
                {normalizedComparisonRuns.map((run) => {
                  const outputCol = `output-${run.runId}`
                  const entry = row.entry?.[run.runId] as RunResultRow | undefined
                  const result = entry?.result
                  if (!result) {
                    return (
                      <td key={run.runId} data-col={outputCol} className="px-3 py-3 align-middle comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                        <span className="text-zinc-600">--</span>
                      </td>
                    )
                  }
                  const errorHtml = result.error ? (
                    <div
                      className="text-[10px] text-accent-error truncate"
                      title={result.error}
                      onMouseEnter={(e) => handleCellMouseEnter(row.index, `${outputCol}-error`, 'error', result, e.currentTarget)}
                      onMouseLeave={handleCellMouseLeave}
                    >
                      Error: {result.error.split('\n')[0]}
                    </div>
                  ) : null
                  return (
                    <td key={run.runId} data-col={outputCol} className="px-3 py-3 comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                      <div className="comparison-output-content">
                        <div>
                          <div
                            className="line-clamp-3 text-[12px] text-theme-text"
                            onMouseEnter={(e) => handleCellMouseEnter(row.index, outputCol, 'output', result, e.currentTarget)}
                            onMouseLeave={handleCellMouseLeave}
                          >
                            {result.output != null ? formatValue(result.output) : '--'}
                          </div>
                          {errorHtml}
                        </div>
                        <div
                          className="flex flex-wrap gap-1 mt-2"
                          onMouseEnter={(e) => handleCellMouseEnter(row.index, `${outputCol}-scores`, 'scores', result, e.currentTarget)}
                          onMouseLeave={handleCellMouseLeave}
                        >
                          <InlineScoreBadges scores={result.scores || []} latency={result.latency} />
                        </div>
                      </div>
                    </td>
                  )
                })}
                <td className="px-1 py-3 align-middle"></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover target={previewTarget} onMouseEnter={cancelDismiss} onMouseLeave={clearHover} />
    </>
  )
}
