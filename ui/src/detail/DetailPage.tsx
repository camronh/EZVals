import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComparisonRun, NormalizedComparisonRun, RunResultRow, Score, TraceData } from '../types'
import { getResultKey, normalizeComparisonRuns } from '../dashboard/utils'
import { DataViewer, extractToolNamesFromMessages, getRawText } from '../components/DataViewer'

const DETAIL_BODY_CLASS = 'min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100'
const COMPARISON_STORAGE_KEY = 'ezvals:comparisonRuns'
const DETAIL_LAYOUT_STORAGE_KEY = 'ezvals:detailLayout'
const DETAIL_HEADER_HEIGHT = 120

type ResultDetailPayload = {
  result: RunResultRow
  index: number
  total: number
  run_id: string
  session_name?: string | null
  run_name?: string | null
  eval_path?: string | null
}

type ComparisonRunDetail = {
  runId: string
  runName: string
  color: string
  evalPath: string | null
  result: RunResultRow | null
  resultIndex: number | null
}

type ComparisonState = {
  baseResult: RunResultRow | null
  runs: ComparisonRunDetail[]
}

type CollapsedState = {
  metadata: boolean
  trace: boolean
}

type ResizeType = 'input-width' | 'ref-height' | 'sidebar-width' | 'comparison-input-width' | 'comparison-context-height'

type ResizeState = {
  type: ResizeType
  startX: number
  startY: number
  startValue: number
  container: HTMLDivElement
}

function useBodyClass(bodyClass: string, title?: string) {
  useEffect(() => {
    if (title) document.title = title
    document.body.className = bodyClass
    return () => {
      document.body.className = ''
    }
  }, [bodyClass, title])
}

function buildRunCommand(path: string | null | undefined, name: string | null | undefined) {
  return path ? `ezvals run ${path}::${name}` : `ezvals run ${name || ''}`.trim()
}

function getLatencyColor(latency?: number | null) {
  if (latency == null) return ''
  if (latency <= 1) return 'text-emerald-600 dark:text-emerald-400'
  if (latency <= 5) return 'text-blue-600 dark:text-blue-400'
  return 'text-amber-600 dark:text-amber-400'
}

function formatMetadataLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

type CopyButtonProps = {
  getText: string | (() => string)
  className?: string
  title?: string
}

function CopyButton({ getText, className = '', title = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      const text = typeof getText === 'function' ? getText() : String(getText || '')
      if (!text) return
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore copy failures
    }
  }, [getText])

  return (
    <button className={className} onClick={handleCopy} title={title}>
      <svg className={`copy-icon h-3.5 w-3.5 ${copied ? 'hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      <svg className={`check-icon h-3.5 w-3.5 text-emerald-500 ${copied ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </button>
  )
}

type ScoreCardProps = {
  score: Score
  onEdit: () => void
}

function ScoreCard({ score, onEdit }: ScoreCardProps) {
  let cls = 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50'
  let textCls = 'text-zinc-700 dark:text-zinc-300'
  let valueCls = 'text-zinc-500'
  if (score.passed === true) {
    cls = 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
    textCls = 'text-emerald-700 dark:text-emerald-300'
    valueCls = 'text-emerald-600 dark:text-emerald-400'
  } else if (score.passed === false) {
    cls = 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
    textCls = 'text-rose-700 dark:text-rose-300'
    valueCls = 'text-rose-600 dark:text-rose-400'
  }

  return (
    <div className={`group rounded border px-2.5 py-1.5 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs font-medium ${textCls}`}>{score.key}</span>
        <div className="flex items-center gap-1.5">
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            title="Edit score"
            onClick={onEdit}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          {score.value != null ? <span className={`font-mono text-xs ${valueCls}`}>{score.value}</span> : null}
          {score.passed === true ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
            </span>
          ) : null}
          {score.passed === false ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </span>
          ) : null}
        </div>
      </div>
      {score.notes ? <div className={`mt-1 text-[11px] ${valueCls}`}>{score.notes}</div> : null}
    </div>
  )
}

type InlineScoreBadgesProps = {
  scores: Score[]
  latency?: number | null
  annotation?: string | null
}

