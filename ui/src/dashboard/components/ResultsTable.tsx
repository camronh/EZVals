import type { MouseEvent, RefObject } from 'react'
import type { ChangeEvent } from 'react'
import type { ColumnDef, ResultData, RunSummary, Score, SortStateItem } from '../../types'
import { formatValue } from '../utils'

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

type ResultsTableProps = {
  data: RunSummary | null
  rows: ResultRowView[]
  selectedIndices: Set<number>
  expandedRows: Set<number>
  hiddenSet: Set<string>
  sortState: SortStateItem[]
  colWidths: Record<string, number>
  columnDefs: ColumnDef[]
  pillTones: Record<string, string>
  onToggleSort: (col: string, type: string, multi: boolean) => void
  onResizeStart: (colKey: string, event: MouseEvent<HTMLDivElement>) => void
  onSelectAll: (checked: boolean) => void
  onRowSelect: (idx: number, checked: boolean, shiftKey: boolean) => void
  onRowToggle: (idx: number) => void
  selectAllRef: RefObject<HTMLInputElement>
  headerRefs: RefObject<Record<string, HTMLElement | null>>
}

export default function ResultsTable({
  data,
  rows,
  selectedIndices,
  expandedRows,
  hiddenSet,
  sortState,
  colWidths,
  columnDefs,
  pillTones,
  onToggleSort,
  onResizeStart,
  onSelectAll,
  onRowSelect,
  onRowToggle,
  selectAllRef,
  headerRefs,
}: ResultsTableProps) {
  return (
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
              ref={(el) => { if (headerRefs?.current) headerRefs.current[col.key] = el }}
              style={{ width: colWidths[col.key] ? `${colWidths[col.key]}px` : col.width, textAlign: col.align }}
              className={`bg-theme-bg px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-theme-text-muted ${hiddenSet.has(col.key) ? 'hidden' : ''}`}
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
        {rows.map((row) => {
          const result = row.result
          const status = result.status || 'completed'
          const isRunning = status === 'running'
          const isNotStarted = status === 'not_started'
          const scores = result.scores || []
          const functionCell = isNotStarted ? (
            <span className="font-mono text-[12px] font-medium text-zinc-500">{row.function}</span>
          ) : (
            <a
              href={`/runs/${data?.run_id}/results/${row.index}`}
              className="font-mono text-[12px] font-medium text-accent-link hover:text-accent-link-hover"
              onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
            >
              {row.function}
            </a>
          )
          let statusPill = null
          if (status === 'running') statusPill = <span className={`status-pill rounded px-1.5 py-0.5 text-[10px] font-medium ${pillTones.running}`}>running</span>
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
              className={`group cursor-pointer hover:bg-theme-bg-elevated/50 transition-colors ${isNotStarted ? 'opacity-60' : ''} ${expandedRows.has(row.index) ? 'expanded' : ''}`}
              onClick={(event) => {
                const target = event.target as HTMLElement | null
                if (target?.closest('input,button,a')) return
                onRowToggle(row.index)
              }}
            >
              <td className="px-2 py-3 text-center align-middle" onClick={(event) => event.stopPropagation()}>
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
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    {statusPill}
                    <span>{row.dataset || ''}</span>
                    {row.labels?.length ? (
                      <>
                        <span className="text-zinc-700">.</span>
                        {row.labels.map((la) => (
                          <span key={la} className="rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted">{la}</span>
                        ))}
                      </>
                    ) : null}
                  </div>
                </div>
              </td>
              <td data-col="input" title={formatValue(result.input)} className={`px-3 py-3 align-middle ${hiddenSet.has('input') ? 'hidden' : ''}`}>
                <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.input)}</div>
              </td>
              <td data-col="reference" title={formatValue(result.reference)} className={`px-3 py-3 align-middle ${hiddenSet.has('reference') ? 'hidden' : ''}`}>
                {result.reference != null ? (
                  <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.reference)}</div>
                ) : (
                  <span className="text-zinc-600">--</span>
                )}
              </td>
              <td data-col="output" title={formatValue(result.output)} className={`px-3 py-3 align-middle ${hiddenSet.has('output') ? 'hidden' : ''}`}>
                {outputCell}
              </td>
              <td data-col="error" title={result.error || ''} className={`px-3 py-3 align-middle ${hiddenSet.has('error') ? 'hidden' : ''}`}>
                {result.error ? (
                  <div className="line-clamp-4 text-[12px] text-accent-error">{result.error}</div>
                ) : (
                  <span className="text-zinc-600">--</span>
                )}
              </td>
              <td data-col="scores" data-value={row.scoresSortValue} className={`px-3 py-3 align-middle ${hiddenSet.has('scores') ? 'hidden' : ''}`}>
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
  )
}
