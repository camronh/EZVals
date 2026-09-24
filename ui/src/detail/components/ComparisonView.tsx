import type { MouseEvent } from 'react'
import type { ComparisonRun, RunResultRow } from '../../types'
import { DataViewer } from '../../components/DataViewer'
import { ScoreBadges } from '../../components/ScoreBadges'
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
      <div id="comparison-outputs" className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-h-full grid-cols-1 gap-3 lg:grid-cols-2">
          {runs.map((run) => {
            const r = run.match?.row.result
            return (
              <div key={run.runId} className="comparison-output-card flex min-h-[220px] flex-col overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: run.color }} />
                    <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">{run.runName}</span>
                    <span className="text-[10px] text-zinc-400">{r?.status ?? '—'}</span>
                  </div>
                  {run.match ? (
                    <a href={`/runs/${run.runId}/results/${run.match.index}?mode=single`} title="Open detail" className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-blue-300 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:text-blue-300">
                      Open detail
                    </a>
                  ) : <span className="text-[10px] text-zinc-400">No match</span>}
                </div>
                <div className="data-panel-body flex-1 overflow-auto p-3"><DataViewer content={r?.output} placeholder="—" /></div>
                {r?.error ? <div className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">Error: {r.error}</div> : null}
                <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <ScoreBadges scores={r?.scores ?? []} latency={r?.latency} annotation={r?.annotation} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <ResizeHandle direction="row" onMouseDown={onResize('comparisonContextHeight')} />
      <div id="comparison-context" className="flex flex-shrink-0 flex-col border-t border-blue-100 bg-white dark:border-zinc-800 dark:bg-zinc-900" style={{ height: layout.comparisonContextHeight, minHeight: 120 }}>
        {base.dataset || base.labels?.length ? (
          <div className="flex items-center gap-2 border-b border-blue-100 px-3 py-1.5 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500">{base.dataset}</span>
            {base.labels?.map((l) => <span key={l} className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{l}</span>)}
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
