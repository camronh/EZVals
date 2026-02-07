import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type {
  ColumnDef,
  ComparisonRun,
  Config,
  FilterState,
  NormalizedComparisonRun,
  RunButtonState,
  RunSummary,
  RunResultRow,
  Score,
  SessionRun,
  SortStateItem,
  StatsSummary,
} from '../types'
import {
  DEFAULT_HIDDEN_COLS,
  buildComparisonMatrix,
  compareValues,
  computeDatasetLabels,
  computeFilteredStats,
  computeScoreKeyMeta,
  defaultFilters,
  formatRunTimestamp,
  formatValue,
  getResultKey,
  isFilterActive,
  matchesFiltersForData,
  normalizeComparisonRuns,
  parseSortValue,
  summarizeStats,
  type ComparisonMatrixEntry,
} from './utils'
import { useDebouncedValue, useLocalStorageState, useSessionStorageState } from './hooks'
import DashboardIcons from './components/DashboardIcons'
import DashboardHeader from './components/DashboardHeader'
import StatsExpanded from './components/StatsExpanded'
import StatsCompact from './components/StatsCompact'
import SettingsModal from './components/SettingsModal'
import ComparisonTable from './components/ComparisonTable'
import ResultsTable from './components/ResultsTable'
import FloatingMenu from './components/FloatingMenu'

const DASHBOARD_BODY_CLASS = 'h-screen flex flex-col bg-theme-bg font-sans text-theme-text'

const PILL_TONES: Record<string, string> = {
  not_started: 'text-zinc-400 bg-zinc-500/10 border border-zinc-500/40',
  pending: 'text-blue-300 bg-blue-500/10 border border-blue-500/40',
  running: 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/40',
  completed: 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/40',
  error: 'text-rose-300 bg-rose-500/10 border border-rose-500/40',
  cancelled: 'text-amber-300 bg-amber-500/10 border border-amber-500/40',
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: 'function', label: 'Eval', width: '15%', type: 'string', align: 'left' },
  { key: 'input', label: 'Input', width: '18%', type: 'string', align: 'left' },
  { key: 'reference', label: 'Reference', width: '18%', type: 'string', align: 'left' },
  { key: 'output', label: 'Output', width: '18%', type: 'string', align: 'left' },
  { key: 'error', label: 'Error', width: '18%', type: 'string', align: 'left' },
  { key: 'scores', label: 'Scores', width: '140px', type: 'number', align: 'left' },
  { key: 'latency', label: 'Time', width: '70px', type: 'number', align: 'right' },
]

const RUN_MODE_KEY = 'ezvals:runMode'

type DashboardRow = {
  index: number
  function: string
  dataset: string
  labels: string[]
  result: NonNullable<RunResultRow['result']>
  scores: Score[]
  scoresSortValue: string | number
  hasUrl: boolean
  hasMessages: boolean
  hasError: boolean
  annotation: string
  searchText: string
}

type ComparisonRow = {
  key: string
  entry: ComparisonMatrixEntry
  index: number
  linkRunId?: string
  linkIndex?: number | null
  firstResult?: RunResultRow | null
  searchText: string
}

type ResizeState = { colKey: string; startX: number; startWidth: number }
type SettingsFormState = { concurrency: string; results_dir: string; timeout: string }

function hasRunningResults(data: RunSummary | null) {
  return (data?.results || []).some((r) => ['pending', 'running'].includes(r.result?.status))
}

