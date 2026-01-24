export const DEFAULT_HIDDEN_COLS = ['error']
export const COMPARISON_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']

export function defaultFilters() {
  return {
    valueRules: [],
    passedRules: [],
    annotation: 'any',
    selectedDatasets: { include: [], exclude: [] },
    selectedLabels: { include: [], exclude: [] },
    hasUrl: null,
    hasMessages: null,
    hasError: null,
  }
}

export function summarizeStats(data) {
  const results = data?.results || []
  const chips = data?.score_chips || []
  const totalEvaluations = data?.total_evaluations || 0
  const totalErrors = data?.total_errors || 0
  const selectedTotal = data?.selected_total
  const avgLatency = data?.average_latency || 0
  let completed = 0
  let pending = 0
  let running = 0
  let notStarted = 0

  results.forEach((r) => {
    const status = r.result?.status || 'completed'
    if (status === 'not_started') notStarted += 1
    else if (status === 'pending') pending += 1
    else if (status === 'running') running += 1
    else completed += 1
  })

  const inProgress = pending + running
  const isSelectiveRun = selectedTotal != null && selectedTotal > 0
  const progressTotal = isSelectiveRun ? selectedTotal : totalEvaluations
  const progressCompleted = isSelectiveRun ? (selectedTotal - inProgress) : completed
  const pctDone = progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0

  return {
    results,
    chips,
    total: totalEvaluations,
    totalErrors,
    progressTotal,
    progressCompleted,
    avgLatency,
    completed,
    pending,
    running,
    notStarted,
    pctDone,
    progressPending: inProgress,
    sessionName: data?.session_name,
    runName: data?.run_name,
    runId: data?.run_id,
    isRunning: inProgress > 0,
  }
}

export function chipStats(chip, precision = 2) {
  if (!chip) return { pct: 0, value: '0' }
  if (chip.type === 'ratio') {
    const pct = chip.total > 0 ? Math.round((chip.passed / chip.total) * 100) : 0
    return { pct, value: `${chip.passed}/${chip.total}` }
  }
  const avg = chip.avg
  const pct = avg <= 1 ? Math.round(avg * 100) : (avg <= 10 ? Math.round(avg * 10) : Math.min(Math.round(avg), 100))
  return { pct, value: avg.toFixed(precision) }
}

