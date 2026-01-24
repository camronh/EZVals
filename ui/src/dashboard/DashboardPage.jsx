import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_HIDDEN_COLS,
  buildComparisonMatrix,
  chipStats,
  compareValues,
  computeDatasetLabels,
  computeFilteredStats,
  computeScoreKeyMeta,
  defaultFilters,
  formatRunTimestamp,
  formatValue,
  getBarColor,
  getBgBarColor,
  getResultKey,
  getTextColor,
  isFilterActive,
  matchesFiltersForData,
  normalizeComparisonRuns,
  parseSortValue,
  summarizeStats,
} from './utils'
import { useDebouncedValue, useLocalStorageState, useSessionStorageState } from './hooks'

const DASHBOARD_BODY_CLASS = 'h-screen flex flex-col bg-theme-bg font-sans text-theme-text'

const PILL_TONES = {
  not_started: 'text-zinc-400 bg-zinc-500/10 border border-zinc-500/40',
  pending: 'text-blue-300 bg-blue-500/10 border border-blue-500/40',
  running: 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/40',
  completed: 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/40',
  error: 'text-rose-300 bg-rose-500/10 border border-rose-500/40',
  cancelled: 'text-amber-300 bg-amber-500/10 border border-amber-500/40',
}

const COLUMN_DEFS = [
  { key: 'function', label: 'Eval', width: '15%', type: 'string', align: 'left' },
  { key: 'input', label: 'Input', width: '18%', type: 'string', align: 'left' },
  { key: 'reference', label: 'Reference', width: '18%', type: 'string', align: 'left' },
  { key: 'output', label: 'Output', width: '18%', type: 'string', align: 'left' },
  { key: 'error', label: 'Error', width: '18%', type: 'string', align: 'left' },
  { key: 'scores', label: 'Scores', width: '140px', type: 'number', align: 'left' },
  { key: 'latency', label: 'Time', width: '70px', type: 'number', align: 'right' },
]

const RUN_MODE_KEY = 'ezvals:runMode'

function hasRunningResults(data) {
  return (data?.results || []).some((r) => ['pending', 'running', 'not_started'].includes(r.result?.status))
}

function buildRowSearchText(row) {
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

function buildComparisonSearchText(entry, comparisonRuns) {
  const parts = [entry?._meta?.function, entry?._meta?.dataset, ...(entry?._meta?.labels || [])]
  comparisonRuns.forEach((run) => {
    const row = entry?.[run.runId]
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

function getRowSortValue(row, col) {
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
    if (first.value != null) return first.value
    if (first.passed === true) return 1
    if (first.passed === false) return 0
    return ''
  }
  if (col === 'latency') return result.latency ?? ''
  return ''
}

function getComparisonSortValue(row, col) {
  if (col === 'function') return row.entry?._meta?.function || ''
  if (col === 'input') return formatValue(row.firstResult?.result?.input)
  if (col === 'reference') return formatValue(row.firstResult?.result?.reference)
  if (col.startsWith('output-')) {
    const runId = col.slice('output-'.length)
    const result = row.entry?.[runId]?.result
    if (!result) return ''
    const scores = result.scores || []
    const scoreText = scores.map((s) => `${s.key}:${s.value ?? ''}`).join(' ')
    return `${formatValue(result.output)} ${result.error || ''} ${scoreText}`
  }
  return ''
}

function CopyableText({ text, className }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch {
      // ignore clipboard failure
    }
  }, [text])

  return (
    <span onClick={handleCopy} className={`relative ${className}`}>
      {text}
      {copied ? (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-white whitespace-nowrap">Copied!</span>
      ) : null}
    </span>
  )
}

function FloatingMenu({ anchorRef, open, onClose, children }) {
  const menuRef = useRef(null)
  const [style, setStyle] = useState(null)

  useEffect(() => {
    if (!open || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 100,
    })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const handleClick = (event) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target)) return
      if (anchorRef?.current?.contains(event.target)) return
      onClose?.()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open, anchorRef, onClose])

  if (!open) return null
  return createPortal(
    <div ref={menuRef} className="compare-dropdown" style={style}>
      {children}
    </div>,
    document.body,
  )
}

