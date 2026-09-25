import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Config, FilterState, SortRule } from '../types'
import { api } from '../api'
import { Toasts, useToasts } from '../components/Toasts'
import { useDebouncedValue, useLocalState, useSessionState } from '../hooks/storage'
import { buildComparison } from '../lib/comparison'
import { defaultFilters, matchesFilters } from '../lib/filters'
import { statsFor, summarizeStats } from '../lib/stats'
import { COLUMNS, COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS, comparisonSearchText, filterable, sortBy, sortValue, tableRows, toggleSort } from '../lib/table'
import { writeQuery, type DashboardQuery } from '../lib/urlState'
import { ComparisonTable, type ComparisonRow } from './components/ComparisonTable'
import { PngExportModal } from './components/PngExportModal'
import { ResultsTable } from './components/ResultsTable'
import { SettingsModal } from './components/SettingsModal'
import { StatsPanel } from './components/StatsPanel'
import { Toolbar, type ExportFormat, type RunState } from './components/Toolbar'
import { isActive, useActiveRun, useComparison } from './useRunData'

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
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

  const rows = useMemo(() => {
    const all = tableRows(data?.results ?? [], new Set(searchColumns))
    const visible = all.filter((r) => (!debouncedSearch || r.searchText.includes(debouncedSearch)) && matchesFilters(filters, r))
    return sortBy(visible, sort, (r, col) => sortValue(r.result, r.row, col))
  }, [data, debouncedSearch, filters, searchColumns, sort])

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    if (!comparison.comparing) return []
    const columns = new Set(searchColumns)
    const visible = buildComparison(comparison.runs, comparison.data)
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => (!debouncedSearch || comparisonSearchText(entry, comparison.runs, columns).includes(debouncedSearch))
        && Object.values(entry.byRun).some(({ row }) => matchesFilters(filters, filterable(row))))
    return sortBy(visible, sort, (entry, col) => {
      const runId = col.startsWith('output-') ? col.slice(7) : comparison.runs.find((r) => entry.byRun[r.runId])?.runId
      const match = runId ? entry.byRun[runId] : undefined
      return sortValue(match?.row.result, entry, col.startsWith('output-') ? 'output' : col)
    })
  }, [comparison, debouncedSearch, filters, searchColumns, sort])

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

  const stats = summarizeStats(data)
  const filtered = filtering && !comparison.comparing ? statsFor(rows.map((r) => r.row)) : null
  const visibleKeys = new Set(comparisonRows.map((r) => r.key))
  const comparisonStats = Object.fromEntries(comparison.runs.map((run) => [
    run.runId,
    statsFor(comparisonRows.flatMap((row) => (row.byRun[run.runId] && visibleKeys.has(row.key) ? [row.byRun[run.runId].row] : []))),
  ]))
  const selectedIndices = [...selected].sort((a, b) => a - b)
  const runState: RunState = comparison.comparing ? 'compare' : data.is_paused && isActive(data) ? 'paused' : isActive(data) ? 'running' : 'idle'

  const exportAs = async (format: ExportFormat) => {
    if (format === 'png') return setModal({ kind: 'png' })
    if (format !== 'markdown') {
      window.location.href = api.exportUrl(data.run_id, format)
      return
    }
    const chips = filtered?.chips ?? stats.chips
    const payload = {
      visible_indices: rows.map((r) => r.index),
      visible_columns: COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k)),
      stats: { total: stats.total, filtered: comparison.comparing ? comparisonRows.length : rows.length, avgLatency: filtered?.avgLatency ?? stats.avgLatency, chips },
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
      <Toolbar
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
      <main className="flex-1 overflow-auto px-4 py-4">
        <StatsPanel
          stats={stats}
          sessionName={data.session_name}
          runName={data.run_name}
          runId={data.run_id}
          chips={filtered?.chips ?? stats.chips}
          filteredCount={filtered ? rows.length : null}
          sessionRuns={sessionRuns}
          onRename={(name) => act(() => (data.results.some((r) => r.result.status !== 'not_started') ? api.rename(data.run_id, name) : api.setPendingRunName(name)), 'Rename failed')}
          onRenameRun={(runId, name) => act(() => api.rename(runId, name), 'Rename failed')}
          onSelectRun={(runId) => runId !== data.run_id && act(() => api.activate(runId), 'Could not open run')}
          onNewRun={() => act(async () => {
            await api.newRun()
            setSelected(new Set())
          }, 'New run failed')}
          onCompare={(runId) => comparison.start([data.run_id, runId])}
          comparison={comparison.comparing ? { runs: comparison.runs, stats: comparisonStats, onMove: comparison.move, onRemove: comparison.remove, onAdd: comparison.add } : undefined}
        />
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
          onToggleTheme={() => {
            const dark = document.documentElement.classList.toggle('dark')
            localStorage.setItem('ezvals:theme', dark ? 'dark' : 'light')
          }}
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
        displayChips={filtered?.chips ?? stats.chips}
        displayLatency={filtered?.avgLatency ?? stats.avgLatency}
        displayFilteredCount={filtered ? rows.length : null}
        totalTests={stats.total}
        isComparisonMode={comparison.comparing}
        normalizedComparisonRuns={comparison.runs}
        comparisonData={comparison.data}
        sessionName={data.session_name ?? ''}
      />
      <Toasts toasts={toasts} />
    </div>
  )
}