function buildRowSearchText(row: RunResultRow) {
  const result = row.result || {}
  const scores = result.scores || []
  const parts = [
    row.function,
    row.dataset,
    ...(row.labels || []),
    result.input != null ? formatValue(result.input) : '',
    result.reference != null ? formatValue(result.reference) : '',
    result.output != null ? formatValue(result.output) : '',
    result.error || '',
    result.annotation || '',
    ...scores.map((s) => `${s.key} ${s.value ?? ''} ${s.passed ?? ''}`),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function buildComparisonSearchText(entry: ComparisonMatrixEntry, comparisonRuns: NormalizedComparisonRun[]) {
  const meta = entry?._meta as { function?: string; dataset?: string; labels?: string[] } | undefined
  const parts = [meta?.function, meta?.dataset, ...(meta?.labels || [])]
  comparisonRuns.forEach((run) => {
    const row = entry?.[run.runId] as RunResultRow | undefined
    const result = row?.result
    if (!result) return
    parts.push(
      result.input != null ? formatValue(result.input) : '',
      result.reference != null ? formatValue(result.reference) : '',
      result.output != null ? formatValue(result.output) : '',
      result.error || '',
      result.annotation || '',
    )
    ;(result.scores || []).forEach((s) => {
      parts.push(`${s.key} ${s.value ?? ''} ${s.passed ?? ''}`)
    })
  })
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function getRowSortValue(row: DashboardRow, col: string) {
  const result = row.result || {}
  if (col === 'function') return row.function || ''
  if (col === 'input') return formatValue(result.input)
  if (col === 'reference') return formatValue(result.reference)
  if (col === 'output') return formatValue(result.output)
  if (col === 'error') return result.error || ''
  if (col === 'scores') {
    const scores = result.scores || []
    if (!scores.length) return ''
    const first = scores[0]
    if (first.value != null) return typeof first.value === 'number' ? first.value : String(first.value)
    if (first.passed === true) return 1
    if (first.passed === false) return 0
    return ''
  }
  if (col === 'latency') return result.latency ?? ''
  return ''
}

function getComparisonSortValue(row: ComparisonRow, col: string) {
  if (col === 'function') return row.entry?._meta?.function || ''
  if (col === 'input') return formatValue(row.firstResult?.result?.input)
  if (col === 'reference') return formatValue(row.firstResult?.result?.reference)
  if (col.startsWith('output-')) {
    const runId = col.slice('output-'.length)
    const entry = row.entry?.[runId] as RunResultRow | undefined
    const result = entry?.result
    if (!result) return ''
    const scores = result.scores || []
    const scoreText = scores.map((s) => `${s.key}:${s.value ?? ''}`).join(' ')
    return `${formatValue(result.output)} ${result.error || ''} ${scoreText}`
  }
  return ''
}

export default function DashboardPage() {
  const [data, setData] = useState<RunSummary | null>(null)
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [comparisonData, setComparisonData] = useState<Record<string, RunSummary>>({})
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [runMenuOpen, setRunMenuOpen] = useState(false)
  const [runDropdownOpen, setRunDropdownOpen] = useState(false)
  const [compareDropdownOpen, setCompareDropdownOpen] = useState(false)
  const [addCompareOpen, setAddCompareOpen] = useState(false)
  const [editingRunName, setEditingRunName] = useState(false)
  const [runNameDraft, setRunNameDraft] = useState('')
  const [filters, setFilters] = useSessionStorageState<FilterState>('ezvals:filters', defaultFilters)
  const [search, setSearch] = useSessionStorageState<string>('ezvals:search', '')
  const [hiddenColumns, setHiddenColumns] = useLocalStorageState<string[]>('ezvals:hidden_columns', Array.from(DEFAULT_HIDDEN_COLS))
  const [colWidths, setColWidths] = useLocalStorageState<Record<string, number>>('ezvals:col_widths', {})
  const [statsExpanded, setStatsExpanded] = useLocalStorageState<boolean>('ezvals:statsExpanded', true)
  const [runMode, setRunMode] = useLocalStorageState<string>(RUN_MODE_KEY, 'rerun')
  const [comparisonRuns, setComparisonRuns] = useSessionStorageState<ComparisonRun[]>('ezvals:comparisonRuns', [])
  const [sortState, setSortState] = useState<SortStateItem[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [isRunningOverride, setIsRunningOverride] = useState(false)
  const [hasRunBefore, setHasRunBefore] = useState(false)
  const [animateStats, setAnimateStats] = useState(false)
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>({ concurrency: '', results_dir: '', timeout: '' })

  const filtersToggleRef = useRef<HTMLButtonElement | null>(null)
  const filtersMenuRef = useRef<HTMLDivElement | null>(null)
  const columnsToggleRef = useRef<HTMLButtonElement | null>(null)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const exportToggleRef = useRef<HTMLButtonElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const compareDropdownAnchorRef = useRef<HTMLButtonElement | null>(null)
  const addCompareAnchorRef = useRef<HTMLButtonElement | null>(null)
  const runDropdownExpandedRef = useRef<HTMLButtonElement | null>(null)
  const runDropdownCompactRef = useRef<HTMLButtonElement | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const lastCheckedRef = useRef<number | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const headerRefs = useRef<Record<string, HTMLElement | null>>({})

  const debouncedSearch = useDebouncedValue(search, 120)
  const normalizedComparisonRuns = useMemo(() => normalizeComparisonRuns(comparisonRuns), [comparisonRuns])
  const isComparisonMode = normalizedComparisonRuns.length > 1
  const comparisonMatrix = useMemo<Record<string, ComparisonMatrixEntry>>(() => buildComparisonMatrix(comparisonData), [comparisonData])
  const comparisonDataCount = useMemo(() => Object.keys(comparisonData).length, [comparisonData])
  const hasFilters = isFilterActive(filters, debouncedSearch)

  useEffect(() => {
    document.title = 'EZVals'
    document.body.className = DASHBOARD_BODY_CLASS
    return () => {
      document.body.className = ''
    }
  }, [])

  useEffect(() => {
    setComparisonRuns((prev) => {
      const normalized = normalizeComparisonRuns(prev)
      const same = JSON.stringify(normalized) === JSON.stringify(prev)
      return same ? prev : normalized
    })
  }, [setComparisonRuns])

  const loadResults = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const resp = await fetch('/results')
      if (!resp.ok) throw new Error('Failed to load results')
      const next = await resp.json() as RunSummary
      setData(next)
      setLoading(false)
      setError(null)
      setHasRunBefore((prev) => prev || (next.results || []).some((r) => r.result?.status && r.result.status !== 'not_started'))
      setComparisonData((prev) => ({ ...prev, [next.run_id]: next }))
      if (next.session_name) {
        const runsResp = await fetch(`/api/sessions/${encodeURIComponent(next.session_name)}/runs`)
        if (runsResp.ok) {
          const runsData = await runsResp.json() as { runs?: SessionRun[] }
          setSessionRuns(runsData.runs || [])
        }
      }
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error('Failed to load results')
      setError(nextError)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  useEffect(() => {
    if (!data) return
    const restored = normalizedComparisonRuns
    if (restored.length < 2) return

    let active = true
    async function fetchMissing() {
      for (const run of restored) {
        if (!active) return
        if (run.runId === data.run_id) {
          setComparisonData((prev) => ({ ...prev, [run.runId]: data }))
          continue
        }
        if (comparisonData[run.runId]) continue
        try {
          const resp = await fetch(`/api/runs/${encodeURIComponent(run.runId)}/data`)
          if (!resp.ok) continue
          const runData = await resp.json() as RunSummary
          setComparisonData((prev) => ({ ...prev, [run.runId]: runData }))
        } catch {
          // ignore fetch failures
        }
      }
    }

    fetchMissing()
    return () => { active = false }
  }, [data, normalizedComparisonRuns, comparisonData])

  useEffect(() => {
    if (!data || isComparisonMode) return undefined
    if (!hasRunningResults(data)) return undefined
    const timer = setTimeout(() => {
      loadResults(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [data, isComparisonMode, loadResults])

  useEffect(() => {
    if (!data) return
    if (!hasRunningResults(data)) setIsRunningOverride(false)
  }, [data])

  useEffect(() => {
    const savedY = sessionStorage.getItem('ezvals:scrollY')
    if (savedY != null) {
      window.scrollTo(0, parseInt(savedY, 10))
      sessionStorage.removeItem('ezvals:scrollY')
    }
    const params = new URLSearchParams(window.location.search)
    if (params.has('scroll')) {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!filtersOpen && !columnsOpen && !exportOpen && !runMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (filtersOpen && filtersMenuRef.current && !filtersMenuRef.current.contains(target) && !filtersToggleRef.current?.contains(target)) {
        setFiltersOpen(false)
      }
      if (columnsOpen && columnsMenuRef.current && !columnsMenuRef.current.contains(target) && !columnsToggleRef.current?.contains(target)) {
        setColumnsOpen(false)
      }
      if (exportOpen && exportMenuRef.current && !exportMenuRef.current.contains(target) && !exportToggleRef.current?.contains(target)) {
        setExportOpen(false)
      }
      if (runMenuOpen && !document.getElementById('run-dropdown-menu')?.contains(target) && !document.getElementById('run-dropdown-toggle')?.contains(target)) {
        setRunMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [filtersOpen, columnsOpen, exportOpen, runMenuOpen])

  const allResultsForFilters = useMemo(() => {
    if (isComparisonMode) {
      return Object.values(comparisonData).flatMap((run) => run?.results || [])
    }
    return data?.results || []
  }, [comparisonData, data, isComparisonMode])

  const scoreKeysMeta = useMemo(() => computeScoreKeyMeta(allResultsForFilters), [allResultsForFilters])
  const datasetLabels = useMemo(() => computeDatasetLabels(allResultsForFilters), [allResultsForFilters])

  const [selectedScoreKey, setSelectedScoreKey] = useState<string>('')

  useEffect(() => {
    if (!scoreKeysMeta.all.length) return
    if (!scoreKeysMeta.all.includes(selectedScoreKey)) {
      setSelectedScoreKey(scoreKeysMeta.all[0])
    }
  }, [scoreKeysMeta, selectedScoreKey])

  const rows = useMemo<DashboardRow[]>(() => {
    return (data?.results || []).map((r, index) => {
      const result = (r.result || {}) as NonNullable<RunResultRow['result']>
      const scores = (result.scores || []) as Score[]
      let scoresSortValue: string | number = ''
      if (scores.length) {
        const first = scores[0]
        if (first.value != null) scoresSortValue = typeof first.value === 'number' ? first.value : String(first.value)
        else if (first.passed === true) scoresSortValue = 1
        else if (first.passed === false) scoresSortValue = 0
      }
      return {
        index,
        function: r.function,
        dataset: r.dataset || '',
        labels: r.labels || [],
        result,
        scores,
        scoresSortValue,
        hasUrl: !!(result.trace_data?.trace_url),
        hasMessages: !!(result.trace_data?.messages?.length),
        hasError: !!result.error,
        annotation: result.annotation || '',
        searchText: buildRowSearchText(r),
      }
    })
  }, [data])

  const filteredRows = useMemo(() => {
    if (!rows.length) return []
    const q = debouncedSearch.trim().toLowerCase()
    return rows.filter((row) => {
      if (q && !row.searchText.includes(q)) return false
      return matchesFiltersForData(filters, row)
    })
  }, [rows, debouncedSearch, filters])

  const sortedRows = useMemo(() => {
    if (!sortState.length) return filteredRows
    const next = [...filteredRows]
    next.sort((a, b) => {
      for (const s of sortState) {
        const va = parseSortValue(getRowSortValue(a, s.col), s.type || 'string')
        const vb = parseSortValue(getRowSortValue(b, s.col), s.type || 'string')
        const cmp = compareValues(va, vb, s.type || 'string', s.col)
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp
      }
      return a.index - b.index
    })
    return next
  }, [filteredRows, sortState])

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    if (!isComparisonMode) return []
    const keys = Object.keys(comparisonMatrix).sort()
    return keys.map((key, index) => {
      const entry = comparisonMatrix[key]
      let linkRunId = data?.run_id
      let linkIndex = entry?._indices?.[data?.run_id]
      if (linkIndex == null) {
        for (const run of normalizedComparisonRuns) {
          if (entry?._indices?.[run.runId] != null) {
            linkRunId = run.runId
            linkIndex = entry._indices[run.runId]
            break
          }
        }
      }
      let firstResult: RunResultRow | null = null
      for (const run of normalizedComparisonRuns) {
        const rowEntry = entry?.[run.runId] as RunResultRow | undefined
        if (rowEntry?.result) {
          firstResult = rowEntry
          break
        }
      }
      return {
        key,
        entry,
        index,
        linkRunId,
        linkIndex,
        firstResult,
        searchText: buildComparisonSearchText(entry, normalizedComparisonRuns),
      }
    })
  }, [comparisonMatrix, data, isComparisonMode, normalizedComparisonRuns])

  const filteredComparisonRows = useMemo(() => {
    if (!isComparisonMode) return []
    const q = debouncedSearch.trim().toLowerCase()
    return comparisonRows.filter((row) => {
      if (q && !row.searchText.includes(q)) return false
      if (!hasFilters) return true
      return normalizedComparisonRuns.some((run) => {
        const entry = row.entry?.[run.runId] as RunResultRow | undefined
        const result = entry?.result
        if (!result) return false
        return matchesFiltersForData(filters, {
          annotation: result.annotation,
          dataset: entry?.dataset ?? row.entry?._meta?.dataset ?? '',
          labels: entry?.labels ?? row.entry?._meta?.labels ?? [],
          scores: result.scores || [],
          hasError: !!result.error,
          hasUrl: !!(result.trace_data?.trace_url),
          hasMessages: !!(result.trace_data?.messages?.length),
        })
      })
    })
  }, [comparisonRows, debouncedSearch, filters, hasFilters, isComparisonMode, normalizedComparisonRuns])

  const sortedComparisonRows = useMemo(() => {
    if (!sortState.length) return filteredComparisonRows
    const next = [...filteredComparisonRows]
    next.sort((a, b) => {
      for (const s of sortState) {
        const va = parseSortValue(getComparisonSortValue(a, s.col), s.type || 'string')
        const vb = parseSortValue(getComparisonSortValue(b, s.col), s.type || 'string')
        const cmp = compareValues(va, vb, s.type || 'string', s.col)
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp
      }
      return a.index - b.index
    })
    return next
  }, [filteredComparisonRows, sortState])

  useEffect(() => {
    if (!selectAllRef.current) return
    const visibleIndices = sortedRows.map((row) => row.index)
    const visibleSelected = visibleIndices.filter((idx) => selectedIndices.has(idx)).length
    selectAllRef.current.indeterminate = visibleSelected > 0 && visibleSelected < visibleIndices.length
  }, [sortedRows, selectedIndices])

  useEffect(() => {
    setAnimateStats(false)
    const handle = requestAnimationFrame(() => setAnimateStats(true))
    return () => cancelAnimationFrame(handle)
  }, [data, hasFilters, isComparisonMode, normalizedComparisonRuns.length])

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns])
  const stats = useMemo<StatsSummary>(() => (data ? summarizeStats(data) : summarizeStats({ run_id: 'empty', results: [] })), [data])
  const currentRun = useMemo(() => sessionRuns.find((r) => r.run_id === stats.runId), [sessionRuns, stats.runId])
  const currentRunLabel = currentRun ? `${currentRun.run_name || currentRun.run_id} (${formatRunTimestamp(currentRun.timestamp)})` : (stats.runName || '')

  const filteredStats = useMemo(() => {
    if (!hasFilters || isComparisonMode) return null
    return computeFilteredStats(sortedRows.map((row) => ({ result: row.result })))
  }, [hasFilters, isComparisonMode, sortedRows])

  const comparisonDisplayStats = useMemo(() => {
    if (!isComparisonMode) return {}
    const visibleKeys = new Set(sortedComparisonRows.map((row) => row.key))
    const next: Record<string, ReturnType<typeof computeFilteredStats>> = {}
    normalizedComparisonRuns.forEach((run) => {
      const runData = comparisonData[run.runId]
      const visibleResults = (runData?.results || []).filter((result) => visibleKeys.has(getResultKey(result)))
      next[run.runId] = computeFilteredStats(visibleResults.map((result) => ({ result: result.result })))
    })
    return next
  }, [comparisonData, isComparisonMode, normalizedComparisonRuns, sortedComparisonRows])

  const displayChips = filteredStats ? filteredStats.chips : stats.chips
  const displayLatency = filteredStats ? filteredStats.avgLatency : stats.avgLatency
  const displayFilteredCount = filteredStats ? filteredStats.filtered : null

  const runButtonState = useMemo<RunButtonState>(() => {
    const isRunning = isRunningOverride || hasRunningResults(data)
    const hasSelections = selectedIndices.size > 0
    if (isComparisonMode) {
      return { hidden: true, text: 'Run', showDropdown: false, isRunning }
    }
    if (isRunning) {
      return { hidden: false, text: 'Stop', showDropdown: false, isRunning }
    }
    if (!hasRunBefore) {
      return { hidden: false, text: 'Run', showDropdown: false, isRunning }
    }
    if (hasSelections) {
      return { hidden: false, text: runMode === 'new' ? 'New Run' : 'Rerun', showDropdown: true, isRunning }
    }
    return { hidden: false, text: runMode === 'new' ? 'New Run' : 'Rerun', showDropdown: true, isRunning }
  }, [data, hasRunBefore, isComparisonMode, runMode, selectedIndices.size, isRunningOverride])

  const handleToggleSort = useCallback((col: string, type: string, multi: boolean) => {
    setSortState((prev) => {
      const next = [...prev]
      const idx = next.findIndex((s) => s.col === col)
      if (multi) {
        if (idx === -1) next.push({ col, dir: 'asc', type })
        else if (next[idx].dir === 'asc') next[idx].dir = 'desc'
        else next.splice(idx, 1)
      } else {
        if (idx === 0 && next[0]?.dir === 'asc') return [{ col, dir: 'desc', type }]
        if (idx === 0 && next[0]?.dir === 'desc') return []
        return [{ col, dir: 'asc', type }]
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback((checked: boolean) => {
    const visible = sortedRows.map((row) => row.index)
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (checked) visible.forEach((idx) => next.add(idx))
      else visible.forEach((idx) => next.delete(idx))
      return next
    })
  }, [sortedRows])

  const handleRowSelect = useCallback((idx: number, checked: boolean, shiftKey: boolean) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastCheckedRef.current != null) {
        const visible = sortedRows.map((row) => row.index)
        const start = visible.indexOf(lastCheckedRef.current)
        const end = visible.indexOf(idx)
        if (start !== -1 && end !== -1) {
          const from = Math.min(start, end)
          const to = Math.max(start, end)
          for (let i = from; i <= to; i += 1) {
            const rowIdx = visible[i]
            if (checked) next.add(rowIdx)
            else next.delete(rowIdx)
          }
        }
      } else {
        if (checked) next.add(idx)
        else next.delete(idx)
      }
      lastCheckedRef.current = idx
      return next
    })
  }, [sortedRows])

  const handleRowToggle = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleResizeStart = useCallback((colKey: string, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const th = headerRefs.current[colKey]
    if (!th) return
    const startX = event.clientX
    const startWidth = th.getBoundingClientRect().width
    resizeStateRef.current = { colKey, startX, startWidth }
    document.body.classList.add('ezvals-col-resize')
  }, [])

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) return
      const { colKey, startX, startWidth } = resizeStateRef.current
      const dx = event.clientX - startX
      const minWidth = 50
      const maxWidth = 500
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx))
      setColWidths((prev) => ({ ...prev, [colKey]: Math.round(nextWidth) }))
    }
    const handleUp = () => {
      resizeStateRef.current = null
      document.body.classList.remove('ezvals-col-resize')
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [setColWidths])

  const handleAddComparison = useCallback(async (runId: string, runName: string) => {
    setComparisonRuns((prev) => {
      const existing = normalizeComparisonRuns(prev)
      if (existing.find((r) => r.runId === runId)) return prev
      if (existing.length >= 4) return prev
      const next = [...existing, { runId, runName }]
      return next
    })
    if (data && runId === data.run_id) {
      setComparisonData((prev) => ({ ...prev, [runId]: data }))
    } else {
      try {
        const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/data`)
        if (resp.ok) {
          const runData = await resp.json()
          setComparisonData((prev) => ({ ...prev, [runId]: runData }))
        }
      } catch {
        // ignore
      }
    }
  }, [data, setComparisonRuns])

  const handleRemoveComparison = useCallback((runId: string) => {
    setComparisonRuns((prev) => normalizeComparisonRuns(prev).filter((r) => r.runId !== runId))
    setComparisonData((prev) => {
      const next = { ...prev }
      delete next[runId]
      return next
    })
  }, [setComparisonRuns])

  useEffect(() => {
    if (normalizedComparisonRuns.length <= 1) {
      if (comparisonRuns.length) setComparisonRuns([])
      if (comparisonDataCount) setComparisonData({})
    }
  }, [comparisonDataCount, comparisonRuns.length, normalizedComparisonRuns.length, setComparisonRuns])

  const handleRunExecute = useCallback(async (mode: string) => {
    const isRunning = isRunningOverride || hasRunningResults(data)
    if (isRunning) {
      try {
        await fetch('/api/runs/stop', { method: 'POST' })
      } catch {
        // ignore
      }
      loadResults(true)
      return
    }

    let endpoint = '/api/runs/rerun'
    let body: Record<string, unknown> = {}
    if (mode === 'new') {
      endpoint = '/api/runs/new'
      if (selectedIndices.size > 0) body = { indices: Array.from(selectedIndices) }
    } else if (selectedIndices.size > 0) {
      body = { indices: Array.from(selectedIndices) }
    }

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let msg = text
        try {
          const parsed = JSON.parse(text)
          msg = parsed?.detail || parsed?.message || text
        } catch {
          // ignore parse errors
        }
        throw new Error(msg || `HTTP ${resp.status}`)
      }
      setHasRunBefore(true)
      setIsRunningOverride(true)
      loadResults(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(`Run failed: ${message}`)
    }
  }, [data, isRunningOverride, loadResults, selectedIndices])

  const handleThemeToggle = useCallback(() => {
    const html = document.documentElement
    const isDark = html.classList.contains('dark')
    if (isDark) {
      html.classList.remove('dark')
      localStorage.setItem('ezvals:theme', 'light')
    } else {
      html.classList.add('dark')
      localStorage.setItem('ezvals:theme', 'dark')
    }
  }, [])

  const handleSettingsOpen = useCallback(async () => {
    setSettingsOpen(true)
    try {
      const resp = await fetch('/api/config')
      if (!resp.ok) return
      const config = await resp.json() as Config
      setSettingsForm({
        concurrency: config.concurrency != null ? String(config.concurrency) : '',
        results_dir: config.results_dir ?? '',
        timeout: config.timeout != null ? String(config.timeout) : '',
      })
    } catch {
      // ignore
    }
  }, [])

  const handleSettingsSave = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload: Record<string, unknown> = {}
    const concurrency = parseInt(settingsForm.concurrency, 10)
    if (!Number.isNaN(concurrency)) payload.concurrency = concurrency
    const resultsDir = (settingsForm.results_dir || '').trim()
    if (resultsDir) payload.results_dir = resultsDir
    const timeout = parseFloat(settingsForm.timeout)
    if (!Number.isNaN(timeout)) payload.timeout = timeout

    try {
      const resp = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error('Save failed')
      setSettingsOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(`Failed to save settings: ${message}`)
    }
  }, [settingsForm])

  const handleExport = useCallback(async (format) => {
    const runId = data?.run_id || 'latest'
    if (format === 'json' || format === 'csv') {
      window.location.href = `/api/runs/${runId}/export/${format}`
      return
    }

    const visibleIndices = isComparisonMode
      ? sortedComparisonRows.map((row) => row.index)
      : sortedRows.map((row) => row.index)

    const visibleColumns = COLUMN_DEFS.map((col) => col.key).filter((key) => !hiddenSet.has(key))

    const statsPayload = {
      total: stats.total || data?.total_evaluations || visibleIndices.length,
      filtered: hasFilters ? (displayFilteredCount ?? visibleIndices.length) : visibleIndices.length,
      avgLatency: displayLatency || 0,
      chips: displayChips || [],
    }

    const payload: Record<string, unknown> = {
      visible_indices: visibleIndices,
      visible_columns: visibleColumns,
      stats: statsPayload,
      run_name: data?.run_name || 'export',
      session_name: data?.session_name || null,
    }

    if (isComparisonMode) {
      const visibleKeys = new Set(sortedComparisonRows.map((row) => row.key))
      payload.comparison_mode = true
      payload.comparison_runs = normalizedComparisonRuns.map((run) => {
        const runData = comparisonData[run.runId]
        const filteredResults = (runData?.results || []).filter((r) => visibleKeys.has(getResultKey(r)))
        return {
          run_id: run.runId,
          run_name: run.runName,
          chips: runData?.score_chips || [],
          avg_latency: runData?.average_latency || 0,
          results: filteredResults,
        }
      })
    }

    try {
      const resp = await fetch(`/api/runs/${runId}/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errText = await resp.text()
        alert(`Export failed: ${errText}`)
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = isComparisonMode ? 'comparison' : runId
      a.download = `${filename}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(`Export failed: ${message}`)
    }
  }, [comparisonData, data, displayChips, displayFilteredCount, displayLatency, hasFilters, hiddenSet, isComparisonMode, normalizedComparisonRuns, sortedComparisonRows, sortedRows, stats])

  const handleRunNameSave = useCallback(async () => {
    const newName = runNameDraft.trim()
    if (!newName || newName === data?.run_name) {
      setEditingRunName(false)
      return
    }
    try {
      const hasRunFile = hasRunBefore || (data?.results || []).some((r) => r.result?.status && r.result.status !== 'not_started')
      if (hasRunFile && data?.run_id) {
        await fetch(`/api/runs/${data.run_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_name: newName }),
        })
      } else {
        await fetch('/api/pending-run-name', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_name: newName }),
        })
      }
      setEditingRunName(false)
      loadResults(true)
    } catch (err) {
      console.error('Rename failed:', err)
      setEditingRunName(false)
    }
  }, [data, hasRunBefore, loadResults, runNameDraft])

  const activeFilterCount = useMemo(() => {
    let count = 0
    filters.valueRules.forEach(() => { count += 1 })
    filters.passedRules.forEach(() => { count += 1 })
    if (filters.annotation && filters.annotation !== 'any') count += 1
    count += (filters.selectedDatasets?.include || []).length
    count += (filters.selectedDatasets?.exclude || []).length
    count += (filters.selectedLabels?.include || []).length
    count += (filters.selectedLabels?.exclude || []).length
    if (filters.hasError !== null) count += 1
    if (filters.hasUrl !== null) count += 1
    if (filters.hasMessages !== null) count += 1
    return count
  }, [filters])

  if (loading && !data) {
    return (
      <div className="h-screen flex flex-col bg-theme-bg font-sans text-theme-text">
        <div className="flex-1 flex items-center justify-center text-theme-text-muted">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col bg-theme-bg font-sans text-theme-text">
        <div className="p-4 text-theme-text-muted">Failed to load results. Please refresh the page.</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-theme-bg font-sans text-theme-text">
      <DashboardIcons />

      <DashboardHeader
        search={search}
        setSearch={setSearch}
        filtersOpen={filtersOpen}
        columnsOpen={columnsOpen}
        exportOpen={exportOpen}
        setFiltersOpen={setFiltersOpen}
        setColumnsOpen={setColumnsOpen}
        setExportOpen={setExportOpen}
        filtersToggleRef={filtersToggleRef}
        filtersMenuRef={filtersMenuRef}
        columnsToggleRef={columnsToggleRef}
        columnsMenuRef={columnsMenuRef}
        exportToggleRef={exportToggleRef}
        exportMenuRef={exportMenuRef}
        activeFilterCount={activeFilterCount}
        filters={filters}
        setFilters={setFilters}
        selectedScoreKey={selectedScoreKey}
        setSelectedScoreKey={setSelectedScoreKey}
        scoreKeysMeta={scoreKeysMeta}
        datasetLabels={datasetLabels}
        hiddenSet={hiddenSet}
        setHiddenColumns={setHiddenColumns}
        columnDefs={COLUMN_DEFS}
        setSortState={setSortState}
        setColWidths={setColWidths}
        handleExport={handleExport}
        handleSettingsOpen={handleSettingsOpen}
        runButtonState={runButtonState}
        runMode={runMode}
        setRunMode={setRunMode}
        runMenuOpen={runMenuOpen}
        setRunMenuOpen={setRunMenuOpen}
        isComparisonMode={isComparisonMode}
        onRunExecute={handleRunExecute}
      />

      <main className="flex-1 overflow-auto px-4 py-4">
        <StatsExpanded
          stats={stats}
          statsExpanded={statsExpanded}
          setStatsExpanded={setStatsExpanded}
          hasFilters={hasFilters}
          displayFilteredCount={displayFilteredCount}
          displayChips={displayChips}
          displayLatency={displayLatency}
          isComparisonMode={isComparisonMode}
          normalizedComparisonRuns={normalizedComparisonRuns}
          comparisonData={comparisonData}
          comparisonDisplayStats={comparisonDisplayStats}
          sessionRuns={sessionRuns}
          currentRunLabel={currentRunLabel}
          editingRunName={editingRunName}
          runNameDraft={runNameDraft}
          setRunNameDraft={setRunNameDraft}
          setEditingRunName={setEditingRunName}
          onRunNameSave={handleRunNameSave}
          onRunDropdownToggle={() => setRunDropdownOpen((prev) => !prev)}
          onAddCompareToggle={() => setCompareDropdownOpen((prev) => !prev)}
          onAddMoreCompareToggle={() => setAddCompareOpen((prev) => !prev)}
          onRemoveComparison={handleRemoveComparison}
          runDropdownExpandedRef={runDropdownExpandedRef}
          compareDropdownAnchorRef={compareDropdownAnchorRef}
          addCompareAnchorRef={addCompareAnchorRef}
          animateStats={animateStats}
        />
        <StatsCompact
          stats={stats}
          statsExpanded={statsExpanded}
          setStatsExpanded={setStatsExpanded}
          displayChips={displayChips}
          displayFilteredCount={displayFilteredCount}
          hasFilters={hasFilters}
          sessionRuns={sessionRuns}
          currentRunLabel={currentRunLabel}
          editingRunName={editingRunName}
          runNameDraft={runNameDraft}
          setRunNameDraft={setRunNameDraft}
          setEditingRunName={setEditingRunName}
          onRunNameSave={handleRunNameSave}
          onRunDropdownToggle={() => setRunDropdownOpen((prev) => !prev)}
          runDropdownCompactRef={runDropdownCompactRef}
        />

        {isComparisonMode ? (
          <ComparisonTable
            sortedRows={sortedComparisonRows}
            normalizedComparisonRuns={normalizedComparisonRuns}
            onToggleSort={handleToggleSort}
            currentRunId={data?.run_id}
          />
        ) : (
          <ResultsTable
            data={data}
            rows={sortedRows}
            selectedIndices={selectedIndices}
            expandedRows={expandedRows}
            hiddenSet={hiddenSet}
            sortState={sortState}
            colWidths={colWidths}
            columnDefs={COLUMN_DEFS}
            pillTones={PILL_TONES}
            onToggleSort={handleToggleSort}
            onResizeStart={handleResizeStart}
            onSelectAll={handleSelectAll}
            onRowSelect={handleRowSelect}
            onRowToggle={handleRowToggle}
            selectAllRef={selectAllRef}
            headerRefs={headerRefs}
          />
        )}

      </main>

      <footer className="shrink-0 border-t border-theme-border bg-theme-bg py-3">
        <div className="flex items-center justify-center gap-6 text-xs text-theme-text-muted">
          <a href="https://github.com/camronh/EZVals" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-theme-text-secondary">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <use href="#icon-github"></use>
            </svg>
            GitHub
          </a>
          <a href="https://ezvals.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-theme-text-secondary">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-doc"></use>
            </svg>
            Docs
          </a>
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        onToggleTheme={handleThemeToggle}
      />

      <FloatingMenu anchorRef={statsExpanded ? runDropdownExpandedRef : runDropdownCompactRef} open={runDropdownOpen} onClose={() => setRunDropdownOpen(false)}>
        {sessionRuns.map((run) => {
          const isCurrent = run.run_id === data?.run_id
          return (
            <button
              key={run.run_id}
              data-run-id={run.run_id}
              className={`compare-option${isCurrent ? ' current-run' : ''}`}
              onClick={async () => {
                if (run.run_id !== data?.run_id) {
                  try {
                    await fetch(`/api/runs/${encodeURIComponent(run.run_id)}/activate`, { method: 'POST' })
                  } catch {
                    // ignore
                  }
                  loadResults(true)
                }
                setRunDropdownOpen(false)
              }}
            >
              {run.run_name || run.run_id} <span className="text-zinc-500">({formatRunTimestamp(run.timestamp)})</span>
            </button>
          )
        })}
      </FloatingMenu>

      <FloatingMenu anchorRef={compareDropdownAnchorRef} open={compareDropdownOpen} onClose={() => setCompareDropdownOpen(false)}>
        {sessionRuns.filter((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id) && r.run_id !== data?.run_id).length === 0 ? (
          <div className="text-zinc-500 text-[10px] p-2">No other runs available</div>
        ) : sessionRuns.filter((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id) && r.run_id !== data?.run_id).map((run) => (
          <button
            key={run.run_id}
            className="compare-option w-full text-left px-3 py-2 hover:bg-zinc-700 text-xs text-zinc-300"
            onClick={() => {
              const current = data?.run_id
              if (current && !normalizedComparisonRuns.find((r) => r.runId === current)) {
                handleAddComparison(current, data?.run_name || current)
              }
              handleAddComparison(run.run_id, run.run_name || run.run_id)
              setCompareDropdownOpen(false)
            }}
          >
            {run.run_name || run.run_id} <span className="text-zinc-500">({formatRunTimestamp(run.timestamp)})</span>
          </button>
        ))}
      </FloatingMenu>

      <FloatingMenu anchorRef={addCompareAnchorRef} open={addCompareOpen} onClose={() => setAddCompareOpen(false)}>
        {sessionRuns.filter((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id)).length === 0 ? (
          <div className="text-zinc-500 text-[10px] p-2">No other runs available</div>
        ) : sessionRuns.filter((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id)).map((run) => (
          <button
            key={run.run_id}
            className="compare-option w-full text-left px-3 py-2 hover:bg-zinc-700 text-xs text-zinc-300"
            onClick={() => {
              handleAddComparison(run.run_id, run.run_name || run.run_id)
              setAddCompareOpen(false)
            }}
          >
            {run.run_name || run.run_id} <span className="text-zinc-500">({formatRunTimestamp(run.timestamp)})</span>
          </button>
        ))}
      </FloatingMenu>
    </div>
  )
}