function InlineScoreBadges({ scores, latency, annotation }: InlineScoreBadgesProps) {
  const annotationText = annotation?.trim()

  return (
    <div className="flex flex-wrap gap-1.5">
      {(scores || []).map((score, idx) => {
        let badgeClass = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300'
        if (score.passed === true) badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        else if (score.passed === false) badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        const valueText = score.value != null
          ? (typeof score.value === 'number' ? score.value.toFixed(2) : String(score.value))
          : (score.passed === true ? 'true' : (score.passed === false ? 'false' : '—'))
        const title = `${score.key}: ${valueText}${score.notes ? ` | notes: ${score.notes}` : ''}`
        return (
          <span key={`${score.key}-${idx}`} title={title} className={`rounded border border-current/15 px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}>
            {score.key}: {valueText}
          </span>
        )
      })}
      {latency != null ? (
        <span className={`rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900/60 ${getLatencyColor(latency) || 'text-zinc-500'}`}>
          {latency.toFixed(2)}s
        </span>
      ) : null}
      {annotationText ? (
        <span
          title={annotationText}
          className="max-w-[220px] truncate rounded border border-amber-300/60 bg-amber-100/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
        >
          {annotationText}
        </span>
      ) : null}
    </div>
  )
}

export default function DetailPage() {
  useBodyClass(DETAIL_BODY_CLASS, 'Result Detail - EZVals')

  const forceSingleDetailMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('mode') === 'single'
  }, [])

  const [{ runId, index }] = useState<{ runId: string; index: number }>(() => {
    const match = window.location.pathname.match(/\/runs\/([^/]+)\/results\/(\d+)/)
    return {
      runId: match ? match[1] : 'latest',
      index: match ? parseInt(match[2], 10) : 0,
    }
  })
  const comparisonRunIdsFromQuery = useMemo(() => {
    const ids = Array.from(new Set(new URLSearchParams(window.location.search).getAll('compare_run_id').map((x) => x.trim()).filter(Boolean)))
    if (ids.length === 1 && ids[0] !== runId) return [runId, ids[0]]
    return ids
  }, [runId])
  const detailSearchSuffix = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    params.delete('compare_run_id')
    comparisonRunIdsFromQuery.forEach((id) => params.append('compare_run_id', id))
    const query = params.toString()
    return query ? `?${query}` : ''
  }, [comparisonRunIdsFromQuery])
  const buildDetailHref = useCallback((targetRunId: string, targetIndex: number) => {
    return `/runs/${targetRunId}/results/${targetIndex}${detailSearchSuffix}`
  }, [detailSearchSuffix])
  const savedLayout = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(DETAIL_LAYOUT_STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as {
        inputWidth?: number
        comparisonInputWidth?: number
        refHeight?: number
        comparisonContextHeight?: number
        sidebarWidth?: number
      }
    } catch {
      return null
    }
  }, [])

  const [data, setData] = useState<ResultDetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<CollapsedState>({ metadata: false, trace: true })
  const [comparison, setComparison] = useState<ComparisonState | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState(false)
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  const [editingScoreIndex, setEditingScoreIndex] = useState<number | null>(null)
  const [scoreDraftKind, setScoreDraftKind] = useState<'bool' | 'value'>('value')
  const [scoreBoolUsesValue, setScoreBoolUsesValue] = useState(false)
  const [scoreDraftValue, setScoreDraftValue] = useState('')
  const [scoreDraftPassed, setScoreDraftPassed] = useState('unset')
  const [scoreDraftNotes, setScoreDraftNotes] = useState('')
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [inputWidth, setInputWidth] = useState(() => savedLayout?.inputWidth ?? (window.innerWidth < 1100 ? 55 : 50))
  const [comparisonInputWidth, setComparisonInputWidth] = useState(() => savedLayout?.comparisonInputWidth ?? (window.innerWidth < 1100 ? 55 : 50))
  const [refHeight, setRefHeight] = useState(() => {
    if (savedLayout?.refHeight != null) return savedLayout.refHeight
    const availableHeight = Math.max(200, window.innerHeight - DETAIL_HEADER_HEIGHT)
    return Math.max(100, Math.min(150, Math.floor(availableHeight * 0.3)))
  })
  const [comparisonContextHeight, setComparisonContextHeight] = useState(() => {
    if (savedLayout?.comparisonContextHeight != null) return savedLayout.comparisonContextHeight
    const availableHeight = Math.max(240, window.innerHeight - DETAIL_HEADER_HEIGHT)
    return Math.max(160, Math.min(360, Math.floor(availableHeight * 0.35)))
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (savedLayout?.sidebarWidth != null) return savedLayout.sidebarWidth
    return Math.max(220, Math.min(320, Math.floor(window.innerWidth * 0.28)))
  })
  const resizingRef = useRef<ResizeState | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const comparisonRuns = useMemo<NormalizedComparisonRun[]>(() => {
    if (comparisonRunIdsFromQuery.length) {
      const normalized = normalizeComparisonRuns(comparisonRunIdsFromQuery.map((id) => ({ runId: id, runName: id })))
      sessionStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(normalized))
      return normalized
    }
    try {
      const saved = sessionStorage.getItem(COMPARISON_STORAGE_KEY)
      if (!saved) return []
      const parsed = JSON.parse(saved) as ComparisonRun[]
      return normalizeComparisonRuns(parsed || [])
    } catch {
      return []
    }
  }, [comparisonRunIdsFromQuery])

  const isComparisonMode = !forceSingleDetailMode && comparisonRuns.length > 1

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${index}`)
      if (!resp.ok) throw new Error('Failed to load result')
      const payload = await resp.json() as ResultDetailPayload
      setData(payload)
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error('Failed to load result')
      setError(nextError)
    } finally {
      setLoading(false)
    }
  }, [index, runId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    const handleViewportResize = () => {
      const maxSidebar = Math.max(220, Math.min(600, Math.floor(window.innerWidth * 0.35)))
      const availableHeight = Math.max(200, window.innerHeight - DETAIL_HEADER_HEIGHT)
      const maxRefHeight = Math.max(100, Math.min(400, Math.floor(availableHeight * 0.35)))
      const maxComparisonContextHeight = Math.max(160, Math.min(560, Math.floor(availableHeight * 0.6)))
      setSidebarWidth((prev) => Math.min(prev, maxSidebar))
      setRefHeight((prev) => Math.min(prev, maxRefHeight))
      setComparisonContextHeight((prev) => Math.min(prev, maxComparisonContextHeight))
    }
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [])

  useEffect(() => {
    if (!data || !isComparisonMode) {
      setComparison(null)
      return
    }

    let active = true

    async function loadComparison() {
      const baseResult = data.result
      const key = baseResult ? getResultKey(baseResult) : ''
      const runs: ComparisonRunDetail[] = await Promise.all(comparisonRuns.map(async (run) => {
        if (run.runId === data.run_id) {
          return {
            runId: run.runId,
            runName: data.run_name || run.runId,
            color: run.color,
            evalPath: data.eval_path,
            result: baseResult,
            resultIndex: data.index,
          }
        }
        try {
          const resp = await fetch(`/api/runs/${encodeURIComponent(run.runId)}/data`)
          if (!resp.ok) throw new Error('Failed')
          const runData = await resp.json() as { run_name?: string; eval_path?: string | null; results?: RunResultRow[] }
          let match: RunResultRow | null = null
          let matchIndex: number | null = null
          if (key && runData?.results) {
            const idx = runData.results.findIndex((r) => getResultKey(r) === key)
            if (idx >= 0) {
              match = runData.results[idx]
              matchIndex = idx
            }
          }
          return {
            runId: run.runId,
            runName: runData?.run_name || run.runName || run.runId,
            color: run.color,
            evalPath: runData?.eval_path,
            result: match,
            resultIndex: matchIndex,
          }
        } catch {
          return {
            runId: run.runId,
            runName: run.runName || run.runId,
            color: run.color,
            evalPath: null,
            result: null,
            resultIndex: null,
          }
        }
      }))

      if (!active) return
      setComparison({ baseResult: baseResult || runs.find((r) => r.result)?.result || null, runs })
    }

    loadComparison()
    return () => { active = false }
  }, [comparisonRuns, data, isComparisonMode])

  useLayoutEffect(() => {
    sessionStorage.setItem(
      DETAIL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ inputWidth, comparisonInputWidth, refHeight, comparisonContextHeight, sidebarWidth }),
    )
  }, [comparisonContextHeight, comparisonInputWidth, inputWidth, refHeight, sidebarWidth])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (editingAnnotation || editingScoreIndex != null) return
      if (event.key === 'Escape') {
        window.location.href = '/'
      } else if (event.key === 'ArrowUp') {
        if (data && data.index > 0) window.location.href = buildDetailHref(runId, data.index - 1)
      } else if (event.key === 'ArrowDown') {
        if (data && data.index < data.total - 1) window.location.href = buildDetailHref(runId, data.index + 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [data, runId, editingAnnotation, editingScoreIndex, buildDetailHref])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const { type, startX, startY, startValue, container } = resizingRef.current
      if (type === 'input-width') {
        const dx = e.clientX - startX
        const containerWidth = Math.max(1, container.offsetWidth - sidebarWidth)
        const newPct = Math.max(20, Math.min(80, startValue + (dx / containerWidth) * 100))
        setInputWidth(newPct)
      } else if (type === 'comparison-input-width') {
        const dx = e.clientX - startX
        const containerWidth = Math.max(1, container.offsetWidth)
        const newPct = Math.max(20, Math.min(80, startValue + (dx / containerWidth) * 100))
        setComparisonInputWidth(newPct)
      } else if (type === 'ref-height') {
        const dy = startY - e.clientY
        const newHeight = Math.max(60, Math.min(400, startValue + dy))
        setRefHeight(newHeight)
      } else if (type === 'comparison-context-height') {
        const dy = startY - e.clientY
        const maxHeight = Math.max(180, Math.min(700, Math.floor(container.offsetHeight * 0.7)))
        const newHeight = Math.max(120, Math.min(maxHeight, startValue + dy))
        setComparisonContextHeight(newHeight)
      } else if (type === 'sidebar-width') {
        const dx = startX - e.clientX
        const newWidth = Math.max(200, Math.min(600, startValue + dx))
        setSidebarWidth(newWidth)
      }
    }
    const handleMouseUp = () => {
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [sidebarWidth])

  const startResize = useCallback((type: ResizeType, e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    let startValue = inputWidth
    if (type === 'ref-height') startValue = refHeight
    else if (type === 'sidebar-width') startValue = sidebarWidth
    else if (type === 'comparison-input-width') startValue = comparisonInputWidth
    else if (type === 'comparison-context-height') startValue = comparisonContextHeight
    resizingRef.current = { type, startX: e.clientX, startY: e.clientY, startValue, container }
    document.body.style.cursor = type === 'ref-height' ? 'row-resize' : 'col-resize'
    if (type === 'comparison-context-height') {
      document.body.style.cursor = 'row-resize'
    }
    document.body.style.userSelect = 'none'
  }, [comparisonContextHeight, comparisonInputWidth, inputWidth, refHeight, sidebarWidth])

  const handleRerun = useCallback(async () => {
    if (!data || isRerunning) return
    setIsRerunning(true)
    try {
      const resp = await fetch('/api/runs/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices: [data.index] }),
      })
      if (resp.ok) {
        const poll = async () => {
          const r = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${data.index}`)
          if (r.ok) {
            const next = await r.json() as ResultDetailPayload
            setData(next)
            const status = next.result?.result?.status
            if (status === 'completed' || status === 'error') {
              setIsRerunning(false)
              return
            }
          }
          setTimeout(poll, 500)
        }
        setTimeout(poll, 500)
      } else {
        setIsRerunning(false)
      }
    } catch {
      setIsRerunning(false)
    }
  }, [data, isRerunning, runId])

  const handleAnnotationSave = useCallback(async () => {
    const newAnnotation = annotationDraft.trim() || null
    const currentAnnotation = data?.result?.result?.annotation || null

    if (newAnnotation === currentAnnotation) {
      setEditingAnnotation(false)
      setAnnotationError(null)
      return
    }

    setAnnotationSaving(true)
    setAnnotationError(null)

    try {
      const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { annotation: newAnnotation } }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to save annotation')
      }

      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          result: {
            ...prev.result,
            result: {
              ...prev.result.result,
              annotation: newAnnotation,
            },
          },
        }
      })

      setEditingAnnotation(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setAnnotationError(message)
    } finally {
      setAnnotationSaving(false)
    }
  }, [annotationDraft, data?.result?.result?.annotation, index, runId])

  const handleScoreSave = useCallback(async () => {
    if (editingScoreIndex == null) return
    const currentScores = Array.isArray(data?.result?.result?.scores) ? data?.result?.result?.scores : []
    if (!currentScores[editingScoreIndex]) return

    const nextNotes = scoreDraftNotes.trim() || null
    const currentScore = currentScores[editingScoreIndex]
    let nextScore: Score
    if (scoreDraftKind === 'bool') {
      const nextBool = scoreDraftPassed === 'true'
      if (scoreBoolUsesValue) {
        const { passed, ...rest } = currentScore
        nextScore = {
          ...rest,
          value: nextBool,
          notes: nextNotes,
        }
      } else {
        const { value, ...rest } = currentScore
        nextScore = {
          ...rest,
          passed: nextBool,
          notes: nextNotes,
        }
      }
    } else {
      const rawValue = scoreDraftValue.trim()
      const nextValue: Score['value'] = !rawValue
        ? null
        : (/^-?\d+(\.\d+)?$/.test(rawValue) ? Number(rawValue) : rawValue)
      const { passed, ...rest } = currentScore
      nextScore = {
        ...rest,
        value: nextValue,
        notes: nextNotes,
      }
    }
    const nextScores = currentScores.map((score, idx) => (idx === editingScoreIndex ? nextScore : score))
    if (JSON.stringify(nextScores) === JSON.stringify(currentScores)) {
      setEditingScoreIndex(null)
      setScoreError(null)
      return
    }

    setScoreSaving(true)
    setScoreError(null)

    try {
      const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { scores: nextScores } }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to save score')
      }

      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          result: {
            ...prev.result,
            result: {
              ...prev.result.result,
              scores: nextScores,
            },
          },
        }
      })
      setEditingScoreIndex(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setScoreError(message)
    } finally {
      setScoreSaving(false)
    }
  }, [data?.result?.result?.scores, editingScoreIndex, index, runId, scoreBoolUsesValue, scoreDraftKind, scoreDraftNotes, scoreDraftPassed, scoreDraftValue])

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
        <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
        <div className="p-4 text-zinc-400">Failed to load result.</div>
      </div>
    )
  }

  const resultEntry = data.result
  const result = (resultEntry?.result || {}) as NonNullable<RunResultRow['result']>
  const status = result.status || 'completed'
  const isOutputLoading = isRerunning || status === 'pending' || status === 'running'
  const hasReference = result.reference != null && result.reference !== '—'
  const hasMetadata = result.metadata != null && result.metadata !== '—'
  const metadataEntries = hasMetadata
    ? Object.entries(result.metadata as Record<string, unknown>)
    : []
  const traceData = (result.trace_data || null) as TraceData | null
  const messages = Array.isArray(traceData?.messages) ? traceData?.messages : []
  const hasMessages = messages.length > 0
  const scores = Array.isArray(result.scores) ? result.scores : []
  const hasScores = scores.length > 0
  const hasError = !!result.error
  const filteredTrace = traceData
    ? Object.fromEntries(Object.entries(traceData).filter(([k]) => k !== 'messages' && k !== 'trace_url'))
    : null
  const toolNames = extractToolNamesFromMessages(messages)
  const runCommand = buildRunCommand(data.eval_path, resultEntry?.function)

  const baseForCompare = comparison?.baseResult || resultEntry
  const comparisonBaseResult = (baseForCompare?.result || {}) as NonNullable<RunResultRow['result']>
  const comparisonHasReference = comparisonBaseResult.reference != null && comparisonBaseResult.reference !== '—'

  return (
    <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
      <div id="app" className="flex flex-col h-screen">
        <header className="flex-shrink-0 flex items-center justify-between gap-4 border-b border-blue-200/60 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:text-blue-400"
              title="Back (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </a>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">{resultEntry?.function}</span>
              <CopyButton
                getText={() => runCommand}
                className="copy-btn flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                title="Copy run command"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isComparisonMode ? (
              <button
                id="rerun-btn"
                className="flex h-7 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 disabled:opacity-60"
                title="Rerun this evaluation"
                onClick={handleRerun}
                disabled={isRerunning}
              >
                {isRerunning ? (
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                )}
                {isRerunning ? 'Running...' : 'Rerun'}
              </button>
            ) : null}
            <span className="text-xs text-zinc-500">{data.index + 1}/{data.total}</span>
            <button
              id="prev-btn"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-blue-500"
              title="Up"
              disabled={data.index <= 0}
              onClick={() => window.location.href = buildDetailHref(runId, data.index - 1)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
            <button
              id="next-btn"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-blue-500"
              title="Down"
              disabled={data.index >= data.total - 1}
              onClick={() => window.location.href = buildDetailHref(runId, data.index + 1)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        </header>

        {hasError ? (
          <div className="flex-shrink-0 bg-rose-50 border-b border-rose-200 px-4 py-2 dark:bg-rose-500/10 dark:border-rose-500/30">
            <div className="flex items-start gap-2 text-sm">
              <svg className="mt-0.5 shrink-0 text-rose-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <pre id="data-error" className="flex-1 text-rose-600 dark:text-rose-300 whitespace-pre-wrap font-mono text-xs">{result.error}</pre>
              <CopyButton
                getText={() => result.error || ''}
                className="copy-btn shrink-0 text-rose-400 hover:text-rose-600"
                title="Copy"
              />
            </div>
          </div>
        ) : null}

        <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden">
          <div id="main-panel" className="flex flex-col min-w-0 flex-1">
            {isComparisonMode && comparison ? (
              <div className="flex flex-1 min-h-0 flex-col">
                <div id="comparison-outputs" className="flex-1 min-h-0 overflow-auto p-4">
                  <div className="grid min-h-full grid-cols-1 gap-3 lg:grid-cols-2">
                    {comparison.runs.map((run) => {
                      const runResult = (run.result?.result || {}) as NonNullable<RunResultRow['result']>
                      return (
                        <div key={run.runId} className="comparison-output-card flex min-h-[220px] flex-col overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: run.color }}></span>
                              <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">{run.runName}</span>
                              <span className="text-[10px] text-zinc-400">{runResult.status || '—'}</span>
                            </div>
                            {run.resultIndex != null ? (
                              <a
                                href={`/runs/${run.runId}/results/${run.resultIndex}?mode=single`}
                                title="Open detail"
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-blue-300 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:text-blue-300"
                              >
                                Open detail
                              </a>
                            ) : (
                              <span className="text-[10px] text-zinc-400">No match</span>
                            )}
                          </div>
                          <div className="data-panel-body flex-1 overflow-auto p-3">
                            <DataViewer content={runResult.output} placeholder="—" />
                          </div>
                          {runResult.error ? (
                            <div className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                              Error: {runResult.error}
                            </div>
                          ) : null}
                          <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
                            <InlineScoreBadges
                              scores={runResult.scores || []}
                              latency={runResult.latency}
                              annotation={runResult.annotation}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div
                  className="resize-handle-h h-1 cursor-row-resize bg-transparent hover:bg-blue-500/30 transition-colors"
                  onMouseDown={(e) => startResize('comparison-context-height', e)}
                />

                <div
                  id="comparison-context"
                  className="flex flex-shrink-0 flex-col border-t border-blue-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  style={{ height: `${comparisonContextHeight}px`, minHeight: '120px' }}
                >
                  {(baseForCompare?.dataset || (baseForCompare?.labels || []).length > 0) ? (
                    <div className="flex items-center gap-2 border-b border-blue-100 px-3 py-1.5 dark:border-zinc-800">
                      {baseForCompare?.dataset ? (
                        <span className="text-[10px] text-zinc-500">{baseForCompare.dataset}</span>
                      ) : null}
                      {(baseForCompare?.labels || []).map((label) => (
                        <span key={label} className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{label}</span>
                      ))}
                    </div>
                  ) : null}

                  {comparisonHasReference ? (
                    <div className="flex min-h-0 flex-1">
                      <div id="comparison-input-panel" className="flex min-w-0 flex-col" style={{ width: `${comparisonInputWidth}%` }}>
                        <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-blue-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Input</span>
                          <CopyButton
                            getText={() => getRawText(comparisonBaseResult.input)}
                            className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            title="Copy"
                          />
                        </div>
                        <div className="data-panel-body flex-1 overflow-auto p-3 bg-white dark:bg-zinc-900/30">
                          <DataViewer content={comparisonBaseResult.input} placeholder="—" />
                        </div>
                      </div>

                      <div
                        className="resize-handle-v w-1 cursor-col-resize bg-transparent hover:bg-blue-500/30 transition-colors flex-shrink-0"
                        onMouseDown={(e) => startResize('comparison-input-width', e)}
                      />

                      <div id="comparison-reference-panel" className="flex min-w-0 flex-1 flex-col">
                        <div className="data-panel-header flex items-center justify-between border-b border-amber-200/40 bg-amber-50/50 px-3 py-1.5 dark:border-amber-500/10 dark:bg-amber-500/5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reference</span>
                          <CopyButton
                            getText={() => getRawText(comparisonBaseResult.reference)}
                            className="copy-btn text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                            title="Copy"
                          />
                        </div>
                        <div className="data-panel-body flex-1 overflow-auto p-3 bg-amber-50/30 dark:bg-amber-500/5">
                          <DataViewer content={comparisonBaseResult.reference} placeholder="—" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div id="comparison-input-panel" className="flex min-h-0 flex-1 flex-col">
                      <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-blue-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Input</span>
                        <CopyButton
                          getText={() => getRawText(comparisonBaseResult.input)}
                          className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          title="Copy"
                        />
                      </div>
                      <div className="data-panel-body flex-1 overflow-auto p-3 bg-white dark:bg-zinc-900/30">
                        <DataViewer content={comparisonBaseResult.input} placeholder="—" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div id="io-row" className="flex min-h-0" style={{ flex: '1 1 auto' }}>
                  <div id="input-column" className="flex min-w-0 flex-col" style={{ width: `${inputWidth}%` }}>
                    <div id="input-panel" className="flex min-h-0 flex-1 flex-col min-w-0">
                      <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-blue-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Input</span>
                        <CopyButton
                          getText={() => getRawText(result.input)}
                          className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          title="Copy"
                        />
                      </div>
                      <div className="data-panel-body p-3 bg-white dark:bg-zinc-900/30 overflow-auto flex-1">
                        <DataViewer content={result.input} placeholder="—" />
                      </div>
                    </div>

                    {hasReference ? (
                      <>
                        <div
                          className="resize-handle-h h-1 cursor-row-resize bg-transparent hover:bg-amber-500/30 transition-colors flex-shrink-0"
                          onMouseDown={(e) => startResize('ref-height', e)}
                        />
                        <div id="ref-panel" className="flex flex-col flex-shrink-0" style={{ height: `${refHeight}px`, minHeight: '60px' }}>
                          <div className="data-panel-header flex items-center justify-between border-b border-amber-200/40 bg-amber-50/50 px-3 py-1.5 dark:border-amber-500/10 dark:bg-amber-500/5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reference</span>
                            <CopyButton
                              getText={() => getRawText(result.reference)}
                              className="copy-btn text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                              title="Copy"
                            />
                          </div>
                          <div className="data-panel-body p-3 overflow-auto bg-amber-50/30 dark:bg-amber-500/5 flex-1">
                            <DataViewer content={result.reference} placeholder="—" />
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div
                    className="resize-handle-v w-1 cursor-col-resize bg-transparent hover:bg-blue-500/30 transition-colors flex-shrink-0"
                    onMouseDown={(e) => startResize('input-width', e)}
                  />

                  <div id="output-panel" className="flex flex-col min-w-0" style={{ flex: '1 1 auto' }}>
                    <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-emerald-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Output</span>
                      <CopyButton
                        getText={() => getRawText(isOutputLoading ? null : result.output)}
                        className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 bg-white dark:bg-zinc-900/30 overflow-auto flex-1">
                      {isOutputLoading ? (
                        <div
                          id="output-loading-indicator"
                          className="output-loading-state"
                          role="status"
                          aria-live="polite"
                          aria-label="Output is loading"
                        >
                          <div className="output-loading-line output-loading-line-1" />
                          <div className="output-loading-line output-loading-line-2" />
                          <div className="output-loading-line output-loading-line-3" />
                        </div>
                      ) : (
                        <DataViewer content={result.output} placeholder="—" />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {!isComparisonMode ? (
            <>
              <div
                className="resize-handle-v w-1 cursor-col-resize bg-transparent hover:bg-blue-500/30 transition-colors flex-shrink-0"
                onMouseDown={(e) => startResize('sidebar-width', e)}
              />

              <div id="sidebar-panel" className="flex flex-col min-h-0 overflow-auto bg-zinc-50 dark:bg-zinc-900/50" style={{ width: `${sidebarWidth}px`, minWidth: '200px' }}>
            <div className="border-b border-blue-200/60 dark:border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-zinc-200 dark:border-zinc-700">{status}</span>
              </div>
              {result.latency != null ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Latency</span>
                  <span className={`font-mono text-xs ${getLatencyColor(result.latency)}`}>{result.latency.toFixed(2)}s</span>
                </div>
              ) : null}
              {resultEntry?.dataset ? (
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Dataset</span>
                  <a
                    className="max-w-[70%] truncate text-right text-xs text-zinc-600 underline underline-offset-2 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400"
                    title={`Open dashboard filtered to dataset: ${resultEntry.dataset}`}
                    href={`/?run_id=${encodeURIComponent(runId)}&dataset_in=${encodeURIComponent(resultEntry.dataset)}`}
                  >
                    {resultEntry.dataset}
                  </a>
                </div>
              ) : null}
              {resultEntry?.labels?.length ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Labels</span>
                  <div className="flex max-w-[70%] flex-wrap justify-end gap-1">
                    {resultEntry.labels.map((label) => (
                      <span
                        key={label}
                        className="max-w-[140px] truncate rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        title={label}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {traceData?.trace_url ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Trace</span>
                  <a
                    href={traceData.trace_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                    View Trace
                  </a>
                </div>
              ) : null}
              {toolNames.length > 0 ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Tools</span>
                  <div id="tool-names" className="flex max-w-[70%] flex-wrap justify-end gap-1">
                    {toolNames.map((toolName) => (
                      <span key={toolName} className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{toolName}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {hasMessages ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  onClick={() => setMessagesOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 text-left"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Messages</span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200">{messages.length}</span>
                    <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </span>
                </button>
              </div>
            ) : null}

            {hasScores ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100/50 dark:bg-zinc-800/30">Scores</div>
                <div className="p-2 space-y-1.5">
                  {scores.map((score, idx) => {
                    if (editingScoreIndex !== idx) {
                      return (
                        <ScoreCard
                          key={`${score.key}-${idx}`}
                          score={score}
                          onEdit={() => {
                            const isBoolScore = typeof score.value === 'boolean' || (score.value == null && (score.passed === true || score.passed === false))
                            const usesValueForBool = typeof score.value === 'boolean' && score.passed == null
                            setEditingScoreIndex(idx)
                            setScoreDraftKind(isBoolScore ? 'bool' : 'value')
                            setScoreBoolUsesValue(usesValueForBool)
                            setScoreDraftValue(!isBoolScore && score.value != null ? String(score.value) : '')
                            if (isBoolScore) {
                              const boolValue = usesValueForBool ? score.value : score.passed
                              setScoreDraftPassed(boolValue === true ? 'true' : 'false')
                            } else {
                              setScoreDraftPassed('unset')
                            }
                            setScoreDraftNotes(score.notes || '')
                            setScoreError(null)
                          }}
                        />
                      )
                    }
                    return (
                      <div key={`${score.key}-${idx}`} className="rounded border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">{score.key}</span>
                        </div>
                        <div className="space-y-2">
                          {scoreDraftKind === 'value' ? (
                            <input
                              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs text-zinc-700 placeholder-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-blue-500"
                              value={scoreDraftValue}
                              onChange={(e) => setScoreDraftValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingScoreIndex(null)
                                  setScoreError(null)
                                }
                              }}
                              placeholder="Value (number or text)"
                              autoFocus
                              disabled={scoreSaving}
                            />
                          ) : (
                            <select
                              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:focus:border-blue-500"
                              value={scoreDraftPassed}
                              onChange={(e) => setScoreDraftPassed(e.target.value)}
                              disabled={scoreSaving}
                              autoFocus
                            >
                              <option value="true">Passed: true</option>
                              <option value="false">Passed: false</option>
                            </select>
                          )}
                          <textarea
                            className="w-full min-h-[60px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 placeholder-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-blue-500"
                            value={scoreDraftNotes}
                            onChange={(e) => setScoreDraftNotes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditingScoreIndex(null)
                                setScoreError(null)
                              }
                            }}
                            placeholder="Notes..."
                            disabled={scoreSaving}
                          />
                          {scoreError ? <div className="text-[11px] text-rose-500">{scoreError}</div> : null}
                          <div className="flex justify-end gap-2">
                            <button
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                              onClick={() => {
                                setEditingScoreIndex(null)
                                setScoreError(null)
                              }}
                              disabled={scoreSaving}
                            >
                              Cancel
                            </button>
                            <button
                              className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                              onClick={handleScoreSave}
                              disabled={scoreSaving}
                            >
                              {scoreSaving ? (
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : null}
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {hasMetadata ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50"
                  onClick={() => setCollapsed((prev) => ({ ...prev, metadata: !prev.metadata }))}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Metadata</span>
                  <svg className={`collapse-icon h-3.5 w-3.5 text-zinc-400 ${collapsed.metadata ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className={`collapsible-content ${collapsed.metadata ? '' : 'open'}`}>
                  <div>
                    <div className="p-2 max-h-48 overflow-auto">
                      <dl className="space-y-2">
                        {metadataEntries.map(([key, value]) => {
                          const valueText = getRawText(value) || '—'
                          const isUrl = typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim())
                          const label = formatMetadataLabel(key)
                          return (
                            <div key={key} className="rounded border border-zinc-200 bg-white/70 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60">
                              <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
                              <dd className="mt-1">
                                {isUrl ? (
                                  <a
                                    href={value}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-600 underline underline-offset-2 break-all hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                                  >
                                    {value}
                                  </a>
                                ) : (
                                  <pre className="font-mono text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
                                    {valueText}
                                  </pre>
                                )}
                              </dd>
                            </div>
                          )
                        })}
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {filteredTrace && Object.keys(filteredTrace).length > 0 ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50"
                  onClick={() => setCollapsed((prev) => ({ ...prev, trace: !prev.trace }))}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Trace Data</span>
                  <svg className={`collapse-icon h-3.5 w-3.5 text-zinc-400 ${collapsed.trace ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className={`collapsible-content ${collapsed.trace ? '' : 'open'}`}>
                  <div>
                    <div className="p-2 max-h-48 overflow-auto">
                      <DataViewer content={filteredTrace} placeholder="—" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex-1">
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-100/50 dark:bg-zinc-800/30">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Annotation</span>
                {!editingAnnotation && (
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                    title="Edit annotation"
                    onClick={() => {
                      setAnnotationDraft(result.annotation || '')
                      setEditingAnnotation(true)
                      setAnnotationError(null)
                    }}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="p-3">
                {editingAnnotation ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full min-h-[80px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 placeholder-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-blue-500"
                      value={annotationDraft}
                      onChange={(e) => setAnnotationDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingAnnotation(false)
                          setAnnotationError(null)
                        }
                      }}
                      placeholder="Add annotation..."
                      autoFocus
                      disabled={annotationSaving}
                    />

                    {annotationError && (
                      <div className="text-[11px] text-rose-500">{annotationError}</div>
                    )}

                    <div className="flex items-center justify-end">
                      <div className="flex gap-2">
                        <button
                          className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          onClick={() => {
                            setEditingAnnotation(false)
                            setAnnotationError(null)
                          }}
                          disabled={annotationSaving}
                        >
                          Cancel
                        </button>
                        <button
                          className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                          onClick={handleAnnotationSave}
                          disabled={annotationSaving}
                        >
                          {annotationSaving && (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : result.annotation ? (
                  <div className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">{result.annotation}</div>
                ) : (
                  <div className="text-xs italic text-zinc-400 dark:text-zinc-500">No annotation</div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-3 py-2 border-t border-blue-200/60 bg-zinc-100/30 dark:border-zinc-800 dark:bg-zinc-800/20">
              <div className="flex items-center gap-4 text-[10px] text-zinc-400">
                <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">↑↓</kbd> nav</span>
                <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">Esc</kbd> {(editingAnnotation || editingScoreIndex != null) ? 'cancel' : 'back'}</span>
              </div>
            </div>
              </div>
            </>
          ) : null}
        </div>

        {!isComparisonMode && hasMessages ? (
          <div
            id="messages-pane"
            className={`fixed top-0 right-0 bottom-0 z-50 border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 dark:border-zinc-700 dark:bg-zinc-900 ${messagesOpen ? '' : 'translate-x-full'}`}
            style={{ width: '700px' }}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Messages <span className="text-zinc-400">({messages.length})</span></span>
              <button
                onClick={() => setMessagesOpen(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="h-[calc(100%-41px)] overflow-auto">
              <div className="p-2">
                <DataViewer content={messages} placeholder="—" />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