export function formatValue(val) {
  if (val == null) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export function getBarColor(pct) {
  return pct >= 80 ? 'vbar-green' : (pct >= 50 ? 'vbar-amber' : 'vbar-red')
}

export function getBgBarColor(pct) {
  return pct >= 80 ? 'bg-emerald-500' : (pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')
}

export function getTextColor(pct) {
  return pct >= 80 ? 'text-accent-success' : (pct >= 50 ? 'text-amber-500' : 'text-accent-error')
}

export function formatRunTimestamp(ts) {
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function getResultKey(result) {
  return `${result.function}::${result.dataset || ''}`
}

export function buildComparisonMatrix(comparisonData) {
  const matrix = {}
  Object.entries(comparisonData || {}).forEach(([runId, data]) => {
    ;(data?.results || []).forEach((r, idx) => {
      const key = getResultKey(r)
      if (!matrix[key]) matrix[key] = { _meta: { function: r.function, dataset: r.dataset, labels: r.labels }, _indices: {} }
      if (!matrix[key]._indices) matrix[key]._indices = {}
      matrix[key][runId] = r
      matrix[key]._indices[runId] = idx
    })
  })
  return matrix
}

export function computeScoreKeyMeta(results) {
  const meta = {}
  ;(results || []).forEach((r) => {
    const scores = r?.result?.scores || r?.scores || []
    scores.forEach((s) => {
      if (!s?.key) return
      if (!meta[s.key]) meta[s.key] = { hasNumeric: false, hasPassed: false }
      if (typeof s.value === 'number' && !Number.isNaN(s.value)) meta[s.key].hasNumeric = true
      if (s.passed === true || s.passed === false) meta[s.key].hasPassed = true
    })
  })
  const all = Object.keys(meta).sort()
  return { all, meta }
}

export function computeDatasetLabels(results) {
  const datasets = new Set()
  const labels = new Set()
  ;(results || []).forEach((r) => {
    const ds = (r.dataset || '').trim()
    if (ds) datasets.add(ds)
    ;(r.labels || []).forEach((l) => labels.add(l))
  })
  return { datasets: Array.from(datasets).sort(), labels: Array.from(labels).sort() }
}

export function compareOp(op, a, b) {
  if (op === '>') return a > b
  if (op === '>=') return a >= b
  if (op === '<') return a < b
  if (op === '<=') return a <= b
  if (op === '==') return a === b
  if (op === '!=') return a !== b
  return false
}

export function matchesFiltersForData(filters, data) {
  const f = filters || defaultFilters()
  const annotation = (data.annotation || '').trim()
  const ds = (data.dataset || '').trim()
  const rowLabels = Array.isArray(data.labels) ? data.labels : []
  const scores = Array.isArray(data.scores) ? data.scores : []
  const hasError = !!data.hasError
  const hasUrl = !!data.hasUrl
  const hasMessages = !!data.hasMessages

  if (f.annotation && f.annotation !== 'any') {
    const has = !!annotation
    if (f.annotation === 'yes' && !has) return false
    if (f.annotation === 'no' && has) return false
  }
  if (f.selectedDatasets?.include?.length > 0) {
    if (!f.selectedDatasets.include.includes(ds)) return false
  }
  if (f.selectedDatasets?.exclude?.includes(ds)) return false
  if (f.selectedLabels?.include?.length > 0) {
    if (!f.selectedLabels.include.some((l) => rowLabels.includes(l))) return false
  }
  if (f.selectedLabels?.exclude?.length > 0) {
    if (f.selectedLabels.exclude.some((l) => rowLabels.includes(l))) return false
  }
  if (f.hasError === true && !hasError) return false
  if (f.hasError === false && hasError) return false
  if (f.hasUrl === true && !hasUrl) return false
  if (f.hasUrl === false && hasUrl) return false
  if (f.hasMessages === true && !hasMessages) return false
  if (f.hasMessages === false && hasMessages) return false

  for (const vr of f.valueRules || []) {
    const s = scores.find((x) => x && x.key === vr.key)
    if (!s) return false
    const val = parseFloat(s.value)
    if (Number.isNaN(val)) return false
    if (!compareOp(vr.op, val, vr.value)) return false
  }
  for (const pr of f.passedRules || []) {
    const s = scores.find((x) => x && x.key === pr.key)
    if (!s) return false
    if ((s.passed === true) !== (pr.value === true)) return false
  }
  return true
}

export function computeFilteredStats(rows) {
  const total = rows.length
  let latencySum = 0
  let latencyCount = 0
  const scoreMap = {}

  rows.forEach((row) => {
    const result = row?.result || row?.resultData || row?.result
    const latency = result?.latency
    if (typeof latency === 'number' && !Number.isNaN(latency)) {
      latencySum += latency
      latencyCount += 1
    }
    const scores = result?.scores || row?.scores || []
    scores.forEach((s) => {
      const key = s?.key
      if (!key) return
      const d = scoreMap[key] || (scoreMap[key] = { passed: 0, failed: 0, bool: 0, sum: 0, count: 0 })
      if (s.passed === true) { d.passed += 1; d.bool += 1 }
      else if (s.passed === false) { d.failed += 1; d.bool += 1 }
      const val = parseFloat(s.value)
      if (!Number.isNaN(val)) { d.sum += val; d.count += 1 }
    })
  })

  const chips = Object.entries(scoreMap).map(([key, d]) => {
    if (d.bool > 0) {
      return { key, type: 'ratio', passed: d.passed, total: d.passed + d.failed }
    }
    if (d.count > 0) {
      return { key, type: 'avg', avg: d.sum / d.count, count: d.count }
    }
    return null
  }).filter(Boolean)

  return { total, filtered: total, avgLatency: latencyCount > 0 ? latencySum / latencyCount : 0, chips }
}

export function isFilterActive(filters, search) {
  const f = filters || defaultFilters()
  const dsCount = (f.selectedDatasets?.include?.length || 0) + (f.selectedDatasets?.exclude?.length || 0)
  const lblCount = (f.selectedLabels?.include?.length || 0) + (f.selectedLabels?.exclude?.length || 0)
  const traceCount = (f.hasError !== null ? 1 : 0) + (f.hasUrl !== null ? 1 : 0) + (f.hasMessages !== null ? 1 : 0)
  const hasFilterRules = (f.valueRules.length + f.passedRules.length + dsCount + lblCount + traceCount + (f.annotation !== 'any' ? 1 : 0)) > 0
  const hasSearch = (search || '').trim().length > 0
  return hasFilterRules || hasSearch
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareValues(a, b, type, col) {
  if (type === 'number') {
    if (col === 'scores') {
      const aEmpty = !isFinite(a)
      const bEmpty = !isFinite(b)
      if (aEmpty && !bEmpty) return 1
      if (!aEmpty && bEmpty) return -1
      if (aEmpty && bEmpty) return 0
    }
    return a - b
  }
  return collator.compare(a, b)
}

export function parseSortValue(value, type) {
  if (type === 'number') {
    const num = parseFloat(value)
    return Number.isNaN(num) ? Number.POSITIVE_INFINITY : num
  }
  return value
}

export function normalizeComparisonRuns(runs) {
  if (!Array.isArray(runs)) return []
  return runs.map((r, i) => ({
    runId: r.runId || r.run_id,
    runName: r.runName || r.run_name || r.runId || r.run_id,
    color: COMPARISON_COLORS[i] || r.color,
  })).filter((r) => r.runId)
}
