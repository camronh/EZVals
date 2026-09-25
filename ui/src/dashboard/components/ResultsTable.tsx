import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { ResultData, SortRule } from '../../types'
import { Icon } from '../../components/Icon'
import { ScoreBadges } from '../../components/ScoreBadges'
import { useHoverPreview } from '../../hooks/useHoverPreview'
import { formatValue, latencyTone } from '../../lib/format'
import { COLUMNS, type TableRow } from '../../lib/table'
import { CellPreviewPopover, hasPreview, type PreviewColumn, type PreviewTarget } from './CellPreviewPopover'

type Props = {
  runId: string
  rows: TableRow[]
  hidden: string[]
  sort: SortRule[]
  widths: Record<string, number>
  selected: Set<number>
  onSelect: (selected: Set<number>) => void
  onSort: (col: string, type: SortRule['type'], multi: boolean) => void
  onWidths: (widths: Record<string, number>) => void
  onOpen: (index: number) => void
  onSaveAnnotation: (runId: string, index: number, annotation: string | null) => Promise<void>
  /** Shown when there are no rows. */
  emptyText?: string
}

const empty = <span className="text-zinc-600">--</span>

const spinner = (tone: string) => <span className={`h-2.5 w-2.5 animate-spin rounded-full border ${tone}`} />

/** The row's status, per the spec: queued, running, passed/finished, error, cancelled (never-run rows show nothing). */
export function StatusIcon({ status }: { status: string }) {
  const icon = {
    pending: spinner('border-amber-500/40 border-t-amber-500'),
    running: spinner('border-blue-500/40 border-t-blue-500'),
    completed: <Icon name="check" className="h-3 w-3 text-emerald-500" />,
    error: <Icon name="close" className="h-3 w-3 text-rose-500" />,
    cancelled: (
      <svg className="h-3 w-3 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M5.6 18.4 18.4 5.6" />
      </svg>
    ),
  }[status]
  if (!icon) return null
  const label = status === 'pending' ? 'queued' : status
  return <span className={`status-indicator status-indicator-${status} inline-flex h-3 w-3 shrink-0 items-center justify-center`} role="status" aria-label={label} title={label}>{icon}</span>
}

function Skeleton({ widths }: { widths: string[] }) {
  return <div className="space-y-1">{widths.map((w) => <div key={w} className={`h-2.5 ${w} animate-pulse rounded bg-zinc-200 dark:bg-zinc-800`} />)}</div>
}

export function AnnotationIndicator({ onEnter, onLeave, onClick }: { onEnter: (el: HTMLElement) => void; onLeave: () => void; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-annotation-indicator="true"
      className="annotation-indicator group/icon inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      title="Show annotation"
      onMouseEnter={(e) => onEnter(e.currentTarget)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(e.currentTarget)}
    >
      <span className="group-hover/icon:hidden"><Icon name="message" className="h-3 w-3" /></span>
      <span className="hidden group-hover/icon:block"><Icon name="pencil" className="h-3 w-3" /></span>
    </button>
  )
}

/** Drag a header's edge to resize its column; widths of all columns are frozen when a drag starts. */
function useColumnResize(widths: Record<string, number>, onWidths: (w: Record<string, number>) => void) {
  const headers = useRef<Record<string, HTMLElement | null>>({})
  const drag = useRef<{ col: string; x: number; width: number; base: Record<string, number> } | null>(null)
  const justResized = useRef(0)
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return
      const { col, x, width, base } = drag.current
      onWidths({ ...base, [col]: Math.round(Math.max(50, Math.min(500, width + e.clientX - x))) })
    }
    const up = () => {
      if (drag.current) justResized.current = performance.now()
      drag.current = null
      document.body.classList.remove('ezvals-col-resize')
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [onWidths])
  const start = (col: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const measured: Record<string, number> = { ...widths }
    for (const [key, el] of Object.entries(headers.current)) {
      if (el && el.offsetWidth) measured[key] = el.offsetWidth
    }
    drag.current = { col, x: e.clientX, width: measured[col], base: measured }
    document.body.classList.add('ezvals-col-resize')
  }
  // A click right after a drag is the end of the drag, not a sort.
  const recentlyResized = () => performance.now() - justResized.current < 200
  return { headers, start, recentlyResized }
}

