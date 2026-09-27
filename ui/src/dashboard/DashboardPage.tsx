import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Config, FilterState, OutcomeFilter, SortRule } from '../types'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { Drawer } from '../detail/components/Panels'
import { DataViewer } from '../components/DataViewer'
import { PageMessage } from '../components/Spinner'
import { Toasts, useToasts } from '../components/Toasts'
import { useDebouncedValue, useLocalState, useSessionState } from '../hooks/storage'
import { buildComparison } from '../lib/comparison'
import { defaultFilters, matchesFilters, type FilterableRow } from '../lib/filters'
import { passRate, runProgress, statsFor, trialStats, extraChips } from '../lib/stats'
import { formatRunTimestamp } from '../lib/format'
import { COLUMNS, COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS, comparisonSearchText, filterable, sortBy, sortValue, tableRows, toggleSort } from '../lib/table'
import { writeQuery, type DashboardQuery } from '../lib/urlState'
import { ComparisonTable, type ComparisonRow } from './components/ComparisonTable'
import { PngExportModal } from './components/PngExportModal'
import { ResultsTable } from './components/ResultsTable'
import { FilterBar, type ExportFormat } from './components/FilterBar'
import { Header, type RunState } from './components/Header'
import { ResultPanel } from './components/ResultPanel'
import { RunsSidebar } from './components/RunsSidebar'
import { SettingsModal } from './components/SettingsModal'
import { StatsPanel } from './components/StatsPanel'
import { isActive, useActiveRun, useComparison } from './useRunData'

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const OUTCOME_ONLY = (['all', 'failed', 'errors'] as const).map((outcome) => ({ ...defaultFilters(), outcome }))

function countOutcomes(groups: FilterableRow[][]) {
  return Object.fromEntries(OUTCOME_ONLY.map((f) => [f.outcome, groups.filter((g) => g.some((row) => matchesFilters(f, row))).length])) as Record<OutcomeFilter, number>
}

function notifyCompletion(runName: string, count: number) {
  const show = () => new Notification(`${runName} complete`, { body: `${count} eval${count === 1 ? '' : 's'} finished`, icon: '/logo.png' })
  if (Notification.permission === 'granted') show()
  else if (Notification.permission === 'default') Notification.requestPermission().then((p) => p === 'granted' && show())
}

