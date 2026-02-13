import { useEffect, useRef, useState } from 'react'
import type { NormalizedComparisonRun, RunSummary, ScoreChip } from '../../types'
import { useDebouncedValue } from '../hooks'
import {
  DEFAULT_SCORE_COLORS,
  renderPngCanvas,
  type PngRunOverride,
} from '../pngExport'

type PngExportModalProps = {
  open: boolean
  onClose: () => void
  displayChips: ScoreChip[]
  displayLatency: number
  displayFilteredCount: number | null
  totalTests: number
  isComparisonMode: boolean
  normalizedComparisonRuns: NormalizedComparisonRun[]
  comparisonData: Record<string, RunSummary>
  sessionName: string
}

function slugifyFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function PngExportModal({
  open,
  onClose,
  displayChips,
  displayLatency,
  displayFilteredCount,
  totalTests,
  isComparisonMode,
  normalizedComparisonRuns,
  comparisonData,
  sessionName,
}: PngExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderSeqRef = useRef(0)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [isRendering, setIsRendering] = useState(false)

  const [configOpen, setConfigOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scoreColors, setScoreColors] = useState(DEFAULT_SCORE_COLORS)
  const [runOverrides, setRunOverrides] = useState<PngRunOverride[]>([])
  const [showTests, setShowTests] = useState(true)
  const [showLatency, setShowLatency] = useState(true)

  const debouncedTitle = useDebouncedValue(title, 120)
  const debouncedRunOverrides = useDebouncedValue(runOverrides, 120)

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      setPreviewError(null)
      setCopyFeedback('')
      setIsRendering(false)
      return
    }

    setConfigOpen(false)
    setTitle(sessionName || '')
    setScoreColors(DEFAULT_SCORE_COLORS)
    setShowTests(true)
    setShowLatency(true)
    setRunOverrides(normalizedComparisonRuns.map((run) => ({
      runId: run.runId,
      runName: run.runName,
      color: run.color,
    })))
    // Initialize options from snapshot data when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const renderSeq = ++renderSeqRef.current
    setIsRendering(true)
    setPreviewError(null)

    renderPngCanvas({
      displayChips,
      displayLatency,
      displayFilteredCount,
      totalTests,
      isComparisonMode,
      normalizedComparisonRuns,
      comparisonData,
    }, {
      title: debouncedTitle,
      scoreColors,
      runOverrides: debouncedRunOverrides,
      showTests,
      showLatency,
    }).then((canvas) => {
      if (renderSeq !== renderSeqRef.current) return
      canvasRef.current = canvas
      setPreviewUrl(canvas.toDataURL('image/png'))
      setIsRendering(false)
    }).catch((err) => {
      if (renderSeq !== renderSeqRef.current) return
      console.error('PNG export error:', err)
      setPreviewError(err?.message || 'Failed to generate preview')
      setIsRendering(false)
    })
  }, [
    open,
    displayChips,
    displayLatency,
    displayFilteredCount,
    totalTests,
    isComparisonMode,
    normalizedComparisonRuns,
    comparisonData,
    debouncedTitle,
    scoreColors,
    debouncedRunOverrides,
    showTests,
    showLatency,
  ])

  if (!open) return null

  const moveRunOverride = (runId: string, direction: -1 | 1) => {
    setRunOverrides((prev) => {
      const idx = prev.findIndex((run) => run.runId === runId)
      if (idx < 0) return prev
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fileName = slugifyFilename(title || sessionName)
      a.download = fileName ? `ezvals-${fileName}.png` : 'ezvals-export.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  const handleCopy = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((imageBlob) => {
          if (!imageBlob) {
            reject(new Error('Failed to create PNG blob'))
            return
          }
          resolve(imageBlob)
        }, 'image/png')
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopyFeedback('Copied!')
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch {
      setCopyFeedback('Copy failed - try Save instead')
      setTimeout(() => setCopyFeedback(''), 3000)
    }
  }

  const showRunControls = isComparisonMode && normalizedComparisonRuns.length > 1

  return (
    <div id="png-export-modal" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-theme-text">Export PNG</span>
          <div className="flex items-center gap-2">
            <button
              id="png-export-config-toggle"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-theme-border bg-theme-bg-secondary text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text"
              onClick={() => setConfigOpen((prev) => !prev)}
              title="Export options"
              aria-label="Export options"
            >
              <svg className={`h-3.5 w-3.5 transition-transform ${configOpen ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-gear" />
              </svg>
            </button>
            <button className="text-theme-text-muted hover:text-theme-text-secondary" onClick={onClose}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-close" />
              </svg>
            </button>
          </div>
        </div>

        {configOpen ? (
          <div className="mb-4 space-y-3 rounded border border-theme-border bg-theme-bg-secondary/40 p-3">
            <label className="flex flex-col gap-1 text-xs text-theme-text-muted">
              Title
              <input
                id="png-export-title-input"
                type="text"
                className="rounded border border-theme-border bg-theme-bg px-2 py-1.5 text-xs text-theme-text focus:border-blue-500 focus:outline-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-2 rounded border border-theme-border/70 px-2 py-1 text-xs text-theme-text-muted">
                Good
                <input
                  id="png-export-score-good-color"
                  type="color"
                  className="h-5 w-8 cursor-pointer rounded border border-theme-border bg-transparent"
                  value={scoreColors.good}
                  onChange={(e) => setScoreColors((prev) => ({ ...prev, good: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded border border-theme-border/70 px-2 py-1 text-xs text-theme-text-muted">
                Mid
                <input
                  id="png-export-score-mid-color"
                  type="color"
                  className="h-5 w-8 cursor-pointer rounded border border-theme-border bg-transparent"
                  value={scoreColors.mid}
                  onChange={(e) => setScoreColors((prev) => ({ ...prev, mid: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded border border-theme-border/70 px-2 py-1 text-xs text-theme-text-muted">
                Low
                <input
                  id="png-export-score-bad-color"
                  type="color"
                  className="h-5 w-8 cursor-pointer rounded border border-theme-border bg-transparent"
                  value={scoreColors.bad}
                  onChange={(e) => setScoreColors((prev) => ({ ...prev, bad: e.target.value }))}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
              <label className="inline-flex items-center gap-1.5">
                <input
                  id="png-export-show-tests"
                  type="checkbox"
                  checked={showTests}
                  className="h-3.5 w-3.5 accent-blue-500"
                  onChange={(e) => setShowTests(e.target.checked)}
                />
                Show test count
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  id="png-export-show-latency"
                  type="checkbox"
                  checked={showLatency}
                  className="h-3.5 w-3.5 accent-blue-500"
                  onChange={(e) => setShowLatency(e.target.checked)}
                />
                Show average latency
              </label>
            </div>

            {showRunControls ? (
              <div id="png-export-run-overrides" className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-theme-text-muted">Comparison runs</div>
                {runOverrides.map((run, idx) => (
                  <div key={run.runId} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        data-png-run-move-up={run.runId}
                        disabled={idx === 0}
                        className="h-4 w-4 rounded border border-theme-border text-[10px] text-theme-text-muted disabled:opacity-40"
                        onClick={() => moveRunOverride(run.runId, -1)}
                        aria-label="Move run up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        data-png-run-move-down={run.runId}
                        disabled={idx === runOverrides.length - 1}
                        className="h-4 w-4 rounded border border-theme-border text-[10px] text-theme-text-muted disabled:opacity-40"
                        onClick={() => moveRunOverride(run.runId, 1)}
                        aria-label="Move run down"
                      >
                        ↓
                      </button>
                    </div>
                    <input
                      type="text"
                      data-png-run-name={run.runId}
                      className="rounded border border-theme-border bg-theme-bg px-2 py-1.5 text-xs text-theme-text focus:border-blue-500 focus:outline-none"
                      value={run.runName}
                      onChange={(e) => {
                        const nextName = e.target.value
                        setRunOverrides((prev) => prev.map((item) => (
                          item.runId === run.runId ? { ...item, runName: nextName } : item
                        )))
                      }}
                    />
                    <input
                      type="color"
                      data-png-run-color={run.runId}
                      className="h-8 w-10 cursor-pointer rounded border border-theme-border bg-transparent"
                      value={run.color}
                      onChange={(e) => {
                        const nextColor = e.target.value
                        setRunOverrides((prev) => prev.map((item) => (
                          item.runId === run.runId ? { ...item, color: nextColor } : item
                        )))
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="relative flex min-h-[220px] items-center justify-center rounded border border-theme-border bg-theme-bg-secondary/20 p-3">
          {previewError ? (
            <span className="text-sm text-red-400">{previewError}</span>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Export preview"
              className="max-h-[420px] max-w-full rounded-md border border-theme-border"
              style={{ height: 'auto' }}
            />
          ) : (
            <span className="text-sm text-theme-text-muted">Generating preview...</span>
          )}
          {isRendering && previewUrl ? (
            <span className="absolute right-2 top-2 rounded bg-theme-bg/80 px-2 py-0.5 text-[10px] text-theme-text-muted">Updating preview...</span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="h-4 text-xs text-theme-text-muted">
            {copyFeedback}
          </span>
          <div className="flex gap-2">
            <button
              id="png-export-copy-btn"
              className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-xs text-theme-text-muted hover:bg-theme-bg-elevated"
              onClick={handleCopy}
            >
              Copy
            </button>
            <button
              id="png-export-save-btn"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