function InlineScoreBadges({ scores, latency }) {
  const items = []
  if (scores?.length) {
    scores.forEach((s, idx) => {
      let badgeClass = 'bg-theme-bg-elevated text-theme-text-muted'
      if (s.passed === true) badgeClass = 'bg-accent-success-bg text-accent-success'
      else if (s.passed === false) badgeClass = 'bg-accent-error-bg text-accent-error'
      const val = s.value != null ? `:${typeof s.value === 'number' ? s.value.toFixed(1) : s.value}` : ''
      items.push(
        <span key={`${s.key}-${idx}`} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {s.key}{val}
        </span>,
      )
    })
  }
  if (latency != null) {
    const latColor = latency <= 1 ? 'text-accent-success' : (latency <= 5 ? 'text-theme-text-muted' : 'text-accent-error')
    items.push(
      <span key="latency" className={`font-mono text-[10px] ${latColor}`}>
        {latency.toFixed(2)}s
      </span>,
    )
  }
  return items
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [sessionRuns, setSessionRuns] = useState([])
  const [comparisonData, setComparisonData] = useState({})
  const [error, setError] = useState(null)
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
  const [filters, setFilters] = useSessionStorageState('ezvals:filters', defaultFilters)
  const [search, setSearch] = useSessionStorageState('ezvals:search', '')
  const [hiddenColumns, setHiddenColumns] = useLocalStorageState('ezvals:hidden_columns', DEFAULT_HIDDEN_COLS)
  const [colWidths, setColWidths] = useLocalStorageState('ezvals:col_widths', {})
  const [statsExpanded, setStatsExpanded] = useLocalStorageState('ezvals:statsExpanded', true)
  const [runMode, setRunMode] = useLocalStorageState(RUN_MODE_KEY, 'rerun')
  const [comparisonRuns, setComparisonRuns] = useSessionStorageState('ezvals:comparisonRuns', [])
  const [sortState, setSortState] = useState([])
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [isRunningOverride, setIsRunningOverride] = useState(false)
  const [hasRunBefore, setHasRunBefore] = useState(false)
  const [animateStats, setAnimateStats] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ concurrency: '', results_dir: '', timeout: '' })

  const filtersToggleRef = useRef(null)
  const filtersMenuRef = useRef(null)
  const columnsToggleRef = useRef(null)
  const columnsMenuRef = useRef(null)
  const exportToggleRef = useRef(null)
  const exportMenuRef = useRef(null)
  const compareDropdownAnchorRef = useRef(null)
  const addCompareAnchorRef = useRef(null)
  const runDropdownExpandedRef = useRef(null)
  const runDropdownCompactRef = useRef(null)
  const selectAllRef = useRef(null)
  const lastCheckedRef = useRef(null)
  const resizeStateRef = useRef(null)
  const headerRefs = useRef({})

  const debouncedSearch = useDebouncedValue(search, 120)
  const normalizedComparisonRuns = useMemo(() => normalizeComparisonRuns(comparisonRuns), [comparisonRuns])
  const isComparisonMode = normalizedComparisonRuns.length > 1
  const comparisonMatrix = useMemo(() => buildComparisonMatrix(comparisonData), [comparisonData])
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
      const next = await resp.json()
      setData(next)
      setLoading(false)
      setError(null)
      setHasRunBefore((prev) => prev || (next.results || []).some((r) => r.result?.status && r.result.status !== 'not_started'))
      setComparisonData((prev) => ({ ...prev, [next.run_id]: next }))
      if (next.session_name) {
        const runsResp = await fetch(`/api/sessions/${encodeURIComponent(next.session_name)}/runs`)
        if (runsResp.ok) {
          const runsData = await runsResp.json()
          setSessionRuns(runsData.runs || [])
        }
      }
    } catch (err) {
      setError(err)
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
    const runIds = new Set(restored.map((r) => r.runId))

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
          const runData = await resp.json()
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
    const handleClick = (event) => {
      const target = event.target
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

  const [selectedScoreKey, setSelectedScoreKey] = useState('')

  useEffect(() => {
    if (!scoreKeysMeta.all.length) return
    if (!scoreKeysMeta.all.includes(selectedScoreKey)) {
      setSelectedScoreKey(scoreKeysMeta.all[0])
    }
  }, [scoreKeysMeta, selectedScoreKey])

  const rows = useMemo(() => {
    return (data?.results || []).map((r, index) => {
      const result = r.result || {}
      return {
        index,
        function: r.function,
        dataset: r.dataset || '',
        labels: r.labels || [],
        result,
        scores: result.scores || [],
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

  const comparisonRows = useMemo(() => {
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
      let firstResult = null
      for (const run of normalizedComparisonRuns) {
        if (entry?.[run.runId]?.result) {
          firstResult = entry[run.runId]
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
        const entry = row.entry?.[run.runId]
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
  const stats = useMemo(() => (data ? summarizeStats(data) : summarizeStats({ results: [] })), [data])
  const currentRun = useMemo(() => sessionRuns.find((r) => r.run_id === stats.runId), [sessionRuns, stats.runId])
  const currentRunLabel = currentRun ? `${currentRun.run_name || currentRun.run_id} (${formatRunTimestamp(currentRun.timestamp)})` : stats.runName

  const filteredStats = useMemo(() => {
    if (!hasFilters || isComparisonMode) return null
    return computeFilteredStats(sortedRows.map((row) => ({ result: row.result })))
  }, [hasFilters, isComparisonMode, sortedRows])

  const displayChips = filteredStats ? filteredStats.chips : stats.chips
  const displayLatency = filteredStats ? filteredStats.avgLatency : stats.avgLatency
  const displayFilteredCount = filteredStats ? filteredStats.filtered : null

  const runButtonState = useMemo(() => {
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
      return { hidden: false, text: 'Rerun', showDropdown: false, isRunning }
    }
    return { hidden: false, text: runMode === 'new' ? 'New Run' : 'Rerun', showDropdown: true, isRunning }
  }, [data, hasRunBefore, isComparisonMode, runMode, selectedIndices.size, isRunningOverride])

  const handleToggleSort = useCallback((col, type, multi) => {
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

  const handleSelectAll = useCallback((checked) => {
    const visible = sortedRows.map((row) => row.index)
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (checked) visible.forEach((idx) => next.add(idx))
      else visible.forEach((idx) => next.delete(idx))
      return next
    })
  }, [sortedRows])

  const handleRowSelect = useCallback((idx, checked, shiftKey) => {
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

  const handleRowToggle = useCallback((idx) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleResizeStart = useCallback((colKey, event) => {
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
    const handleMove = (event) => {
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

  const handleAddComparison = useCallback(async (runId, runName) => {
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

  const handleRemoveComparison = useCallback((runId) => {
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

  const handleRunExecute = useCallback(async (mode) => {
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
    let body = {}
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
      alert(`Run failed: ${err.message || err}`)
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
      const config = await resp.json()
      setSettingsForm({
        concurrency: config.concurrency ?? '',
        results_dir: config.results_dir ?? '',
        timeout: config.timeout ?? '',
      })
    } catch {
      // ignore
    }
  }, [])

  const handleSettingsSave = useCallback(async (event) => {
    event.preventDefault()
    const payload = {}
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
      alert(`Failed to save settings: ${err.message || err}`)
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

    const payload = {
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
      alert(`Export failed: ${err.message || err}`)
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

  const renderStatsExpanded = () => {
    const inComparison = isComparisonMode
    const chips = inComparison ? [] : displayChips
    const headerContent = (() => {
      if (inComparison) {
        return (
          <div className="stats-left-header">
            {stats.sessionName ? (
              <div className="stats-info-row">
                <span className="stats-info-label">session</span>
                <CopyableText text={stats.sessionName} className="stats-session copyable cursor-pointer hover:text-zinc-300" />
              </div>
            ) : null}
            <div className="stats-info-row"><span className="stats-info-label">comparing</span></div>
            <div className="comparison-chips flex flex-wrap gap-2 items-center">
              {normalizedComparisonRuns.map((run, idx) => {
                const runData = comparisonData[run.runId]
                const testCount = runData?.results?.length || 0
                return (
                  <span
                    key={run.runId}
                    className="comparison-chip rounded-full px-3 py-1 text-[11px] font-medium flex items-center gap-1.5"
                    style={{ background: `${run.color}20`, border: `1px solid ${run.color}`, color: run.color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: run.color }}></span>
                    <span className="truncate max-w-[120px]">{run.runName}</span>
                    <span className="text-zinc-500">({testCount})</span>
                    {idx !== 0 ? (
                      <button
                        className="remove-comparison ml-1 hover:text-white text-[14px] leading-none"
                        onClick={() => handleRemoveComparison(run.runId)}
                        title="Remove from comparison"
                      >
                        &times;
                      </button>
                    ) : null}
                  </span>
                )
              })}
              {normalizedComparisonRuns.length < 4 && sessionRuns.some((r) => !normalizedComparisonRuns.find((run) => run.runId === r.run_id)) ? (
                <button
                  ref={addCompareAnchorRef}
                  id="add-more-compare"
                  className="rounded-full px-2 py-1 text-[10px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                  title="Add another run to compare"
                  onClick={() => setAddCompareOpen((prev) => !prev)}
                >
                  +
                </button>
              ) : null}
            </div>
          </div>
        )
      }

      if (stats.sessionName || stats.runName) {
        return (
          <div className="stats-left-header">
            {stats.sessionName ? (
              <div className="stats-info-row">
                <span className="stats-info-label">session</span>
                <CopyableText text={stats.sessionName} className="stats-session copyable cursor-pointer hover:text-zinc-300" />
              </div>
            ) : null}
            {stats.runName ? (
              <div className="stats-info-row group">
                <span className="stats-info-label">run</span>
                {sessionRuns.length > 1 ? (
                  <button
                    ref={runDropdownExpandedRef}
                    id="run-dropdown-expanded"
                    className="stats-run-dropdown run-dropdown-btn"
                    data-run-id={stats.runId}
                    onClick={() => setRunDropdownOpen((prev) => !prev)}
                  >
                    {currentRunLabel} <span className="dropdown-arrow">v</span>
                  </button>
                ) : (
                  editingRunName ? (
                    <input
                      className="font-mono text-sm bg-zinc-800 border border-zinc-600 rounded px-1 w-28 text-white outline-none focus:border-zinc-500"
                      value={runNameDraft}
                      onChange={(e) => setRunNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRunNameSave(); if (e.key === 'Escape') setEditingRunName(false) }}
                      onBlur={() => setEditingRunName(false)}
                    />
                  ) : (
                    <CopyableText text={stats.runName} className="stats-run copyable cursor-pointer hover:text-zinc-300" />
                  )
                )}
                <button
                  className="edit-run-btn-expanded ml-1 text-zinc-600 transition hover:text-zinc-400"
                  title="Rename run"
                  onClick={() => { setEditingRunName(true); setRunNameDraft(stats.runName || '') }}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                </button>
              </div>
            ) : null}
            {sessionRuns.length > 1 && stats.runName ? (
              <div className="stats-info-row">
                <span className="stats-info-label"></span>
                <button
                  ref={compareDropdownAnchorRef}
                  id="add-compare-btn"
                  className="add-compare-btn"
                  title="Compare with another run"
                  onClick={() => setCompareDropdownOpen((prev) => !prev)}
                >
                  + Compare
                </button>
              </div>
            ) : null}
          </div>
        )
      }
      return null
    })()

    const metricsHtml = !inComparison ? (
      <>
        <div className="stats-metric-row-main">
          <div className="stats-metric">
            <span className="stats-metric-value">
              {hasFilters ? (
                <>
                  {displayFilteredCount ?? stats.total}
                  <span className="stats-metric-divisor">/{stats.total}</span>
                </>
              ) : (
                stats.total
              )}
            </span>
            <span className="stats-metric-label">tests</span>
          </div>
          {stats.isRunning ? (
            <div className="stats-progress">
              <div className="stats-progress-bar"><div className="stats-progress-fill" style={{ width: `${stats.pctDone}%` }}></div></div>
              <span className="stats-progress-text text-emerald-400">{stats.pctDone}% ({stats.progressCompleted}/{stats.progressTotal})</span>
            </div>
          ) : null}
        </div>
        <div className="stats-metric-row">
          <div id="stats-errors" className="stats-metric stats-metric-sm stats-errors">
            <span className="stats-metric-value text-accent-error">{stats.totalErrors}</span>
            <span className="stats-metric-label">errors</span>
          </div>
          {displayLatency > 0 ? (
            <div className="stats-metric stats-metric-sm stats-latency">
              <span className="stats-metric-value">{displayLatency.toFixed(2)}<span className="stats-metric-unit">s</span></span>
              <span className="stats-metric-label">avg latency</span>
            </div>
          ) : null}
        </div>
      </>
    ) : null

    let bars = []
    let labels = []
    let values = []

    if (inComparison) {
      const allKeys = new Set()
      Object.values(comparisonData).forEach((runData) => {
        ;(runData?.score_chips || []).forEach((chip) => allKeys.add(chip.key))
      })
      allKeys.add('_latency')
      const keys = Array.from(allKeys)
      let maxLatency = 0
      Object.values(comparisonData).forEach((runData) => {
        const lat = runData?.average_latency || 0
        if (lat > maxLatency) maxLatency = lat
      })

      keys.forEach((key, keyIdx) => {
        const groupBars = normalizedComparisonRuns.map((run) => {
          const runData = comparisonData[run.runId]
          let pct = 0
          let displayVal = '--'
          if (key === '_latency') {
            const lat = runData?.average_latency || 0
            pct = maxLatency > 0 ? (lat / maxLatency) * 100 : 0
            displayVal = lat > 0 ? `${lat.toFixed(2)}s` : '--'
          } else {
            const chip = (runData?.score_chips || []).find((c) => c.key === key)
            if (chip) {
              const statsChip = chipStats(chip, 2)
              pct = statsChip.pct
              displayVal = `${statsChip.pct}%`
            }
          }
          return (
            <div key={`${run.runId}-${key}`} className="comparison-bar-wrapper">
              <span className="comparison-bar-label" style={{ color: run.color }}>{displayVal}</span>
              <div className="comparison-bar" style={{ background: run.color, height: animateStats ? `${pct}%` : '0%' }} data-target-height={pct}></div>
            </div>
          )
        })
        bars.push(
          <div key={`group-${key}`} className="stats-bar-group" style={{ opacity: animateStats ? 1 : 0, transform: animateStats ? 'translateY(0)' : 'translateY(20px)' }}>
            {groupBars}
          </div>
        )
        labels.push(
          <span key={`label-${key}`} className="stats-chart-label" style={{ opacity: animateStats ? 1 : 0 }}>
            {key === '_latency' ? 'Latency' : key}
          </span>
        )
        values.push(<span key={`value-${keyIdx}`} className="stats-chart-value comparison-value" style={{ opacity: animateStats ? 1 : 0 }}></span>)
      })
    } else {
      bars = chips.map((chip, i) => {
        const { pct } = chipStats(chip, 2)
        return (
          <div key={`${chip.key}-${i}`} className="stats-bar-col" style={{ opacity: animateStats ? 1 : 0, transform: animateStats ? 'translateY(0)' : 'translateY(20px)' }}>
            <div className={`stats-chart-fill ${getBarColor(pct)}`} data-target-height={pct} style={{ height: animateStats ? `${pct}%` : '0%' }}></div>
          </div>
        )
      })
      labels = chips.map((chip) => (
        <span key={`label-${chip.key}`} className="stats-chart-label" style={{ opacity: animateStats ? 1 : 0 }}>{chip.key}</span>
      ))
      values = chips.map((chip) => {
        const { pct, value } = chipStats(chip, 2)
        return (
          <span key={`value-${chip.key}`} className="stats-chart-value" style={{ opacity: animateStats ? 1 : 0 }}>
            <span className="stats-pct">{pct}%</span>
            <span className="stats-ratio">{value}</span>
          </span>
        )
      })
    }

    return (
      <div id="stats-expanded" className={`stats-expanded${statsExpanded ? '' : ' hidden'}${inComparison ? ' comparison-mode' : ''}`}>
        <div className="stats-layout">
          <button id="stats-collapse-btn" className="stats-collapse-btn" title="Collapse" onClick={() => setStatsExpanded(false)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-chevron-up"></use></svg>
          </button>
          <div className="stats-left">
            <div className="stats-left-content">
              {headerContent}
              {metricsHtml}
            </div>
            <div className="stats-yaxis">
              <span className="stats-axis-label">100%</span>
              <span className="stats-axis-label">75%</span>
              <span className="stats-axis-label">50%</span>
              <span className="stats-axis-label">25%</span>
              <span className="stats-axis-label">0%</span>
            </div>
          </div>
          <div className="stats-right">
            <div className="stats-chart-area">
              <div className="stats-gridline" style={{ top: '0%' }}></div>
              <div className="stats-gridline" style={{ top: '25%' }}></div>
              <div className="stats-gridline" style={{ top: '50%' }}></div>
              <div className="stats-gridline" style={{ top: '75%' }}></div>
              <div className="stats-chart-bars">{bars}</div>
            </div>
            <div className="stats-xaxis">
              <div className="stats-chart-labels">{labels}</div>
              <div className="stats-chart-values">{values}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStatsCompact = () => {
    const { total, avgLatency, pctDone, progressPending, notStarted, progressCompleted, progressTotal } = stats
    const showFiltered = hasFilters && displayFilteredCount != null
    let progressHtml
    if (notStarted === total) {
      progressHtml = (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Discovered</span>
          <span className="font-mono text-[11px] text-zinc-400">{total} eval{total !== 1 ? 's' : ''}</span>
        </div>
      )
    } else if (progressPending > 0) {
      progressHtml = (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Progress</span>
          <div className="h-1 w-6 overflow-hidden rounded-full bg-theme-progress-bar">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pctDone}%` }}></div>
          </div>
          <span className="font-mono text-[11px] text-accent-link">{pctDone}% ({progressCompleted}/{progressTotal})</span>
        </div>
      )
    } else {
      const testsDisplay = showFiltered ? `${displayFilteredCount}/${total}` : total
      progressHtml = (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Tests</span>
          <span className="font-mono text-[11px] text-accent-link">{testsDisplay}</span>
        </div>
      )
    }

    return (
      <div id="stats-compact" className={`mb-3 flex flex-wrap items-center gap-3 border-b border-theme-border bg-theme-bg-secondary/50 px-4 py-2${statsExpanded ? ' hidden' : ''}`}>
        {(stats.sessionName || stats.runName) ? (
          <>
            <div className="flex items-center gap-2">
              {stats.sessionName ? (
                <>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Session</span>
                  <CopyableText text={stats.sessionName} className="copyable font-mono text-[11px] text-theme-text cursor-pointer hover:text-zinc-300" />
                </>
              ) : null}
              {stats.runName ? (
                <>
                  {stats.sessionName ? <span className="text-zinc-600">.</span> : null}
                  <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-secondary">Run</span>
                  {sessionRuns.length > 1 ? (
                    <div className="group flex items-center gap-1">
                      <button
                        ref={runDropdownCompactRef}
                        id="run-dropdown-compact"
                        className="stats-run-dropdown-compact run-dropdown-btn"
                        data-run-id={stats.runId}
                        onClick={() => setRunDropdownOpen((prev) => !prev)}
                      >
                        {currentRunLabel} <span className="dropdown-arrow">v</span>
                      </button>
                      <button className="edit-run-btn flex h-4 w-4 items-center justify-center rounded text-zinc-600 transition hover:text-zinc-400" title="Rename run" onClick={() => { setEditingRunName(true); setRunNameDraft(stats.runName || '') }}>
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="group flex items-center gap-1">
                      {editingRunName ? (
                        <input
                          className="font-mono text-[11px] bg-zinc-800 border border-zinc-600 rounded px-1 w-24 text-accent-link outline-none focus:border-zinc-500"
                          value={runNameDraft}
                          onChange={(e) => setRunNameDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRunNameSave(); if (e.key === 'Escape') setEditingRunName(false) }}
                          onBlur={() => setEditingRunName(false)}
                        />
                      ) : (
                        <CopyableText text={stats.runName} className="copyable font-mono text-[11px] text-accent-link cursor-pointer hover:text-accent-link-hover" />
                      )}
                      <button className="edit-run-btn flex h-4 w-4 items-center justify-center rounded text-zinc-600 transition hover:text-zinc-400" title="Rename run" onClick={() => { setEditingRunName(true); setRunNameDraft(stats.runName || '') }}>
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-pencil"></use></svg>
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <div className="h-3 w-px bg-zinc-700"></div>
          </>
        ) : null}
        {progressHtml}
        <div className="h-3 w-px bg-zinc-700"></div>
        {displayChips.flatMap((chip, i) => {
          const statsChip = chipStats(chip, 1)
          const chipNode = (
            <div key={`chip-${chip.key}`} className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-theme-text-secondary">{chip.key}</span>
              <div className="h-1 w-5 overflow-hidden rounded-full bg-theme-progress-bar">
                <div className={`h-full rounded-full ${getBgBarColor(statsChip.pct)}`} style={{ width: `${statsChip.pct}%` }}></div>
              </div>
              <span className={`font-mono text-[11px] ${getTextColor(statsChip.pct)}`}>{statsChip.pct}% ({statsChip.value})</span>
            </div>
          )
          if (i < displayChips.length - 1) {
            return [chipNode, <div key={`sep-${chip.key}`} className="h-3 w-px bg-zinc-700"></div>]
          }
          return [chipNode]
        })}
        {avgLatency > 0 ? (
          <>
            <div className="h-3 w-px bg-zinc-700"></div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-theme-text-secondary">Latency</span>
              <span className="font-mono text-[11px] text-zinc-400">{avgLatency.toFixed(2)}s</span>
            </div>
          </>
        ) : null}
        <div className="ml-auto">
          <button id="stats-expand-btn" className="stats-toggle-btn" title="Expand stats" onClick={() => setStatsExpanded(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-chevron-down"></use></svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-theme-bg font-sans text-theme-text">
      <svg xmlns="http://www.w3.org/2000/svg" className="hidden">
        <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </symbol>
        <symbol id="icon-filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </symbol>
        <symbol id="icon-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </symbol>
        <symbol id="icon-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
        </symbol>
        <symbol id="icon-play" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </symbol>
        <symbol id="icon-stop" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12"></rect>
        </symbol>
        <symbol id="icon-github" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
        </symbol>
        <symbol id="icon-doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </symbol>
        <symbol id="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </symbol>
        <symbol id="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </symbol>
        <symbol id="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </symbol>
        <symbol id="icon-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </symbol>
        <symbol id="icon-chevron-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 15l-6-6-6 6"></path>
        </symbol>
        <symbol id="icon-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"></path>
        </symbol>
        <symbol id="icon-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6"></path>
        </symbol>
        <symbol id="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </symbol>
        <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5"></path>
        </symbol>
        <symbol id="icon-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        </symbol>
      </svg>

      <header className="sticky top-0 z-40 border-b border-theme-border bg-theme-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EZVals" className="h-7 w-7" />
            <span className="font-mono text-base font-semibold tracking-tight text-theme-text">EZVals</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-search"></use>
              </svg>
              <input
                id="search-input"
                type="search"
                className="w-56 rounded border border-theme-border bg-theme-bg-secondary py-1.5 pl-7 pr-3 text-xs text-theme-text placeholder:text-theme-text-muted focus:border-blue-500 focus:outline-none"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="dropdown relative">
              <button
                ref={filtersToggleRef}
                id="filters-toggle"
                className="relative flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
                onClick={() => { setFiltersOpen((prev) => !prev); setColumnsOpen(false) }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-filter"></use>
                </svg>
                <span id="filters-count-badge" className={`filter-badge absolute -right-1 -top-1 h-4 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white ${activeFilterCount > 0 ? 'active' : ''}`}>
                  {activeFilterCount > 0 ? activeFilterCount : ''}
                </span>
              </button>
              <div
                ref={filtersMenuRef}
                id="filters-menu"
                className={`filters-panel absolute right-0 z-50 mt-1 w-80 rounded border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl ${filtersOpen ? 'active' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Filters</span>
                  <button
                    id="clear-filters"
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => setFilters(defaultFilters())}
                  >
                    Clear
                  </button>
                </div>
                <div className="mb-2 rounded bg-zinc-800/50 p-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Score</span>
                    <select
                      id="key-select"
                      className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:border-blue-500 focus:outline-none"
                      value={selectedScoreKey}
                      onChange={(e) => setSelectedScoreKey(e.target.value)}
                    >
                      {scoreKeysMeta.all.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <div className={`flex gap-1 ${scoreKeysMeta.meta?.[selectedScoreKey]?.hasNumeric ? '' : 'hidden'}`} id="value-section">
                    <select id="fv-op" className="w-12 rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="==">=</option>
                      <option value="!=">!=</option>
                    </select>
                    <input
                      id="fv-val"
                      type="number"
                      step="any"
                      placeholder="val"
                      className="w-14 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const op = document.getElementById('fv-op')?.value
                        const val = parseFloat(e.currentTarget.value)
                        if (!selectedScoreKey || Number.isNaN(val)) return
                        setFilters((prev) => ({ ...prev, valueRules: [...prev.valueRules, { key: selectedScoreKey, op, value: val }] }))
                        e.currentTarget.value = ''
                      }}
                    />
                    <button
                      id="add-fv"
                      className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
                      onClick={() => {
                        const op = document.getElementById('fv-op')?.value
                        const input = document.getElementById('fv-val')
                        const val = parseFloat(input?.value || '')
                        if (!selectedScoreKey || Number.isNaN(val)) return
                        setFilters((prev) => ({ ...prev, valueRules: [...prev.valueRules, { key: selectedScoreKey, op, value: val }] }))
                        if (input) input.value = ''
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div className={`flex gap-1 mt-1 ${scoreKeysMeta.meta?.[selectedScoreKey]?.hasPassed ? '' : 'hidden'}`} id="passed-section">
                    <select id="fp-val" className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                      <option value="true">Passed</option>
                      <option value="false">Failed</option>
                    </select>
                    <button
                      id="add-fp"
                      className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
                      onClick={() => {
                        const val = document.getElementById('fp-val')?.value === 'true'
                        if (!selectedScoreKey) return
                        setFilters((prev) => ({ ...prev, passedRules: [...prev.passedRules, { key: selectedScoreKey, value: val }] }))
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  <button
                    id="filter-has-annotation"
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.annotation === 'yes' ? 'bg-blue-600 text-white' : filters.annotation === 'no' ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, annotation: prev.annotation === 'any' ? 'yes' : prev.annotation === 'yes' ? 'no' : 'any' }))
                    }}
                  >
                    {filters.annotation === 'no' ? 'No Note' : 'Has Note'}
                  </button>
                  <button
                    id="filter-has-error"
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasError === true ? 'bg-blue-600 text-white' : filters.hasError === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                    onClick={() => setFilters((prev) => ({ ...prev, hasError: prev.hasError === null ? true : prev.hasError === true ? false : null }))}
                  >
                    Has Error
                  </button>
                  <button
                    id="filter-has-url"
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasUrl === true ? 'bg-blue-600 text-white' : filters.hasUrl === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                    onClick={() => setFilters((prev) => ({ ...prev, hasUrl: prev.hasUrl === null ? true : prev.hasUrl === true ? false : null }))}
                  >
                    Has URL
                  </button>
                  <button
                    id="filter-has-messages"
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasMessages === true ? 'bg-blue-600 text-white' : filters.hasMessages === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                    onClick={() => setFilters((prev) => ({ ...prev, hasMessages: prev.hasMessages === null ? true : prev.hasMessages === true ? false : null }))}
                  >
                    Has Messages
                  </button>
                </div>
                <div className="mb-2">
                  <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Dataset</div>
                  <div id="dataset-pills" className="flex flex-wrap gap-1">
                    {datasetLabels.datasets.length === 0 ? (
                      <span className="text-[10px] text-zinc-600 italic">None</span>
                    ) : datasetLabels.datasets.map((ds) => {
                      const isInc = filters.selectedDatasets?.include?.includes(ds)
                      const isExc = filters.selectedDatasets?.exclude?.includes(ds)
                      const pillClass = isInc ? 'bg-blue-600 text-white' : isExc ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      return (
                        <button
                          key={ds}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium cursor-pointer ${pillClass}`}
                          onClick={() => {
                            setFilters((prev) => {
                              const next = { ...prev, selectedDatasets: { include: [...prev.selectedDatasets.include], exclude: [...prev.selectedDatasets.exclude] } }
                              const incIdx = next.selectedDatasets.include.indexOf(ds)
                              const excIdx = next.selectedDatasets.exclude.indexOf(ds)
                              if (incIdx >= 0) {
                                next.selectedDatasets.include.splice(incIdx, 1)
                                next.selectedDatasets.exclude.push(ds)
                              } else if (excIdx >= 0) {
                                next.selectedDatasets.exclude.splice(excIdx, 1)
                              } else {
                                next.selectedDatasets.include.push(ds)
                              }
                              return next
                            })
                          }}
                        >
                          {isExc ? `x ${ds}` : ds}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Labels</div>
                  <div id="label-pills" className="flex flex-wrap gap-1">
                    {datasetLabels.labels.length === 0 ? (
                      <span className="text-[10px] text-zinc-600 italic">None</span>
                    ) : datasetLabels.labels.map((la) => {
                      const isInc = filters.selectedLabels?.include?.includes(la)
                      const isExc = filters.selectedLabels?.exclude?.includes(la)
                      const pillClass = isInc ? 'bg-blue-600 text-white' : isExc ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      return (
                        <button
                          key={la}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium cursor-pointer ${pillClass}`}
                          onClick={() => {
                            setFilters((prev) => {
                              const next = { ...prev, selectedLabels: { include: [...prev.selectedLabels.include], exclude: [...prev.selectedLabels.exclude] } }
                              const incIdx = next.selectedLabels.include.indexOf(la)
                              const excIdx = next.selectedLabels.exclude.indexOf(la)
                              if (incIdx >= 0) {
                                next.selectedLabels.include.splice(incIdx, 1)
                                next.selectedLabels.exclude.push(la)
                              } else if (excIdx >= 0) {
                                next.selectedLabels.exclude.splice(excIdx, 1)
                              } else {
                                next.selectedLabels.include.push(la)
                              }
                              return next
                            })
                          }}
                        >
                          {isExc ? `x ${la}` : la}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div id="active-filters" className="flex flex-wrap gap-1 border-t border-zinc-800 pt-2">
                  {filters.valueRules.map((rule, idx) => (
                    <span key={`value-${idx}`} className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                      {rule.key} {rule.op} {rule.value}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, valueRules: prev.valueRules.filter((_, i) => i !== idx) }))
                      }}>x</button>
                    </span>
                  ))}
                  {filters.passedRules.map((rule, idx) => (
                    <span key={`passed-${idx}`} className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                      {rule.key} = {rule.value ? 'pass' : 'fail'}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, passedRules: prev.passedRules.filter((_, i) => i !== idx) }))
                      }}>x</button>
                    </span>
                  ))}
                  {filters.annotation !== 'any' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                      note: {filters.annotation}
                      <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, annotation: 'any' }))}>x</button>
                    </span>
                  ) : null}
                  {(filters.selectedDatasets?.include || []).map((ds) => (
                    <span key={`ds-inc-${ds}`} className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                      {ds}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, selectedDatasets: { ...prev.selectedDatasets, include: prev.selectedDatasets.include.filter((d) => d !== ds) } }))
                      }}>x</button>
                    </span>
                  ))}
                  {(filters.selectedDatasets?.exclude || []).map((ds) => (
                    <span key={`ds-exc-${ds}`} className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
                      x {ds}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, selectedDatasets: { ...prev.selectedDatasets, exclude: prev.selectedDatasets.exclude.filter((d) => d !== ds) } }))
                      }}>x</button>
                    </span>
                  ))}
                  {(filters.selectedLabels?.include || []).map((la) => (
                    <span key={`la-inc-${la}`} className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                      {la}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, selectedLabels: { ...prev.selectedLabels, include: prev.selectedLabels.include.filter((l) => l !== la) } }))
                      }}>x</button>
                    </span>
                  ))}
                  {(filters.selectedLabels?.exclude || []).map((la) => (
                    <span key={`la-exc-${la}`} className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
                      x {la}
                      <button className="ml-1 hover:text-white" onClick={() => {
                        setFilters((prev) => ({ ...prev, selectedLabels: { ...prev.selectedLabels, exclude: prev.selectedLabels.exclude.filter((l) => l !== la) } }))
                      }}>x</button>
                    </span>
                  ))}
                  {filters.hasError !== null ? (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasError ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {filters.hasError ? 'has' : 'no'} error
                      <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasError: null }))}>x</button>
                    </span>
                  ) : null}
                  {filters.hasUrl !== null ? (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasUrl ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {filters.hasUrl ? 'has' : 'no'} URL
                      <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasUrl: null }))}>x</button>
                    </span>
                  ) : null}
                  {filters.hasMessages !== null ? (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasMessages ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {filters.hasMessages ? 'has' : 'no'} messages
                      <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasMessages: null }))}>x</button>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="dropdown relative">
              <button
                ref={columnsToggleRef}
                id="columns-toggle"
                className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
                onClick={() => { setColumnsOpen((prev) => !prev); setFiltersOpen(false) }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-grid"></use>
                </svg>
              </button>
              <div
                ref={columnsMenuRef}
                id="columns-menu"
                className={`columns-panel absolute right-0 z-50 mt-1 w-48 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl ${columnsOpen ? 'active' : ''}`}
              >
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Columns</div>
                {COLUMN_DEFS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100">
                    <input
                      type="checkbox"
                      data-col={col.key}
                      checked={!hiddenSet.has(col.key)}
                      className="accent-blue-500"
                      onChange={(e) => {
                        const next = new Set(hiddenSet)
                        if (e.target.checked) next.delete(col.key)
                        else next.add(col.key)
                        setHiddenColumns(Array.from(next))
                      }}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
                <div className="mt-2 flex gap-1 border-t border-zinc-800 pt-2">
                  <button id="reset-columns" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setHiddenColumns(DEFAULT_HIDDEN_COLS)}>Reset</button>
                  <button id="reset-sorting" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setSortState([])}>Sort</button>
                  <button id="reset-widths" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setColWidths({})}>Width</button>
                </div>
              </div>
            </div>
            <div className="dropdown relative">
              <button
                ref={exportToggleRef}
                id="export-toggle"
                className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
                onClick={() => setExportOpen((prev) => !prev)}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-download"></use>
                </svg>
              </button>
              <div
                ref={exportMenuRef}
                id="export-menu"
                className={`absolute right-0 z-50 mt-1 w-44 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl ${exportOpen ? '' : 'hidden'}`}
              >
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Export</div>
                <button id="export-json-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('json')}>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  JSON
                  <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
                </button>
                <button id="export-csv-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('csv')}>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  CSV
                  <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
                </button>
                <div className="border-t border-zinc-800 my-1.5"></div>
                <div className="text-[9px] text-zinc-500 mb-1 px-2">Filtered view</div>
                <button id="export-md-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('markdown')}>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  Markdown
                </button>
              </div>
            </div>
            <button id="settings-toggle" className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text" onClick={handleSettingsOpen}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-gear"></use>
              </svg>
            </button>
            <div className="flex items-center">
              <span id="compare-mode-label" className={`h-7 items-center px-3 text-xs font-medium text-theme-text-muted select-none cursor-default border border-transparent ${isComparisonMode ? 'flex' : 'hidden'}`}>
                Compare Mode
              </span>
              <button
                id="play-btn"
                className={`flex h-7 items-center gap-1.5 ${runButtonState.showDropdown ? 'rounded-l' : 'rounded'} bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 ${runButtonState.hidden ? 'hidden' : ''}`}
                onClick={() => handleRunExecute(runMode)}
              >
                <svg className={`play-icon h-3 w-3 ${runButtonState.isRunning ? 'hidden' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                  <use href="#icon-play"></use>
                </svg>
                <svg className={`stop-icon h-3 w-3 ${runButtonState.isRunning ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="currentColor">
                  <use href="#icon-stop"></use>
                </svg>
                <span id="play-btn-text">{runButtonState.text}</span>
              </button>
              <div className="dropdown relative">
                <button
                  id="run-dropdown-toggle"
                  className={`h-7 items-center justify-center rounded-r border-l border-emerald-700 bg-emerald-600 px-1.5 text-white hover:bg-emerald-500 ${runButtonState.showDropdown ? 'flex' : 'hidden'}`}
                  onClick={() => setRunMenuOpen((prev) => !prev)}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-chevron-down"></use>
                  </svg>
                </button>
                <div id="run-dropdown-menu" className={`absolute right-0 z-50 mt-1 w-52 rounded border border-zinc-700 bg-zinc-900 py-1 text-xs shadow-xl ${runMenuOpen ? '' : 'hidden'}`}>
                  <button id="run-rerun-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800" onClick={() => { setRunMode('rerun'); setRunMenuOpen(false) }}>
                    <svg className={`h-3 w-3 mt-0.5 text-emerald-400 flex-shrink-0 ${runMode === 'rerun' ? '' : 'invisible'}`} id="rerun-check"><use href="#icon-check"></use></svg>
                    <div>
                      <div className="text-zinc-200">Rerun</div>
                      <div className="text-zinc-500 text-[10px]">Overwrite current run results</div>
                    </div>
                  </button>
                  <button id="run-new-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800" onClick={() => { setRunMode('new'); setRunMenuOpen(false) }}>
                    <svg className={`h-3 w-3 mt-0.5 text-emerald-400 flex-shrink-0 ${runMode === 'new' ? '' : 'invisible'}`} id="new-check"><use href="#icon-check"></use></svg>
                    <div>
                      <div className="text-zinc-200">New Run</div>
                      <div className="text-zinc-500 text-[10px]">Create a fresh run in this session</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4">
        {renderStatsExpanded()}
        {renderStatsCompact()}

        {isComparisonMode ? (
          <table id="results-table" className="w-full table-fixed border-collapse text-sm text-theme-text comparison-table">
            <thead>
              <tr className="border-b border-theme-border">
                <th data-col="function" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => handleToggleSort('function', 'string', e.shiftKey)}>Eval</th>
                <th data-col="input" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => handleToggleSort('input', 'string', e.shiftKey)}>Input</th>
                <th data-col="reference" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => handleToggleSort('reference', 'string', e.shiftKey)}>Reference</th>
                {normalizedComparisonRuns.map((run) => (
                  <th
                    key={run.runId}
                    data-col={`output-${run.runId}`}
                    style={{ width: `${Math.floor(50 / normalizedComparisonRuns.length)}%`, borderLeft: `2px solid ${run.color}40` }}
                    className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider comparison-output-header"
                    onClick={(e) => handleToggleSort(`output-${run.runId}`, 'string', e.shiftKey)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: run.color }}></span>
                      <span className="truncate">{run.runName}</span>
                    </span>
                  </th>
                ))}
                <th style={{ width: '28px' }} className="bg-theme-bg px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border-subtle">
              {sortedComparisonRows.map((row) => {
                const meta = row.entry?._meta || {}
                const labelsHtml = meta.labels?.length ? (
                  <>
                    <span className="text-zinc-700">.</span>
                    {meta.labels.map((la) => (
                      <span key={la} className="rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted">{la}</span>
                    ))}
                  </>
                ) : null
                return (
                  <tr key={row.key} data-row="main" data-row-id={row.index} data-compare-key={row.key} className="group hover:bg-theme-bg-elevated/50 transition-colors">
                    <td data-col="function" className="px-3 py-3 align-middle">
                      <div className="flex flex-col gap-0.5">
                        {row.linkIndex != null ? (
                          <a
                            href={`/runs/${row.linkRunId}/results/${row.linkIndex}`}
                            className="font-mono text-[12px] font-medium text-accent-link hover:text-accent-link-hover"
                            onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
                          >
                            {meta.function}
                          </a>
                        ) : (
                          <span className="font-mono text-[12px] font-medium text-theme-text">{meta.function}</span>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span>{meta.dataset || ''}</span>{labelsHtml}</div>
                      </div>
                    </td>
                    <td data-col="input" className="px-3 py-3 align-middle">
                      <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.input)}</div>
                    </td>
                    <td data-col="reference" className="px-3 py-3 align-middle">
                      {row.firstResult?.result?.reference != null ? (
                        <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.reference)}</div>
                      ) : (
                        <span className="text-zinc-600">--</span>
                      )}
                    </td>
                    {normalizedComparisonRuns.map((run) => {
                      const entry = row.entry?.[run.runId]
                      const result = entry?.result
                      if (!result) {
                        return (
                          <td key={run.runId} data-col={`output-${run.runId}`} className="px-3 py-3 align-middle comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                            <span className="text-zinc-600">--</span>
                          </td>
                        )
                      }
                      const errorHtml = result.error ? (
                        <div className="text-[10px] text-accent-error truncate" title={result.error}>Error: {result.error.split('\n')[0]}</div>
                      ) : null
                      return (
                        <td key={run.runId} data-col={`output-${run.runId}`} className="px-3 py-3 comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                          <div className="comparison-output-content">
                            <div>
                              <div className="line-clamp-3 text-[12px] text-theme-text">{result.output != null ? formatValue(result.output) : '--'}</div>
                              {errorHtml}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              <InlineScoreBadges scores={result.scores || []} latency={result.latency} />
                            </div>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-1 py-3 align-middle"></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table id="results-table" data-run-id={data?.run_id} className="w-full table-fixed border-collapse text-sm text-theme-text">
            <thead>
              <tr className="border-b border-theme-border">
                <th style={{ width: '32px' }} className="bg-theme-bg px-2 py-2 text-center align-middle">
                  <input
                    type="checkbox"
                    id="select-all-checkbox"
                    ref={selectAllRef}
                    className="accent-emerald-500"
                    checked={sortedRows.length > 0 && sortedRows.every((row) => selectedIndices.has(row.index))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                {COLUMN_DEFS.map((col) => (
                  <th
                    key={col.key}
                    data-col={col.key}
                    data-type={col.type}
                    ref={(el) => { headerRefs.current[col.key] = el }}
                    style={{ width: colWidths[col.key] ? `${colWidths[col.key]}px` : col.width, textAlign: col.align }}
                    className={`bg-theme-bg px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-theme-text-muted ${hiddenSet.has(col.key) ? 'hidden' : ''}`}
                    aria-sort={(() => {
                      const s = sortState.find((item) => item.col === col.key)
                      if (!s) return 'none'
                      return s.dir === 'asc' ? 'ascending' : 'descending'
                    })()}
                    onClick={(e) => handleToggleSort(col.key, col.type, e.shiftKey)}
                  >
                    {col.label}
                    <div className="col-resizer" onMouseDown={(e) => handleResizeStart(col.key, e)}></div>
                  </th>
                ))}
                <th style={{ width: '28px' }} className="bg-theme-bg px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border-subtle">
              {sortedRows.map((row) => {
                const result = row.result
                const status = result.status || 'completed'
                const isRunning = status === 'running'
                const isNotStarted = status === 'not_started'
                const scores = result.scores || []
                const functionCell = isNotStarted ? (
                  <span className="font-mono text-[12px] font-medium text-zinc-500">{row.function}</span>
                ) : (
                  <a
                    href={`/runs/${data?.run_id}/results/${row.index}`}
                    className="font-mono text-[12px] font-medium text-accent-link hover:text-accent-link-hover"
                    onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
                  >
                    {row.function}
                  </a>
                )
                let statusPill = null
                if (status === 'running') statusPill = <span className={`status-pill rounded px-1.5 py-0.5 text-[10px] font-medium ${PILL_TONES.running}`}>running</span>
                else if (status === 'error') statusPill = <span className={`status-pill rounded px-1.5 py-0.5 text-[10px] font-medium ${PILL_TONES.error}`}>err</span>

                let outputCell
                if (isNotStarted) outputCell = <span className="text-zinc-600">--</span>
                else if (isRunning) outputCell = (
                  <div className="space-y-1">
                    <div className="h-2.5 w-3/4 animate-pulse rounded bg-zinc-800"></div>
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-zinc-800"></div>
                  </div>
                )
                else if (result.output != null) outputCell = <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.output)}</div>
                else outputCell = <span className="text-zinc-600">--</span>

                let scoresCell
                if (isNotStarted) scoresCell = <span className="text-zinc-600">--</span>
                else if (isRunning) scoresCell = (
                  <div className="flex gap-1">
                    <div className="h-4 w-14 animate-pulse rounded bg-zinc-800"></div>
                    <div className="h-4 w-10 animate-pulse rounded bg-zinc-800"></div>
                  </div>
                )
                else if (scores.length) {
                  scoresCell = (
                    <div className="flex flex-wrap gap-1">
                      {scores.map((s, idx) => {
                        let badgeClass = 'bg-theme-bg-elevated text-theme-text-muted'
                        if (s.passed === true) badgeClass = 'bg-accent-success-bg text-accent-success'
                        else if (s.passed === false) badgeClass = 'bg-accent-error-bg text-accent-error'
                        const val = s.value != null ? `:${typeof s.value === 'number' ? s.value.toFixed(1) : s.value}` : ''
                        const title = `${s.key}${s.value != null ? ': ' + (typeof s.value === 'number' ? s.value.toFixed(3) : s.value) : ''}${s.notes ? ' -- ' + s.notes : ''}`
                        return (
                          <span key={`${s.key}-${idx}`} className={`score-badge shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`} title={title}>
                            {s.key}{val}
                          </span>
                        )
                      })}
                    </div>
                  )
                } else scoresCell = <span className="text-zinc-600">--</span>

                let latencyCell
                if (result.latency != null) {
                  const lat = result.latency
                  const latColor = lat <= 1 ? 'text-accent-success' : (lat <= 5 ? 'text-theme-text-muted' : 'text-accent-error')
                  latencyCell = <span className={`latency-value font-mono text-[11px] ${latColor}`}>{lat.toFixed(2)}s</span>
                } else if (isRunning) latencyCell = <div className="latency-skeleton ml-auto h-3 w-8 animate-pulse rounded bg-zinc-800"></div>
                else latencyCell = <span className="text-zinc-600">--</span>

                return (
                  <tr
                    key={row.index}
                    data-row="main"
                    data-row-id={row.index}
                    data-status={status}
                    data-scores={JSON.stringify(scores)}
                    data-annotation={row.annotation}
                    data-dataset={row.dataset}
                    data-labels={JSON.stringify(row.labels)}
                    data-has-url={row.hasUrl}
                    data-has-messages={row.hasMessages}
                    data-has-error={row.hasError}
                    className={`group cursor-pointer hover:bg-theme-bg-elevated/50 transition-colors ${isNotStarted ? 'opacity-60' : ''} ${expandedRows.has(row.index) ? 'expanded' : ''}`}
                    onClick={(event) => {
                      if (event.target.closest('input,button,a')) return
                      handleRowToggle(row.index)
                    }}
                  >
                    <td className="px-2 py-3 text-center align-middle" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="row-checkbox"
                        data-row-id={row.index}
                        checked={selectedIndices.has(row.index)}
                        onChange={(e) => handleRowSelect(row.index, e.target.checked, e.nativeEvent.shiftKey)}
                      />
                    </td>
                    <td data-col="function" className={`px-3 py-3 align-middle ${hiddenSet.has('function') ? 'hidden' : ''}`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">{functionCell}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                          {statusPill}
                          <span>{row.dataset || ''}</span>
                          {row.labels?.length ? (
                            <>
                              <span className="text-zinc-700">.</span>
                              {row.labels.map((la) => (
                                <span key={la} className="rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted">{la}</span>
                              ))}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td data-col="input" title={formatValue(result.input)} className={`px-3 py-3 align-middle ${hiddenSet.has('input') ? 'hidden' : ''}`}>
                      <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.input)}</div>
                    </td>
                    <td data-col="reference" title={formatValue(result.reference)} className={`px-3 py-3 align-middle ${hiddenSet.has('reference') ? 'hidden' : ''}`}>
                      {result.reference != null ? (
                        <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(result.reference)}</div>
                      ) : (
                        <span className="text-zinc-600">--</span>
                      )}
                    </td>
                    <td data-col="output" title={formatValue(result.output)} className={`px-3 py-3 align-middle ${hiddenSet.has('output') ? 'hidden' : ''}`}>
                      {outputCell}
                    </td>
                    <td data-col="error" title={result.error || ''} className={`px-3 py-3 align-middle ${hiddenSet.has('error') ? 'hidden' : ''}`}>
                      {result.error ? (
                        <div className="line-clamp-4 text-[12px] text-accent-error">{result.error}</div>
                      ) : (
                        <span className="text-zinc-600">--</span>
                      )}
                    </td>
                    <td data-col="scores" data-value={getRowSortValue(row, 'scores')} className={`px-3 py-3 align-middle ${hiddenSet.has('scores') ? 'hidden' : ''}`}>
                      {scoresCell}
                    </td>
                    <td data-col="latency" data-value={result.latency ?? ''} className={`px-3 py-3 align-middle text-right ${hiddenSet.has('latency') ? 'hidden' : ''}`}>
                      {latencyCell}
                    </td>
                    <td className="px-1 py-3 align-middle">
                      <span className="expand-chevron text-zinc-700 group-hover:text-zinc-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-chevron-right"></use></svg>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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

      {settingsOpen ? (
        <div id="settings-modal" className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" id="settings-backdrop" onClick={() => setSettingsOpen(false)}></div>
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-theme-text">Settings</span>
              <button id="settings-close" className="text-theme-text-muted hover:text-theme-text-secondary" onClick={() => setSettingsOpen(false)}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-close"></use>
                </svg>
              </button>
            </div>
            <form id="settings-form" className="space-y-3 text-xs" onSubmit={handleSettingsSave}>
              <div className="flex items-center justify-between">
                <label className="text-theme-text-muted">Concurrency</label>
                <input
                  type="number"
                  name="concurrency"
                  min="0"
                  className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
                  value={settingsForm.concurrency}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, concurrency: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-theme-text-muted">Results dir</label>
                <input
                  type="text"
                  name="results_dir"
                  className="w-32 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
                  value={settingsForm.results_dir}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, results_dir: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-theme-text-muted">Timeout (s)</label>
                <input
                  type="number"
                  name="timeout"
                  min="0"
                  step="0.1"
                  className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
                  placeholder="none"
                  value={settingsForm.timeout}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, timeout: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-theme-text-muted">Theme</label>
                <button type="button" id="theme-toggle" className="flex items-center gap-1.5 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text-secondary hover:bg-theme-bg-elevated" onClick={handleThemeToggle}>
                  <svg className="hidden dark:block h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-sun"></use>
                  </svg>
                  <svg className="block dark:hidden h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-moon"></use>
                  </svg>
                  <span className="dark:hidden">Dark</span><span className="hidden dark:inline">Light</span>
                </button>
              </div>
              <div className="flex justify-end gap-2 border-t border-theme-border pt-3">
                <button type="button" id="settings-cancel" className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-theme-text-muted hover:bg-theme-bg-elevated" onClick={() => setSettingsOpen(false)}>Cancel</button>
                <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500">Save</button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div id="settings-modal" className="fixed inset-0 z-50 hidden"></div>
      )}

      <FloatingMenu anchorRef={statsExpanded ? runDropdownExpandedRef : runDropdownCompactRef} open={runDropdownOpen} onClose={() => setRunDropdownOpen(false)}>
        {sessionRuns.map((run) => {
          const isCurrent = run.run_id === data?.run_id
          return (
            <button
              key={run.run_id}
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