export function ResultsTable({ runId, rows, hidden, sort, widths, selected, onSelect, onSort, onWidths, onOpen, onSaveAnnotation, emptyText = 'No results yet' }: Props) {
  const preview = useHoverPreview<PreviewTarget>()
  const lastChecked = useRef<number | null>(null)
  const selectAll = useRef<HTMLInputElement | null>(null)
  const resize = useColumnResize(widths, onWidths)
  const visible = rows.map((r) => r.index)
  const selectedVisible = visible.filter((i) => selected.has(i)).length
  const latencies = rows.map((r) => r.result.latency).filter((l): l is number => typeof l === 'number')
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedVisible > 0 && selectedVisible < visible.length
  }, [selectedVisible, visible.length])

  const toggleRow = (index: number, checked: boolean, shift: boolean) => {
    const next = new Set(selected)
    const from = shift && lastChecked.current != null ? visible.indexOf(lastChecked.current) : -1
    const to = visible.indexOf(index)
    const range = from >= 0 ? visible.slice(Math.min(from, to), Math.max(from, to) + 1) : [index]
    range.forEach((i) => (checked ? next.add(i) : next.delete(i)))
    lastChecked.current = index
    onSelect(next)
  }
  const hover = (row: TableRow, col: PreviewColumn) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget
      if (hasPreview(col, row.result)) preview.enter(`${row.index}:${col}`, () => ({ col, rect: el.getBoundingClientRect(), result: row.result, runId, index: row.index }))
    },
    onMouseLeave: preview.leave,
  })
  const cell = (key: string, content: ReactNode, extra: React.TdHTMLAttributes<HTMLTableCellElement> = {}) => (
    <td data-col={key} className={`px-3 py-3 align-middle ${key === 'latency' ? 'text-right' : ''} ${hidden.includes(key) ? 'hidden' : ''}`} {...extra}>{content}</td>
  )

  return (
    <>
      <table id="results-table" data-run-id={runId} className="w-full min-w-[760px] table-fixed border-collapse text-sm text-theme-text">
        <thead>
          <tr className="border-b border-theme-border">
            <th style={{ width: 32 }} className="bg-theme-bg px-2 py-2 text-center align-middle">
              <input
                ref={selectAll}
                type="checkbox"
                id="select-all-checkbox"
                className="accent-emerald-500"
                checked={visible.length > 0 && selectedVisible === visible.length}
                onChange={(e) => {
                  const next = new Set(selected)
                  visible.forEach((i) => (e.target.checked ? next.add(i) : next.delete(i)))
                  onSelect(next)
                }}
              />
            </th>
            {COLUMNS.map((col) => {
              const rule = sort.find((s) => s.col === col.key)
              return (
                <th
                  key={col.key}
                  ref={(el) => { resize.headers.current[col.key] = el }}
                  data-col={col.key}
                  title={col.key === 'latency' && avgLatency != null ? `(Avg: ${avgLatency.toFixed(2)}s)` : undefined}
                  style={{ width: widths[col.key] ? `${widths[col.key]}px` : col.width, textAlign: col.align }}
                  className={`relative bg-theme-bg px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-theme-text-muted ${hidden.includes(col.key) ? 'hidden' : ''}`}
                  aria-sort={rule ? (rule.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={(e) => !resize.recentlyResized() && onSort(col.key, col.type, e.shiftKey)}
                >
                  {col.label}
                  <div className="col-resizer" onMouseDown={(e) => resize.start(col.key, e)} />
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border-subtle">
          {rows.length === 0 ? (
            <tr><td colSpan={COLUMNS.length + 1} className="px-4 py-12 text-center text-sm text-theme-text-muted">{emptyText}</td></tr>
          ) : null}
          {rows.map((row) => {
            const r: ResultData = row.result
            const status = r.status ?? 'completed'
            const running = status === 'running'
            const notStarted = status === 'not_started'
            const done = !running && !notStarted
            return (
              <tr
                key={row.index}
                data-row="main"
                data-row-id={row.index}
                data-status={status}
                data-dataset={row.dataset ?? ''}
                className={`group cursor-pointer transition-colors hover:bg-theme-bg-elevated/50 ${notStarted ? 'opacity-60' : ''}`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('input, a, [data-annotation-indicator]')) onOpen(row.index)
                }}
              >
                <td className="px-2 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    data-row-id={row.index}
                    checked={selected.has(row.index)}
                    onChange={(e) => toggleRow(row.index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                  />
                </td>
                {cell('function', (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <a href={`/runs/${runId}/results/${row.index}`} title={row.row.function} className={`truncate font-mono text-[12px] font-medium ${notStarted ? 'text-zinc-500 hover:text-zinc-400' : 'text-accent-link hover:text-accent-link-hover'}`}>
                        {row.row.function}
                      </a>
                      {row.row.trial ? <span className="trial-chip shrink-0 rounded bg-theme-bg-elevated px-1 font-mono text-[10px] text-theme-text-muted" title={`Trial ${row.row.trial}`}>#{row.row.trial}</span> : null}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-zinc-500">
                      <StatusIcon status={status} />
                      <span className="dataset-chip max-w-[160px] truncate" title={row.dataset ?? undefined}>{row.dataset}</span>
                      {row.labels?.length ? <span className="text-zinc-700">.</span> : null}
                      {row.labels?.map((l) => <span key={l} className="label-chip max-w-[140px] truncate rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted" title={l}>{l}</span>)}
                      {row.row.span_count ? (
                        <span className="span-count flex items-center gap-0.5 text-theme-text-muted" title={`${row.row.span_count} spans recorded`}>
                          <Icon name="trace" className="h-2.5 w-2.5" />{row.row.span_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {cell('input', <div className="line-clamp-4 text-[12px]">{formatValue(r.input)}</div>, hover(row, 'input'))}
                {cell('reference', r.reference != null ? <div className="line-clamp-4 text-[12px]">{formatValue(r.reference)}</div> : empty, hover(row, 'reference'))}
                {cell('output', (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1" {...hover(row, 'output')}>
                      {running ? <Skeleton widths={['w-3/4', 'w-1/2']} /> : done && r.output != null ? <div className="line-clamp-4 text-[12px]">{formatValue(r.output)}</div> : empty}
                    </div>
                    {r.annotation?.trim() ? (
                      <AnnotationIndicator
                        onEnter={(el) => preview.enter(`${row.index}:annotation`, () => ({ col: 'annotation', rect: el.getBoundingClientRect(), result: r, runId, index: row.index }))}
                        onLeave={preview.leave}
                        onClick={(el) => preview.open(`${row.index}:annotation`, { col: 'annotation', rect: el.getBoundingClientRect(), result: r, runId, index: row.index, editing: true })}
                      />
                    ) : null}
                  </div>
                ))}
                {cell('error', r.error ? <div className="line-clamp-4 text-[12px] text-accent-error">{r.error}</div> : empty, hover(row, 'error'))}
                {cell('scores', running ? <Skeleton widths={['w-14', 'w-10']} /> : done && r.scores?.length ? <ScoreBadges scores={r.scores} /> : empty, hover(row, 'scores'))}
                {cell('latency', r.latency != null ? <span className={`latency-value font-mono text-[11px] ${latencyTone(r.latency)}`}>{r.latency.toFixed(2)}s</span> : running ? <div className="latency-skeleton ml-auto h-3 w-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /> : empty)}
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover target={preview.target} onKeep={preview.keep} onClose={preview.clear} onSaveAnnotation={onSaveAnnotation} />
    </>
  )
}
