import type { MouseEvent } from 'react'
import type { ComparisonRun, RunResultRow } from '../../types'
import { DataViewer } from '../../components/DataViewer'
import { ScoreBadges } from '../../components/ScoreBadges'
import { StatusIcon } from '../../dashboard/components/ResultsTable'
import { errorSummary } from '../../lib/format'
import { outcomeOf } from '../../lib/stats'
import type { Layout } from '../useResizableLayout'
import { DataPanel, ResizeHandle } from './Panels'

export type ComparedRun = ComparisonRun & { match: { row: RunResultRow; index: number } | null }

type Props = {
  runs: ComparedRun[]
  base: RunResultRow
  layout: Layout
  onResize: (handle: 'comparisonInputWidth' | 'comparisonContextHeight') => (e: MouseEvent) => void
}

/** One output card per compared run above the shared input and reference. */
export function ComparisonView({ runs, base, layout, onResize }: Props) {
  const hasReference = base.result.reference != null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div id="comparison-outputs" className="min-h-0 flex-1 overflow-auto bg-surface-subtle p-4">
        <div className="grid min-h-full grid-cols-1 gap-3 lg:grid-cols-2">
          {runs.map((run) => {
            const r = run.match?.row.result
            return (
              <div key={run.runId} className="comparison-output-card flex min-h-[220px] flex-col overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex h-10 items-center justify-between gap-3 border-b border-line px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: run.color }} />
                    <span className="truncate text-sm font-medium text-fg">{run.runName}</span>
                    {r ? <StatusIcon outcome={outcomeOf(r)} /> : null}
                  </div>
                  {run.match ? (
                    <a href={`/runs/${run.runId}/results/${run.match.index}?mode=single`} className="link shrink-0 text-xs">
                      Open detail
                    </a>
                  ) : <span className="shrink-0 text-xs text-fg-muted">Not in this run</span>}
                </div>
                <div className="data-panel-body flex-1 overflow-auto p-3 text-fg"><DataViewer content={r?.output} placeholder="—" /></div>
                {r?.error ? <div className="border-t border-line bg-danger-subtle px-3 py-1.5 font-mono text-xs text-danger" title={r.error}>{errorSummary(r.error)}</div> : null}
                <div className="border-t border-line px-3 py-2">
                  <ScoreBadges scores={r?.scores ?? []} latency={r?.latency} annotation={r?.annotation} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <ResizeHandle direction="row" onMouseDown={onResize('comparisonContextHeight')} />
      <div id="comparison-context" className="flex flex-shrink-0 flex-col bg-surface" style={{ height: layout.comparisonContextHeight, minHeight: 120 }}>
        {base.dataset || base.labels?.length ? (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <span className="text-xs text-fg-muted">{base.dataset}</span>
            {base.labels?.map((l) => <span key={l} className="chip">{l}</span>)}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <DataPanel id="comparison-input-panel" tone="input" value={base.result.input} className={hasReference ? '' : 'flex-1'} style={hasReference ? { width: `${layout.comparisonInputWidth}%` } : undefined} />
          {hasReference ? (
            <>
              <ResizeHandle direction="col" onMouseDown={onResize('comparisonInputWidth')} />
              <DataPanel id="comparison-reference-panel" tone="reference" value={base.result.reference} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