/** The results dashboard: the runs sidebar, then the active run's header, summary, filter bar and table, with a review panel for the open result. */
export function DashboardPage({ query }: { query: DashboardQuery }) {
  const { toasts, notify } = useToasts()
  const [filters, setFilters] = useSessionState<FilterState>('ezvals:filters', defaultFilters, query.filters)
  const [search, setSearch] = useSessionState('ezvals:search', '', query.search)
  const [searchColumns, setSearchColumns] = useLocalState('ezvals:search_columns', COLUMN_KEYS, query.searchColumns)
  const [hidden, setHidden] = useLocalState('ezvals:hidden_columns', DEFAULT_HIDDEN_COLUMNS)
  const [widths, setWidths] = useLocalState<Record<string, number>>('ezvals:col_widths', {})
  const [sort, setSort] = useState<SortRule[]>(query.sort)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ kind: 'settings'; config: Config } | { kind: 'png' } | null>(null)
  const [configs, setConfigs] = useState<{ names: string[]; active: string | null }>({ names: [], active: null })
  const [reloading, setReloading] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(query.result)
  const [panelEditing, setPanelEditing] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  // Only a click on the toggle is remembered; until then the sidebar shows on wide screens.
  const [sidebarChoice, setSidebarChoice] = useLocalState<boolean | null>('ezvals:sidebar', null)
  const sidebarOpen = sidebarChoice ?? matchMedia('(min-width: 1024px)').matches

  const comparisonIds = useRef(query.compareRunIds)
  const { data, sessionRuns, error, reload, patchResult } = useActiveRun(true)
  const comparison = useComparison(data, comparisonIds.current)
  const debouncedSearch = useDebouncedValue(search, 120).trim().toLowerCase()
  const filtering = debouncedSearch !== '' || JSON.stringify(filters) !== JSON.stringify(defaultFilters())

  useEffect(() => {
    document.title = 'EZVals'
    api.configs().then(setConfigs, () => {})
  }, [])

  // Opening a link to a specific run makes it the active one.
  const requestedRun = useRef(query.runId)
  useEffect(() => {
    if (data && requestedRun.current && requestedRun.current !== data.run_id) {
      api.activate(requestedRun.current).then(reload, () => {})
    }
    if (data) requestedRun.current = null
  }, [data, reload])

  useEffect(() => {
    if (!data) return
    const params = writeQuery(new URLSearchParams(window.location.search), { runId: data.run_id, compareRunIds: comparison.runs.map((r) => r.runId), search, searchColumns, filters, sort, result: openIndex })
    history.replaceState(null, '', params.size ? `?${params}` : window.location.pathname)
  }, [comparison.runs, data, filters, search, searchColumns, sort, openIndex])

  const wasActive = useRef<boolean | null>(null)
  useEffect(() => {
    if (!data) return
    const active = isActive(data)
    if (wasActive.current && !active && 'Notification' in window) {
      api.config().then((c) => c.completion_notifications && notifyCompletion(data.run_name ?? 'Run', data.total_evaluations ?? 0), () => {})
    }
    wasActive.current = active
  }, [data])

  // Rows matching everything but the outcome switch, so each outcome can show its count.
  const { rows, outcomeCounts } = useMemo(() => {
    const matching = tableRows(data?.results ?? [], new Set(searchColumns))
      .filter((r) => (!debouncedSearch || r.searchText.includes(debouncedSearch)) && matchesFilters({ ...filters, outcome: 'all' }, r))
    return {
      rows: sortBy(matching.filter((r) => matchesFilters(filters, r)), sort, (r, col) => sortValue(r.result, r.row, col)),
      outcomeCounts: countOutcomes(matching.map((r) => [r])),
    }
  }, [data, debouncedSearch, filters, searchColumns, sort])

  useEffect(() => {
    if (openIndex == null || comparison.comparing || !data) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.defaultPrevented || panelEditing || messagesOpen || modal || target.closest('input, textarea, select, [role="menu"], [role="dialog"]')) return
      const at = rows.findIndex((r) => r.index === openIndex)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)]
        if (next) setOpenIndex(next.index)
      } else if (e.key === 'Escape') setOpenIndex(null)
      else if (e.key === 'Enter' && target === document.body) window.location.href = `/runs/${data.run_id}/results/${openIndex}`
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comparison.comparing, data, messagesOpen, modal, openIndex, panelEditing, rows])

  const comparisonView = useMemo(() => {
    if (!comparison.comparing) return null
    const columns = new Set(searchColumns)
    const matching = buildComparison(comparison.runs, comparison.data)
      .map((entry, index) => ({ ...entry, index, filterable: Object.values(entry.byRun).map(({ row }) => filterable(row)) }))
      .filter((entry) => (!debouncedSearch || comparisonSearchText(entry, comparison.runs, columns).includes(debouncedSearch))
        && entry.filterable.some((row) => matchesFilters({ ...filters, outcome: 'all' }, row)))
    const rows: ComparisonRow[] = sortBy(matching.filter((entry) => entry.filterable.some((row) => matchesFilters(filters, row))), sort, (entry, col) => {
      const runId = col.startsWith('output-') ? col.slice(7) : comparison.runs.find((r) => entry.byRun[r.runId])?.runId
      const match = runId ? entry.byRun[runId] : undefined
      return sortValue(match?.row.result, entry, col.startsWith('output-') ? 'output' : col)
    })
    return { rows, outcomeCounts: countOutcomes(matching.map((entry) => entry.filterable)) }
  }, [comparison, debouncedSearch, filters, searchColumns, sort])
  const comparisonRows = comparisonView?.rows ?? []

  const facets = useMemo(() => {
    const results = comparison.comparing ? Object.values(comparison.data).flatMap((r) => r.results) : data?.results ?? []
    const scoreKeys: Record<string, { numeric: boolean; passed: boolean }> = {}
    for (const { result } of results) {
      for (const s of result.scores ?? []) {
        const meta = (scoreKeys[s.key] ??= { numeric: false, passed: false })
        if (typeof s.value === 'number') meta.numeric = true
        if (s.passed != null) meta.passed = true
      }
    }
    const sorted = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort()
    return { scoreKeys, datasets: sorted(results.map((r) => r.dataset)), labels: sorted(results.flatMap((r) => r.labels ?? [])) }
  }, [comparison, data])

  const saveAnnotation = useCallback(async (runId: string, index: number, annotation: string | null) => {
    await api.updateResult(runId, index, { annotation })
    if (runId === data?.run_id) patchResult(index, { annotation })
    else comparison.patchResult(runId, index, { annotation })
  }, [comparison, data?.run_id, patchResult])

  const act = useCallback(async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action()
    } catch (err) {
      notify(`${failure}: ${(err as Error).message}`)
    }
    await reload()
  }, [notify, reload])

  if (error && !data) return <PageMessage title="Couldn't load results">Check that <code className="font-mono">ezvals serve</code> is still running, then refresh the page.</PageMessage>
  if (!data) return <PageMessage loading title="Loading results…" />

  const keyOrder = (data.score_chips ?? []).map((c) => c.key)
  const statsRows = filtering ? rows.map((r) => r.row) : data.results
  const stats = statsFor(statsRows, keyOrder)
  const progress = runProgress(data)
  const comparisonStats = Object.fromEntries(comparison.runs.map((run) => [
    run.runId,
    statsFor(comparisonRows.flatMap((row) => (row.byRun[run.runId] ? [row.byRun[run.runId].row] : [])), keyOrder),
  ]))
  const previous = sessionRuns[sessionRuns.findIndex((r) => r.run_id === data.run_id) + 1]
  const previousRate = previous && passRate(previous.total_passed ?? 0, previous.total_failed ?? 0, previous.total_errors ?? 0)
  const delta = !progress.running && !filtering && stats.rate != null && previousRate != null && sessionRuns.some((r) => r.run_id === data.run_id)
    ? { points: Math.round(stats.rate * 100) - Math.round(previousRate * 100), previous: previous.run_name, onCompare: () => comparison.start([data.run_id, previous.run_id]) }
    : null
  const selectedIndices = [...selected].sort((a, b) => a - b)
  const trend = [...sessionRuns].reverse().slice(-12).flatMap((run) => {
    const current = run.run_id === data.run_id
    const rate = current ? statsFor(data.results).rate : passRate(run.total_passed ?? 0, run.total_failed ?? 0, run.total_errors ?? 0)
    return rate == null ? [] : [{ name: run.run_name, rate, current }]
  })
  // A run that hasn't started has no run file yet, so the session's runs don't include it.
  const runs = sessionRuns.some((r) => r.run_id === data.run_id) ? sessionRuns : [{ run_id: data.run_id, run_name: data.run_name ?? '' }, ...sessionRuns]
  const openRow = openIndex != null && !comparison.comparing ? data.results[openIndex] : undefined
  const openAt = rows.findIndex((r) => r.index === openIndex)
  const runState: RunState = comparison.comparing ? 'compare' : data.is_paused && isActive(data) ? 'paused' : isActive(data) ? 'running' : 'idle'

  const exportAs = async (format: ExportFormat) => {
    if (format === 'png') return setModal({ kind: 'png' })
    if (format !== 'markdown') {
      window.location.href = api.exportUrl(data.run_id, format)
      return
    }
    const payload = {
      visible_indices: rows.map((r) => r.index),
      visible_columns: COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k)),
      stats: { total: data.results.length, filtered: comparison.comparing ? comparisonRows.length : rows.length, avgLatency: stats.avgLatency, chips: stats.chips },
      run_name: data.run_name,
      session_name: data.session_name,
      comparison_mode: comparison.comparing,
      comparison_runs: comparison.runs.map((run) => ({
        run_id: run.runId,
        run_name: run.runName,
        chips: comparisonStats[run.runId].chips,
        avg_latency: comparisonStats[run.runId].avgLatency,
        results: comparisonRows.flatMap((row) => (row.byRun[run.runId] ? [row.byRun[run.runId].row] : [])),
      })),
    }
    try {
      download(await api.exportMarkdown(data.run_id, payload), `${comparison.comparing ? 'comparison' : data.run_id}.md`)
    } catch (err) {
      notify(`Couldn't export: ${(err as Error).message}`)
    }
  }

  return (
    <div className="flex h-screen bg-canvas font-sans text-fg">
      {sidebarOpen ? (
        <RunsSidebar
          sessionName={data.session_name}
          runs={runs}
          activeRunId={data.run_id}
          running={isActive(data)}
          comparing={comparison.comparing}
          reloading={reloading}
          onSelectRun={(runId) => {
            if (runId === data.run_id) return
            setOpenIndex(null)
            if (comparison.comparing) comparison.start([])
            act(() => api.activate(runId), "Couldn't open the run")
          }}
          onNewRun={() => act(async () => {
            await api.newRun()
            setSelected(new Set())
            setOpenIndex(null)
          }, "Couldn't start a new run")}
          onCompare={(runId) => comparison.start([data.run_id, runId])}
          onRenameRun={(runId, name) => act(() => (runId === data.run_id && !data.results.some((r) => r.result.status !== 'not_started') ? api.setPendingRunName(name) : api.rename(runId, name)), "Couldn't rename the run")}
          onDeleteRun={(runId) => act(() => api.deleteRun(runId), "Couldn't delete the run")}
          onReload={async () => {
            setReloading(true)
            await act(api.reloadServer, "Couldn't reload evals")
            setTimeout(() => window.location.reload(), 700)
          }}
          onOpenSettings={() => api.config().then((config) => setModal({ kind: 'settings', config }), (err) => notify(err.message))}
        />
      ) : null}
      <div className={`relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel ${sidebarOpen ? '' : 'ml-2'}`}>
        <Header
          runName={data.run_name}
          runId={data.run_id}
          meta={[`${data.results.length} eval${data.results.length === 1 ? '' : 's'}`, formatRunTimestamp(data.created_at)].filter(Boolean).join(' · ')}
          sessionRuns={sessionRuns}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarChoice(!sidebarOpen)}
          onRename={(name) => act(() => (data.results.some((r) => r.result.status !== 'not_started') ? api.rename(data.run_id, name) : api.setPendingRunName(name)), "Couldn't rename the run")}
          onCompare={(runId) => comparison.start([data.run_id, runId])}
          comparingCount={comparison.comparing ? comparison.runs.length : undefined}
          onExitCompare={() => {
            const first = comparison.runs[0].runId
            comparison.start([])
            if (first !== data.run_id) act(() => api.activate(first), "Couldn't open the run")
          }}
          onRegrade={() => act(async () => {
            const { regraded, skipped_without_target: skipped } = await api.regrade(selectedIndices.length ? selectedIndices : undefined)
            notify(`Regrading ${regraded} result${regraded === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped: no target)` : ''}`, 'success')
          }, "Couldn't regrade")}
          runState={runState}
          selectedCount={selected.size}
          onRun={() => act(() => api.run(selectedIndices.length ? selectedIndices : undefined, configs.active), "Couldn't start the run")}
          onStop={() => act(api.stop, "Couldn't stop the run")}
          onPauseToggle={() => act(data.is_paused ? api.resume : api.pause, "Couldn't pause or resume the run")}
        />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto px-5 pb-6 pt-5">
            {data.discovery_error ? (
              <div id="discovery-error" role="alert" className="mb-5 rounded-lg bg-danger-subtle">
                <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-danger"><Icon name="alert" />Couldn't load your evals</div>
                <p className="px-4 pt-0.5 text-sm text-fg-secondary">Fix the error below, then choose <span className="font-medium text-fg">Reload evals</span> in the sidebar.</p>
                <pre className="m-3 mt-2.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 font-mono text-xs leading-5 text-fg">{data.discovery_error}</pre>
              </div>
            ) : null}
            {data.results.length ? (
              <StatsPanel
                stats={stats}
                total={data.results.length}
                progress={progress}
                trials={trialStats(statsRows)}
                delta={delta}
                trend={trend}
                sessionRuns={sessionRuns}
                comparison={comparison.comparing ? { runs: comparison.runs, stats: comparisonStats, onMove: comparison.move, onRemove: comparison.remove, onAdd: comparison.add } : undefined}
              />
            ) : null}
            {data.results.length ? (
              <FilterBar
                outcomeCounts={comparisonView?.outcomeCounts ?? outcomeCounts}
                search={search}
                onSearch={setSearch}
                filters={filters}
                onFilters={setFilters}
                scoreKeys={facets.scoreKeys}
                datasets={facets.datasets}
                labels={facets.labels}
                hiddenColumns={hidden}
                searchColumns={searchColumns}
                onHiddenColumns={setHidden}
                onSearchColumns={setSearchColumns}
                onResetSort={() => setSort([])}
                onResetWidths={() => setWidths({})}
                onExport={exportAs}
                selectedCount={selected.size}
                onClearSelection={() => setSelected(new Set())}
              />
            ) : null}
            {comparison.comparing ? (
              <ComparisonTable runs={comparison.runs} rows={comparisonRows} onSort={(col, type, multi) => setSort(toggleSort(sort, col, type, multi))} onSaveAnnotation={saveAnnotation} />
            ) : data.discovery_error && !data.results.length ? null : (
              <ResultsTable
                runId={data.run_id}
                rows={rows}
                hidden={hidden}
                sort={sort}
                widths={widths}
                selected={selected}
                onSelect={setSelected}
                onSort={(col, type, multi) => setSort(toggleSort(sort, col, type, multi))}
                onWidths={setWidths}
                onOpen={setOpenIndex}
                current={openRow ? openIndex : null}
                onSaveAnnotation={saveAnnotation}
                oneMetric={!extraChips(data.score_chips ?? []).length}
                emptyText={filtering && data.results.length ? (
                  <>No results match the current filters. <button className="link font-medium" onClick={() => { setFilters(defaultFilters()); setSearch('') }}>Clear filters</button></>
                ) : undefined}
                evalPath={data.eval_path ?? data.path ?? undefined}
              />
            )}
          </main>
          {openRow ? (
            <ResultPanel
              key={openIndex}
              row={openRow}
              index={openIndex!}
              runId={data.run_id}
              position={{ index: Math.max(openAt, 0), total: rows.length }}
              onMove={(step) => { const next = rows[openAt + step]; if (next) setOpenIndex(next.index) }}
              onClose={() => setOpenIndex(null)}
              onSaveAnnotation={(annotation) => saveAnnotation(data.run_id, openIndex!, annotation)}
              onSaveScores={async (scores) => {
                await api.updateResult(data.run_id, openIndex!, { scores })
                patchResult(openIndex!, { scores })
              }}
              onOpenMessages={() => setMessagesOpen(true)}
              onEditingChange={setPanelEditing}
            />
          ) : null}
        </div>
      </div>
      <Drawer id="messages-pane" title="Messages" count={openRow?.result.trace_data?.messages?.length ?? 0} open={messagesOpen && !!openRow} onClose={() => setMessagesOpen(false)}>
        <div className="p-4"><DataViewer content={openRow?.result.trace_data?.messages ?? []} placeholder="—" /></div>
      </Drawer>
      {modal?.kind === 'settings' ? (
        <SettingsModal
          config={modal.config}
          configNames={configs.names}
          activeConfig={configs.active}
          onConfigSelect={(name) => act(async () => {
            await api.selectConfig(name)
            setConfigs({ ...configs, active: name })
          }, "Couldn't switch the run config")}
          onSave={(config) => act(async () => {
            await api.saveConfig(config)
            setModal(null)
          }, "Couldn't save settings")}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === 'png' ? (
        <PngExportModal
          onClose={() => setModal(null)}
          stats={stats}
          total={data.results.length}
          comparison={comparison.comparing ? { runs: comparison.runs, stats: comparisonStats } : undefined}
          sessionName={data.session_name ?? ''}
        />
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  )
}
