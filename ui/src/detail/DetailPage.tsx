import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ResultDetail, Score } from '../types'
import { api } from '../api'
import { DataViewer } from '../components/DataViewer'
import { TraceWaterfall } from '../components/TraceWaterfall'
import { resultKey, withColors } from '../lib/comparison'
import { ComparisonView, type ComparedRun } from './components/ComparisonView'
import { DetailHeader } from './components/DetailHeader'
import { DataPanel, Drawer, ErrorBanner, ResizeHandle } from './components/Panels'
import { Sidebar } from './components/Sidebar'
import { useResizableLayout } from './useResizableLayout'

export type DetailRoute = { runId: string; index: number; compareRunIds: string[] }

const finished = (detail: ResultDetail) => ['completed', 'error', 'cancelled'].includes(detail.result.result.status ?? 'completed')

/** One result: input, reference and output panes, a sidebar of scores and metadata, and drawers for messages and spans. */
export function DetailPage({ runId, index, compareRunIds }: DetailRoute) {
  const [detail, setDetail] = useState<ResultDetail | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [compared, setCompared] = useState<ComparedRun[] | null>(null)
  const [busy, setBusy] = useState<'rerun' | 'regrade' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'messages' | 'trace' | null>(null)
  const [editing, setEditing] = useState(false)
  const { layout, container, start } = useResizableLayout()
  const comparing = compareRunIds.length > 1
  const query = comparing ? `?${new URLSearchParams(compareRunIds.map((id) => ['compare_run_id', id]))}` : ''
  const navigate = useCallback((i: number) => { window.location.href = `/runs/${runId}/results/${i}${query}` }, [query, runId])

  useEffect(() => {
    document.title = 'Result Detail - EZVals'
    api.result(runId, index).then(setDetail, setError)
  }, [index, runId])

  useEffect(() => {
    if (!detail || !comparing) return
    const key = resultKey(detail.result)
    Promise.all(withColors(compareRunIds.map((id) => ({ runId: id }))).map(async (run): Promise<ComparedRun> => {
      if (run.runId === detail.run_id) return { ...run, runName: detail.run_name ?? run.runId, match: { row: detail.result, index: detail.index } }
      const data = await api.runData(run.runId).catch(() => null)
      const i = data?.results.findIndex((r) => resultKey(r) === key) ?? -1
      return { ...run, runName: data?.run_name ?? run.runId, match: i >= 0 ? { row: data!.results[i], index: i } : null }
    })).then(setCompared)
  }, [compareRunIds, comparing, detail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || !detail || e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (drawer) setDrawer(null)
        else window.location.href = '/'
      } else if (e.key === 'ArrowUp' && detail.index > 0) navigate(detail.index - 1)
      else if (e.key === 'ArrowDown' && detail.index < detail.total - 1) navigate(detail.index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, drawer, editing, navigate])

  const runAgain = async (kind: 'rerun' | 'regrade') => {
    setBusy(kind)
    setActionError(null)
    try {
      await (kind === 'rerun' ? api.run([index], null, runId) : api.regrade([index], runId))
      let next = await api.result(runId, index)
      setDetail(next)
      while (!finished(next)) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        next = await api.result(runId, index)
        setDetail(next)
      }
    } catch (err) {
      setActionError(`${kind === 'rerun' ? 'Rerun' : 'Regrade'} failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const save = async (patch: { annotation?: string | null; scores?: Score[] }) => {
    await api.updateResult(detail!.run_id, index, patch)
    setDetail((d) => d && { ...d, result: { ...d.result, result: { ...d.result.result, ...patch } } })
  }

  if (error) return <div className="p-4 text-zinc-500 dark:text-zinc-400">Failed to load result.</div>
  if (!detail) return <div className="flex h-screen items-center justify-center text-zinc-500 dark:text-zinc-400">Loading...</div>

  const row = detail.result
  const r = row.result
  const loading = !!busy || r.status === 'pending' || r.status === 'running'
  const messages = Array.isArray(r.trace_data?.messages) ? r.trace_data.messages : []

  return (
    <div className="flex h-screen flex-col bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
      <DetailHeader
        name={row.function}
        trial={row.trial}
        runCommand={detail.eval_path ? `ezvals run ${detail.eval_path}::${row.function}` : `ezvals run ${row.function}`}
        position={detail}
        onNavigate={navigate}
        busy={busy}
        onRerun={comparing ? undefined : () => runAgain('rerun')}
        onRegrade={comparing || !row.regradable || r.status !== 'completed' ? undefined : () => runAgain('regrade')}
      />
      {actionError ? <ErrorBanner error={actionError} /> : null}
      {r.error ? <ErrorBanner error={r.error} /> : null}
      <div ref={container} id="detail-body" className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden">
        <div id="main-panel" className="flex min-w-0 flex-col max-md:flex-none md:flex-1">
          {comparing ? (
            compared ? <ComparisonView runs={compared} base={row} layout={layout} onResize={start} /> : null
          ) : (
            <div id="io-row" className="flex min-h-0 flex-1 flex-col md:flex-row">
              <div id="input-column" className="flex min-w-0 flex-col md:w-[var(--input-width)]" style={{ '--input-width': `${layout.inputWidth}%` } as CSSProperties}>
                <DataPanel id="input-panel" tone="input" value={r.input} className="flex-1 max-md:min-h-[8rem] max-md:flex-none" />
                {r.reference != null ? (
                  <>
                    <ResizeHandle direction="row" onMouseDown={start('refHeight')} />
                    <DataPanel id="ref-panel" tone="reference" value={r.reference} className="flex-shrink-0 max-md:min-h-[6rem] md:h-[var(--ref-height)] md:min-h-[60px]" style={{ '--ref-height': `${layout.refHeight}px` } as CSSProperties} />
                  </>
                ) : null}
              </div>
              <ResizeHandle direction="col" onMouseDown={start('inputWidth')} />
              <DataPanel id="output-panel" tone="output" value={r.output} loading={loading} className="flex-1 max-md:min-h-[12rem] max-md:flex-none" />
            </div>
          )}
        </div>
        {comparing ? null : (
          <>
            <ResizeHandle direction="col" onMouseDown={start('sidebarWidth')} />
            <div id="sidebar-column" style={{ '--sidebar-width': `${layout.sidebarWidth}px` } as CSSProperties} className="flex min-h-0 flex-col max-md:flex-none max-md:border-t max-md:border-blue-200/60 max-md:dark:border-zinc-800 md:w-[var(--sidebar-width)] md:min-w-[200px]">
              <Sidebar
                row={row}
                runId={detail.run_id}
                onSaveAnnotation={(annotation) => save({ annotation })}
                onSaveScores={(scores) => save({ scores })}
                onOpenMessages={() => setDrawer('messages')}
                onOpenTrace={() => setDrawer('trace')}
                onEditingChange={setEditing}
              />
            </div>
          </>
        )}
      </div>
      <Drawer id="messages-pane" title="Messages" count={messages.length} open={drawer === 'messages'} onClose={() => setDrawer(null)}>
        <div className="p-2"><DataViewer content={messages} placeholder="—" /></div>
      </Drawer>
      <Drawer id="trace-pane" title="Spans" count={row.spans?.length ?? 0} open={drawer === 'trace'} onClose={() => setDrawer(null)}>
        <TraceWaterfall spans={row.spans ?? []} />
      </Drawer>
    </div>
  )
}
