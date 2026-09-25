import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Config, FilterState, OutcomeFilter, SortRule } from '../types'
import { api } from '../api'
import { Toasts, useToasts } from '../components/Toasts'
import { useDebouncedValue, useLocalState, useSessionState } from '../hooks/storage'
import { buildComparison } from '../lib/comparison'
import { defaultFilters, matchesFilters, type FilterableRow } from '../lib/filters'
import { passRate, runProgress, statsFor, trialStats, extraChips } from '../lib/stats'
import { COLUMNS, COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS, comparisonSearchText, filterable, sortBy, sortValue, tableRows, toggleSort } from '../lib/table'
import { writeQuery, type DashboardQuery } from '../lib/urlState'
import { ComparisonTable, type ComparisonRow } from './components/ComparisonTable'
import { PngExportModal } from './components/PngExportModal'
import { ResultsTable } from './components/ResultsTable'
import { FilterBar, type ExportFormat } from './components/FilterBar'
import { Header, type RunState } from './components/Header'
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

/** The results dashboard: toolbar, stats and the results (or comparison) table for the active run. */
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
    const params = writeQuery(new URLSearchParams(window.location.search), { runId: data.run_id, compareRunIds: comparison.runs.map((r) => r.runId), search, searchColumns, filters, sort })
    history.replaceState(null, '', params.size ? `?${params}` : window.location.pathname)
  }, [comparison.runs, data, filters, search, searchColumns, sort])

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

  if (error && !data) return <div className="p-4 text-theme-text-muted">Failed to load results. Please refresh the page.</div>
  if (!data) return <div className="flex h-screen items-center justify-center text-theme-text-muted">Loading...</div>

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
      notify(`Export failed: ${(err as Error).message}`)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-theme-bg font-sans text-theme-text">
      <Header
        sessionName={data.session_name}
        runName={data.run_name}
        runId={data.run_id}
        sessionRuns={sessionRuns}
        onRename={(name) => act(() => (data.results.some((r) => r.result.status !== 'not_started') ? api.rename(data.run_id, name) : api.setPendingRunName(name)), 'Rename failed')}
        onRenameRun={(runId, name) => act(() => api.rename(runId, name), 'Rename failed')}
        onDeleteRun={(runId) => act(() => api.deleteRun(runId), 'Delete failed')}
        onSelectRun={(runId) => runId !== data.run_id && act(() => api.activate(runId), 'Could not open run')}
        onNewRun={() => act(async () => {
          await api.newRun()
          setSelected(new Set())
        }, 'New run failed')}
        onCompare={(runId) => comparison.start([data.run_id, runId])}
        comparingCount={comparison.comparing ? comparison.runs.length : undefined}
        onExitCompare={() => {
          const first = comparison.runs[0].runId
          comparison.start([])
          if (first !== data.run_id) act(() => api.activate(first), 'Could not open run')
        }}
        onOpenSettings={() => api.config().then((config) => setModal({ kind: 'settings', config }), (err) => notify(err.message))}
        onRegrade={() => act(async () => {
          const { regraded, skipped_without_target: skipped } = await api.regrade(selectedIndices.length ? selectedIndices : undefined)
          notify(`Regrading ${regraded} result${regraded === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped: no target)` : ''}`, 'success')
        }, 'Regrade failed')}
        onReloadServer={async () => {
          setReloading(true)
          await act(api.reloadServer, 'Reload failed')
          setTimeout(() => window.location.reload(), 700)
        }}
        reloading={reloading}
        runState={runState}
        selectedCount={selected.size}
        onRun={() => act(() => api.run(selectedIndices.length ? selectedIndices : undefined, configs.active), 'Run failed')}
        onStop={() => act(api.stop, 'Stop failed')}
        onPauseToggle={() => act(data.is_paused ? api.resume : api.pause, 'Run control failed')}
      />
      <main className="flex-1 overflow-auto px-4 pb-4 pt-4">
        {data.discovery_error ? (
          <pre id="discovery-error" className="mb-4 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/30 bg-accent-error-bg p-3 font-mono text-xs text-accent-error">{data.discovery_error}</pre>
        ) : null}
        {data.results.length ? (
          <StatsPanel
            stats={stats}
            total={data.results.length}
            progress={progress}
            trials={trialStats(statsRows)}
            delta={delta}
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
        ) : (
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
            onOpen={(index) => { window.location.href = `/runs/${data.run_id}/results/${index}` }}
            onSaveAnnotation={saveAnnotation}
            oneMetric={!extraChips(data.score_chips ?? []).length}
            emptyText={filtering && data.results.length ? 'No results match the current filters' : undefined}
            evalPath={data.discovery_error ? undefined : data.eval_path ?? data.path ?? undefined}
          />
        )}
      </main>
      {modal?.kind === 'settings' ? (
        <SettingsModal
          config={modal.config}
          configNames={configs.names}
          activeConfig={configs.active}
          onConfigSelect={(name) => act(async () => {
            await api.selectConfig(name)
            setConfigs({ ...configs, active: name })
          }, 'Could not select config')}
          onSave={(config) => act(async () => {
            await api.saveConfig(config)
            setModal(null)
          }, 'Failed to save settings')}
          onClose={() => setModal(null)}
        />
      ) : null}
      <PngExportModal
        open={modal?.kind === 'png'}
        onClose={() => setModal(null)}
        displayChips={stats.chips}
        displayLatency={stats.avgLatency}
        displayFilteredCount={filtering ? rows.length : null}
        totalTests={data.results.length}
        isComparisonMode={comparison.comparing}
        normalizedComparisonRuns={comparison.runs}
        comparisonData={comparison.data}
        sessionName={data.session_name ?? ''}
      />
      <Toasts toasts={toasts} />
    </div>
  )
}
