import type { ComparisonRun, ResultData, SortRule } from '../../types'
import { ScoreBadges } from '../../components/ScoreBadges'
import { useHoverPreview } from '../../hooks/useHoverPreview'
import type { ComparisonEntry } from '../../lib/comparison'
import { errorSummary } from '../../lib/format'
import { CellPreviewPopover, hasPreview, type PreviewColumn, type PreviewTarget } from './CellPreviewPopover'
import { AnnotationIndicator, EvalName, Value } from './ResultsTable'

export type ComparisonRow = ComparisonEntry & { index: number }

type Props = {
  runs: ComparisonRun[]
  rows: ComparisonRow[]
  onSort: (col: string, type: SortRule['type'], multi: boolean) => void
  onSaveAnnotation: (runId: string, index: number, annotation: string | null) => Promise<void>
}

const header = 'cursor-pointer select-none bg-surface px-3 py-2 text-left text-xs font-medium text-fg-muted hover:text-fg'
const empty = <span className="text-fg-muted">—</span>

/** One row per eval, one column per compared run. */
export function ComparisonTable({ runs, rows, onSort, onSaveAnnotation }: Props) {
  const preview = useHoverPreview<PreviewTarget>()
  const query = new URLSearchParams(runs.map((r) => ['compare_run_id', r.runId])).toString()
  const hover = (key: string, col: PreviewColumn, result: ResultData, runId: string, index: number) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget
      if (hasPreview(col, result)) preview.enter(key, () => ({ col, rect: el.getBoundingClientRect(), result, runId, index }))
    },
    onMouseLeave: preview.leave,
  })

  return (
    <>
      <table id="results-table" className="comparison-table w-full min-w-[760px] table-fixed border-collapse text-sm text-fg">
        <thead>
          <tr className="border-b border-line">
            {(['function', 'input', 'reference'] as const).map((col) => (
              <th key={col} data-col={col} style={{ width: '15%' }} className={header} onClick={(e) => onSort(col, 'string', e.shiftKey)}>
                {{ function: 'Eval', input: 'Input', reference: 'Reference' }[col]}
              </th>
            ))}
            {runs.map((run) => (
              <th
                key={run.runId}
                data-col={`output-${run.runId}`}
                style={{ width: `${Math.floor(50 / runs.length)}%`, borderLeft: `2px solid color-mix(in srgb, ${run.color} 45%, transparent)` }}
                className={`${header} comparison-output-header`}
                onClick={(e) => onSort(`output-${run.runId}`, 'string', e.shiftKey)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: run.color }} />
                  <span className="truncate">{run.runName}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {rows.map((row) => {
            const first = runs.map((r) => row.byRun[r.runId]).find(Boolean)
            const link = first ? `/runs/${runs.find((r) => row.byRun[r.runId])!.runId}/results/${first.index}?${query}` : null
            return (
              <tr
                key={row.key}
                data-row="main"
                data-row-id={row.index}
                data-compare-key={row.key}
                className={`group transition-colors hover:bg-surface-subtle ${link ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  if (link && !(e.target as HTMLElement).closest('a, input, [data-annotation-indicator]')) window.location.href = link
                }}
              >
                <td data-col="function" className="px-3 py-2.5 align-middle">
                  {link ? <a href={link} title={row.function} className="line-clamp-2 font-mono text-sm font-medium text-fg [overflow-wrap:anywhere] hover:underline"><EvalName name={row.function} /></a> : <span className="line-clamp-2 font-mono text-sm font-medium [overflow-wrap:anywhere]"><EvalName name={row.function} /></span>}
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-fg-muted">
                    {row.dataset ? <span className="dataset-chip mr-0.5 max-w-[160px] truncate">{row.dataset}</span> : null}
                    {row.labels?.map((l) => <span key={l} className="label-chip chip max-w-[140px] truncate">{l}</span>)}
                    {first?.row.trial ? <span className="trial-chip font-mono text-2xs">#{first.row.trial}</span> : null}
                  </div>
                </td>
                {(['input', 'reference'] as const).map((col) => (
                  <td key={col} data-col={col} className="px-3 py-2.5 align-middle" {...(first ? hover(`${row.key}:${col}`, col, first.row.result, '', first.index) : {})}>
                    {first?.row.result[col] != null ? <Value value={first.row.result[col]} /> : empty}
                  </td>
                ))}
                {runs.map((run) => {
                  const match = row.byRun[run.runId]
                  const style = { borderLeft: `2px solid color-mix(in srgb, ${run.color} 20%, transparent)` }
                  if (!match) return <td key={run.runId} data-col={`output-${run.runId}`} className="comparison-output-cell px-3 py-2.5 align-middle" style={style}>{empty}</td>
                  const r = match.row.result
                  const key = `${row.key}:${run.runId}`
                  return (
                    <td key={run.runId} data-col={`output-${run.runId}`} className="comparison-output-cell px-3 py-2.5 align-middle" style={style}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div {...hover(`${key}:output`, 'output', r, run.runId, match.index)}>{r.output != null ? <Value value={r.output} /> : r.error ? null : empty}</div>
                          {r.error ? <div className="line-clamp-2 font-mono text-xs leading-5 text-danger" {...hover(`${key}:error`, 'error', r, run.runId, match.index)}>{errorSummary(r.error)}</div> : null}
                        </div>
                        {r.annotation?.trim() ? (
                          <AnnotationIndicator
                            onEnter={(el) => preview.enter(`${key}:annotation`, () => ({ col: 'annotation', rect: el.getBoundingClientRect(), result: r, runId: run.runId, index: match.index }))}
                            onLeave={preview.leave}
                            onClick={(el) => preview.open(`${key}:annotation`, { col: 'annotation', rect: el.getBoundingClientRect(), result: r, runId: run.runId, index: match.index, editing: true })}
                          />
                        ) : null}
                      </div>
                      <div className="mt-2" data-preview-target="scores" {...hover(`${key}:scores`, 'scores', r, run.runId, match.index)}>
                        <ScoreBadges scores={r.scores ?? []} latency={r.latency} />
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <CellPreviewPopover target={preview.target} onKeep={preview.keep} onClose={preview.clear} onSaveAnnotation={onSaveAnnotation} />
    </>
  )
}
