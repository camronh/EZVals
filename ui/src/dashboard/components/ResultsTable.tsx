import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { ResultData, SortRule } from '../../types'
import { Icon } from '../../components/Icon'
import { ScoreBadges } from '../../components/ScoreBadges'
import { useHoverPreview } from '../../hooks/useHoverPreview'
import { errorSummary, formatValue } from '../../lib/format'
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
  emptyText?: ReactNode
  /** The run's only score key is pass/fail, so the outcome icon says it all and rows show just its notes. */
  oneMetric?: boolean
  /** The row open in the review panel. */
  current?: number | null
  evalPath?: string
}

const empty = <span className="text-fg-muted">—</span>
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
  not_run: ['not run', <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-line-strong" />],
  queued: ['queued', spinner('border-surface-muted border-t-warning')],
  running: ['running', spinner('border-surface-muted border-t-accent')],
  passed: ['passed', glyph(check, 'text-success')],
  failed: ['failed', glyph(<path d="m4.5 4.5 7 7m0-7-7 7" />, 'text-danger')],
  error: ['error', glyph(<><path d="M8 2.5 14 13H2z" /><path d="M8 6.5v3m0 1.75v.01" /></>, 'text-danger')],
  scored: ['scored', glyph(check, 'text-fg-muted')],
  cancelled: ['cancelled', glyph(<><circle cx="8" cy="8" r="5.5" /><path d="m4.2 11.8 7.6-7.6" /></>, 'text-fg-muted')],
}

/** A row's outcome, per the spec's outcome table. */
export function StatusIcon({ outcome }: { outcome: Outcome }) {
  const [label, icon] = OUTCOMES[outcome]
  return <span className={`status-indicator status-indicator-${outcome} inline-flex h-4 w-4 shrink-0 items-center justify-center`} role="status" aria-label={label} title={label}>{icon}</span>
}

