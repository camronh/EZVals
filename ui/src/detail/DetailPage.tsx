import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ResultDetail, RunSummary, Score } from '../types'
import { api } from '../api'
import { DataViewer } from '../components/DataViewer'
import { resultKey, withColors } from '../lib/comparison'
import { outcomeOf } from '../lib/stats'
import { ComparisonView, type ComparedRun } from './components/ComparisonView'
import { DetailHeader } from './components/DetailHeader'
import { PageMessage } from '../components/Spinner'
import { Banner, DataPanel, Drawer, ResizeHandle, Verdict } from './components/Panels'
import { Sidebar } from './components/Sidebar'
import { useResizableLayout } from './useResizableLayout'

export type DetailRoute = { runId: string; index: number; compareRunIds: string[] }

const finished = (detail: ResultDetail) => ['completed', 'error', 'cancelled'].includes(detail.result.result.status ?? 'completed')

/** One result: its verdict, the input, output and reference panes, a sidebar of scores and metadata, and a drawer for messages. */
export function DetailPage({ runId, index: startIndex, compareRunIds }: DetailRoute) {
  const [index, setIndex] = useState(startIndex)
  const [detail, setDetail] = useState<ResultDetail | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [compared, setCompared] = useState<ComparedRun[] | null>(null)
  const [busy, setBusy] = useState<'rerun' | 'regrade' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'messages' | null>(null)
  const [editing, setEditing] = useState(false)
  const { layout, container, start } = useResizableLayout()
  const comparing = compareRunIds.length > 1
  const query = comparing ? `?${new URLSearchParams(compareRunIds.map((id) => ['compare_run_id', id]))}` : ''
  // Back to the dashboard with this result open in its review panel (or to the comparison it came from).
  const back = comparing ? `/${query}` : `/?run_id=${encodeURIComponent(runId)}&result=${index}`

  // Results by index, fetched ahead so stepping to the next one shows it at once. Each is refetched when shown.
  const results = useRef(new Map<number, Promise<ResultDetail>>())
  const fetchResult = useCallback((i: number) => {
    const next = api.result(runId, i)
    results.current.set(i, next)
    next.catch(() => results.current.delete(i))
    return next
  }, [runId])
  // Other runs' data for comparison, fetched once per page.
  const runs = useRef(new Map<string, Promise<RunSummary | null>>())
  const runData = useCallback((id: string) => {
    if (!runs.current.has(id)) runs.current.set(id, api.runData(id).catch(() => null))
    return runs.current.get(id)!
  }, [])

  // Step through results in place: the URL follows (so reload and Back work) but the page doesn't reload.
  const navigate = useCallback((i: number) => {
    history.pushState(null, '', `/runs/${runId}/results/${i}${query}`)
    setIndex(i)
    setDrawer(null)
    setActionError(null)
  }, [query, runId])
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/\/results\/(\d+)/)
      if (match) setIndex(Number(match[1]))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    let current = true
    const show = (d: ResultDetail) => {
      if (!current) return
      setDetail(d)
      document.title = `${d.result.function} · EZVals`
    }
    results.current.get(index)?.then(show, () => {})
    fetchResult(index).then(show, (err) => current && setError(err))
    return () => { current = false }
  }, [fetchResult, index])

  useEffect(() => {
    if (!detail) return
    for (const i of [detail.index + 1, detail.index - 1]) {
      if (i >= 0 && i < detail.total && !results.current.has(i)) fetchResult(i)
    }
  }, [detail, fetchResult])

  useEffect(() => {
    if (!detail || !comparing) return
    const key = resultKey(detail.result)
    Promise.all(withColors(compareRunIds.map((id) => ({ runId: id }))).map(async (run): Promise<ComparedRun> => {
      if (run.runId === detail.run_id) return { ...run, runName: detail.run_name ?? run.runId, match: { row: detail.result, index: detail.index } }
      const data = await runData(run.runId)
      const i = data?.results.findIndex((r) => resultKey(r) === key) ?? -1
      return { ...run, runName: data?.run_name ?? run.runId, match: i >= 0 ? { row: data!.results[i], index: i } : null }
    })).then(setCompared)
  }, [compareRunIds, comparing, detail, runData])

  // A layout effect, so the keys work as soon as the result is on screen.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || !detail || e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (drawer) setDrawer(null)
        else window.location.href = back
      } else if (e.key === 'ArrowUp' && index > 0) navigate(index - 1)
      else if (e.key === 'ArrowDown' && index < detail.total - 1) navigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, detail, drawer, editing, index, navigate])

  const runAgain = async (kind: 'rerun' | 'regrade') => {
    setBusy(kind)
    setActionError(null)
    try {
      await (kind === 'rerun' ? api.run([index], null, runId) : api.regrade([index], runId))
      let next = await fetchResult(index)
      setDetail(next)
      while (!finished(next)) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        next = await fetchResult(index)
        setDetail(next)
      }
    } catch (err) {
      setActionError(`Couldn't ${kind === 'rerun' ? 'rerun' : 'regrade'} this result: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const save = async (patch: { annotation?: string | null; scores?: Score[] }) => {
    await api.updateResult(detail!.run_id, index, patch)
    const next = { ...detail!, result: { ...detail!.result, result: { ...detail!.result.result, ...patch } } }
    results.current.set(index, Promise.resolve(next))
    setDetail(next)
  }

  if (error) return <PageMessage title="Couldn't load this result">Check that <code className="font-mono">ezvals serve</code> is still running, then refresh the page.</PageMessage>
  if (!detail) return <PageMessage loading title="Loading result…" />

  const row = detail.result
  const r = row.result
  const loading = !!busy || r.status === 'pending' || r.status === 'running'
  const messages = Array.isArray(r.trace_data?.messages) ? r.trace_data.messages : []

  return (
    <div className="flex h-screen flex-col bg-canvas p-2 font-sans text-fg">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
        <DetailHeader
          name={row.function}
          outcome={comparing ? undefined : outcomeOf(r)}
          trial={row.trial}
          sessionName={detail.session_name}
          run={{ id: detail.run_id, name: detail.run_name }}
          back={back}
          runCommand={detail.eval_path ? `ezvals run ${detail.eval_path}::${row.function}` : `ezvals run ${row.function}`}
          position={detail}
          onNavigate={navigate}
          busy={busy}
          onRerun={comparing ? undefined : () => runAgain('rerun')}
          onRegrade={comparing || !row.regradable || r.status !== 'completed' ? undefined : () => runAgain('regrade')}
        />
        {actionError ? <Banner tone="danger" icon="alert" title={actionError} /> : null}
        {comparing ? null : <Verdict result={r} />}
        <div key={detail.index} ref={container} id="detail-body" className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden">
          <div id="main-panel" className="flex min-w-0 flex-col max-md:flex-none md:flex-1">
            {comparing ? (
              compared ? <ComparisonView runs={compared} base={row} layout={layout} onResize={start} /> : null
            ) : (
              <div id="io-row" className="flex min-h-0 flex-1 flex-col md:flex-row">
                <DataPanel id="input-panel" tone="input" value={r.input} className="max-md:min-h-[8rem] max-md:flex-none md:w-[var(--input-width)]" style={{ '--input-width': `${layout.inputWidth}%` } as CSSProperties} />
                <ResizeHandle direction="col" onMouseDown={start('inputWidth')} />
                <div id="output-column" className="flex min-w-0 flex-1 flex-col max-md:border-t max-md:border-line">
                  <DataPanel id="output-panel" tone="output" value={r.output} loading={loading} className="flex-1 max-md:min-h-[12rem] max-md:flex-none" />
                  {r.reference != null ? (
                    <>
                      <ResizeHandle direction="row" onMouseDown={start('refHeight')} />
                      <DataPanel id="ref-panel" tone="reference" value={r.reference} className="flex-shrink-0 max-md:min-h-[6rem] max-md:border-t max-md:border-line md:h-[var(--ref-height)] md:min-h-[60px]" style={{ '--ref-height': `${layout.refHeight}px` } as CSSProperties} />
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          {comparing ? null : (
            <>
              <ResizeHandle direction="col" onMouseDown={start('sidebarWidth')} />
              <div id="sidebar-column" style={{ '--sidebar-width': `${layout.sidebarWidth}px` } as CSSProperties} className="flex min-h-0 flex-col max-md:flex-none max-md:border-t max-md:border-line md:w-[var(--sidebar-width)] md:min-w-[200px]">
                <Sidebar
                  row={row}
                  runId={detail.run_id}
                  onSaveAnnotation={(annotation) => save({ annotation })}
                  onSaveScores={(scores) => save({ scores })}
                  onOpenMessages={() => setDrawer('messages')}
                  onEditingChange={setEditing}
                />
              </div>
            </>
          )}
        </div>
      </div>
      <Drawer id="messages-pane" title="Messages" count={messages.length} open={drawer === 'messages'} onClose={() => setDrawer(null)}>
        <div className="p-4"><DataViewer content={messages} placeholder="—" /></div>
      </Drawer>
    </div>
  )
}
