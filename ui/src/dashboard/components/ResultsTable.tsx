import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { ResultData, SortRule } from '../../types'
import { Icon } from '../../components/Icon'
import { ScoreBadges } from '../../components/ScoreBadges'
import { useHoverPreview } from '../../hooks/useHoverPreview'
import { formatValue } from '../../lib/format'
import { outcomeOf, type Outcome } from '../../lib/stats'
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
  /** Shown when there are no rows; without it, the table explains that no evals were found in `evalPath`. */
  emptyText?: string
  /** The run's only score key is pass/fail, so the outcome icon says it all and rows show just its notes. */
  oneMetric?: boolean
  evalPath?: string
}

const empty = <span className="text-theme-text-muted">—</span>
const EXAMPLE_EVAL = `from ezvals import eval, EvalContext

@eval(input="What is 2+2?", reference="4")
async def test_math(ctx: EvalContext):
    ctx.output = await my_llm(ctx.input)
    assert ctx.output == ctx.reference`

const spinner = (tone: string) => <span className={`h-3 w-3 animate-spin rounded-full border-[1.5px] ${tone}`} />
const glyph = (path: ReactNode, tone: string) => (
  <svg className={`h-3.5 w-3.5 ${tone}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
)
const check = <path d="m3.5 8.5 3 3 6-7" />
const OUTCOMES: Record<Outcome, [string, ReactNode]> = {
  not_run: ['not run', <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-theme-text-muted opacity-50" />],
  queued: ['queued', spinner('border-amber-500/30 border-t-amber-500')],
  running: ['running', spinner('border-blue-500/30 border-t-blue-500')],
  passed: ['passed', glyph(check, 'text-accent-success')],
  failed: ['failed', glyph(<path d="m4.5 4.5 7 7m0-7-7 7" />, 'text-accent-error')],
  error: ['error', glyph(<><path d="M8 2.5 14 13H2z" /><path d="M8 6.5v3m0 1.75v.01" /></>, 'text-accent-error')],
  scored: ['scored', glyph(check, 'text-theme-text-muted')],
  cancelled: ['cancelled', glyph(<><circle cx="8" cy="8" r="5.5" /><path d="m4.2 11.8 7.6-7.6" /></>, 'text-theme-text-muted')],
}

/** A row's outcome, per the spec's outcome table. */
export function StatusIcon({ outcome }: { outcome: Outcome }) {
  const [label, icon] = OUTCOMES[outcome]
  return <span className={`status-indicator status-indicator-${outcome} inline-flex h-4 w-4 shrink-0 items-center justify-center`} role="status" aria-label={label} title={label}>{icon}</span>
}

function Skeleton({ widths }: { widths: string[] }) {
  return <div className="space-y-1">{widths.map((w) => <div key={w} className={`h-2.5 ${w} animate-pulse rounded bg-theme-bg-elevated`} />)}</div>
}

export function AnnotationIndicator({ onEnter, onLeave, onClick }: { onEnter: (el: HTMLElement) => void; onLeave: () => void; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-annotation-indicator="true"
      className="annotation-indicator group/icon inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-theme-text-muted hover:text-theme-text"
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

export function ResultsTable({ runId, rows, hidden, sort, widths, selected, onSelect, onSort, onWidths, onOpen, onSaveAnnotation, emptyText, evalPath, oneMetric }: Props) {
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
        <thead className={rows.length || emptyText ? '' : 'hidden'}>
          <tr className="border-b border-theme-border">
            <th style={{ width: 32 }} className="bg-theme-bg px-2 py-2 text-center align-middle">
              <input
                ref={selectAll}
                type="checkbox"
                id="select-all-checkbox"
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
                  className={`relative bg-theme-bg px-3 py-2 text-[12px] font-medium text-theme-text-muted ${hidden.includes(col.key) ? 'hidden' : ''}`}
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
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-16 text-center text-sm text-theme-text-muted">
                {emptyText ?? (
                  <div id="no-evals" className="mx-auto max-w-md">
                    <div className="text-[15px] font-medium text-theme-text">No evals found{evalPath ? <> in <code className="font-mono text-[13px]">{evalPath}</code></> : null}</div>
                    <p className="mt-1">Add a function decorated with <code className="font-mono text-[12px]">@eval</code> (or an <code className="font-mono text-[12px]">.eval.ts</code> file), then choose Reload evals from the ⋯ menu.</p>
                    <pre className="mt-4 overflow-x-auto rounded-lg border border-theme-border bg-theme-bg-secondary p-3 text-left font-mono text-[12px] leading-relaxed text-theme-text-secondary">{EXAMPLE_EVAL}</pre>
                  </div>
                )}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const r: ResultData = row.result
            const status = r.status ?? 'completed'
            const running = status === 'running'
            const notStarted = status === 'not_started'
            const done = !running && !notStarted
            const outcome = outcomeOf(r)
            return (
              <tr
                key={row.index}
                data-row="main"
                data-row-id={row.index}
                data-status={status}
                data-dataset={row.dataset ?? ''}
                className={`group cursor-pointer transition-colors hover:bg-theme-bg-secondary ${notStarted ? 'text-theme-text-secondary' : ''}`}
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
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5"><StatusIcon outcome={outcome} /></span>
                    <div className="min-w-0 flex-1">
                      <a href={`/runs/${runId}/results/${row.index}`} title={row.row.function} className="block truncate text-[13px] font-medium text-theme-text hover:underline">
                        {row.row.function}
                      </a>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-theme-text-muted">
                        {row.dataset ? <span className="dataset-chip max-w-[160px] truncate" title={row.dataset}>{row.dataset}</span> : null}
                        {row.labels?.map((l) => <span key={l} className="label-chip max-w-[140px] truncate rounded bg-theme-bg-elevated px-1.5 text-[11px] text-theme-text-secondary" title={l}>{l}</span>)}
                        {row.row.trial ? <span className="trial-chip font-mono text-[11px]" title={`Trial ${row.row.trial}`}>#{row.row.trial}</span> : null}
                        {row.row.span_count ? (
                          <span className="span-count flex items-center gap-0.5" title={`Trace with ${row.row.span_count} steps`}>
                            <Icon name="trace" className="h-3 w-3" />{row.row.span_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {cell('input', <div className="line-clamp-4 text-[12px]">{formatValue(r.input)}</div>, hover(row, 'input'))}
                {cell('reference', r.reference != null ? <div className="line-clamp-4 text-[12px]">{formatValue(r.reference)}</div> : empty, hover(row, 'reference'))}
                {cell('output', (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1" {...hover(row, 'output')}>
                      {running ? <Skeleton widths={['w-3/4', 'w-1/2']} /> : done && r.output != null ? <div className="line-clamp-4 text-[12px]">{formatValue(r.output)}</div> : r.error && hidden.includes('error') ? <div className="line-clamp-4 text-[12px] text-accent-error">{r.error}</div> : empty}
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
                {cell('scores', running ? <Skeleton widths={['w-14', 'w-10']} /> : done && r.scores?.length ? <ScoreBadges scores={r.scores} passFail={oneMetric ? 'none' : 'failed'} /> : empty, hover(row, 'scores'))}
                {cell('latency', r.latency != null ? <span className="latency-value font-mono text-[12px] tabular-nums text-theme-text-muted">{r.latency.toFixed(2)}s</span> : running ? <div className="latency-skeleton ml-auto h-3 w-8 animate-pulse rounded bg-theme-bg-elevated" /> : empty)}
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover target={preview.target} onKeep={preview.keep} onClose={preview.clear} onSaveAnnotation={onSaveAnnotation} />
    </>
  )
}