/** A value in a table cell: three lines at most; structured data in mono, spaced so it wraps between fields. */
export function Value({ value }: { value: unknown }) {
  return typeof value === 'object'
    ? <div className="line-clamp-3 font-mono text-xs [overflow-wrap:anywhere]">{JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ')}</div>
    : <div className="line-clamp-3">{formatValue(value)}</div>
}

/** An eval's name, allowed to wrap after an underscore or before its case (`refund_request` / `[direct]`) rather than mid-word. */
export function EvalName({ name }: { name: string }) {
  return <>{name.split(/(?<=_)|(?=\[)/).map((part, i) => <span key={i}>{i ? <wbr /> : null}{part}</span>)}</>
}

function Skeleton({ widths }: { widths: string[] }) {
  return <div className="space-y-1">{widths.map((w) => <div key={w} className={`h-2.5 ${w} animate-pulse rounded-sm bg-surface-muted`} />)}</div>
}

export function AnnotationIndicator({ onEnter, onLeave, onClick }: { onEnter: (el: HTMLElement) => void; onLeave: () => void; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-annotation-indicator="true"
      className="annotation-indicator group/icon -m-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg"
      title="Annotation"
      aria-label="Annotation"
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

export function ResultsTable({ runId, rows, hidden: chosen, sort, widths, selected, onSelect, onSort, onWidths, onOpen, onSaveAnnotation, emptyText, evalPath, oneMetric, current }: Props) {
  // Beside the review panel the table narrows to a list of evals, and the panel shows the rest.
  const list = current != null
  const hidden = list ? [...chosen, 'input', 'reference', 'output', 'error'] : chosen
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
  useEffect(() => {
    if (current != null) document.querySelector(`#results-table tr[data-row-id="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

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
    <td data-col={key} className={`px-3 py-2.5 align-top ${key === 'latency' ? 'text-right' : ''} ${hidden.includes(key) ? 'hidden' : ''}`} {...extra}>{content}</td>
  )

  return (
    <>
      <table id="results-table" data-run-id={runId} className={`w-full table-fixed border-collapse text-sm text-fg ${list ? '' : 'min-w-[760px]'}`}>
        <thead className={rows.length || emptyText ? '' : 'hidden'}>
          <tr className="border-b border-line">
            <th style={{ width: 36 }} className="bg-surface px-2 py-2 text-center align-middle">
              <input
                ref={selectAll}
                type="checkbox"
                aria-label="Select all"
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
                  style={{ width: list && col.key === 'function' ? undefined : widths[col.key] ? `${widths[col.key]}px` : col.width, textAlign: col.align }}
                  className={`relative cursor-pointer select-none bg-surface px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg ${hidden.includes(col.key) ? 'hidden' : ''}`}
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
        <tbody className="divide-y divide-line-subtle">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-16 text-center text-sm text-fg-muted">
                {emptyText ?? (
                  <div id="no-evals" className="mx-auto max-w-md">
                    <div className="text-base font-semibold text-fg">No evals found{evalPath ? <> in <code className="font-mono text-sm">{evalPath}</code></> : null}</div>
                    <p className="mt-1">Add a function decorated with <code className="font-mono text-xs">@eval</code> (or an <code className="font-mono text-xs">.eval.ts</code> file), then choose Reload evals in the sidebar.</p>
                    <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-subtle p-3 text-left font-mono text-xs leading-5 text-fg">{EXAMPLE_EVAL}</pre>
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
                aria-current={current === row.index ? 'true' : undefined}
                className={`group cursor-pointer transition-colors ${current === row.index ? 'bg-surface-muted shadow-[inset_2px_0_0_var(--accent)]' : selected.has(row.index) ? 'bg-accent-subtle' : 'hover:bg-surface-subtle'} ${notStarted ? 'text-fg-secondary' : ''}`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('input, a, [data-annotation-indicator]')) onOpen(row.index)
                }}
              >
                <td
                  className="px-2 py-2.5 text-center align-top"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (e.target === e.currentTarget) toggleRow(row.index, !selected.has(row.index), e.shiftKey)
                  }}
                >
                  <input
                    type="checkbox"
                    className="row-checkbox mt-0.5"
                    aria-label={`Select ${row.row.function}`}
                    data-row-id={row.index}
                    checked={selected.has(row.index)}
                    onChange={(e) => toggleRow(row.index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                  />
                </td>
                {cell('function', (
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5"><StatusIcon outcome={outcome} /></span>
                    <div className="min-w-0 flex-1">
                      <a href={`/runs/${runId}/results/${row.index}`} title={row.row.function} className="line-clamp-2 font-mono text-sm font-medium text-fg [overflow-wrap:anywhere] hover:underline">
                        <EvalName name={row.row.function} />
                      </a>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-fg-muted">
                        {row.dataset ? <span className="dataset-chip mr-0.5 max-w-[160px] truncate" title={row.dataset}>{row.dataset}</span> : null}
                        {row.labels?.map((l) => <span key={l} className="label-chip chip max-w-[140px] truncate" title={l}>{l}</span>)}
                        {row.row.trial ? <span className="trial-chip font-mono text-2xs" title={`Trial ${row.row.trial}`}>#{row.row.trial}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
                {cell('input', r.input != null ? <Value value={r.input} /> : empty, hover(row, 'input'))}
                {cell('reference', r.reference != null ? <Value value={r.reference} /> : empty, hover(row, 'reference'))}
                {cell('output', (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1" {...hover(row, 'output')}>
                      {running ? <Skeleton widths={['w-3/4', 'w-1/2']} /> : done && r.output != null ? <Value value={r.output} /> : r.error && hidden.includes('error') ? <div className="line-clamp-3 font-mono text-xs text-danger">{errorSummary(r.error)}</div> : empty}
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
                {cell('error', r.error ? <div className="line-clamp-3 font-mono text-xs text-danger">{errorSummary(r.error)}</div> : empty, hover(row, 'error'))}
                {cell('scores', running ? <Skeleton widths={['w-14', 'w-10']} /> : done && r.scores?.length ? <ScoreBadges scores={r.scores} passFail={oneMetric ? 'none' : 'failed'} /> : empty, hover(row, 'scores'))}
                {cell('latency', r.latency != null ? <span className="latency-value text-xs tabular-nums text-fg-muted">{r.latency.toFixed(2)}s</span> : running ? <div className="latency-skeleton ml-auto h-3 w-8 animate-pulse rounded-sm bg-surface-muted" /> : empty)}
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover target={preview.target} onKeep={preview.keep} onClose={preview.clear} onSaveAnnotation={onSaveAnnotation} />
    </>
  )
}
