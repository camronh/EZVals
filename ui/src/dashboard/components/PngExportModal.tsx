import { useEffect, useRef, useState } from 'react'
import type { NormalizedComparisonRun, RunSummary, ScoreChip } from '../../types'
import { renderPngCanvas } from '../pngExport'

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
}: PngExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      setPreviewError(null)
      setCopyFeedback('')
      return
    }
    renderPngCanvas({
      displayChips,
      displayLatency,
      displayFilteredCount,
      totalTests,
      isComparisonMode,
      normalizedComparisonRuns,
      comparisonData,
    }).then((canvas) => {
      canvasRef.current = canvas
      setPreviewUrl(canvas.toDataURL('image/png'))
    }).catch((err) => {
      console.error('PNG export error:', err)
      setPreviewError(err?.message || 'Failed to generate preview')
    })
    // Render once when modal opens — data is captured at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ezvals-export.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  const handleCopy = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopyFeedback('Copied!')
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch {
      setCopyFeedback('Copy failed — try Save instead')
      setTimeout(() => setCopyFeedback(''), 3000)
    }
  }

  return (
    <div id="png-export-modal" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-theme-text">Export PNG</span>
          <button className="text-theme-text-muted hover:text-theme-text-secondary" onClick={onClose}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-close" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-center min-h-[200px]">
          {previewError ? (
            <span className="text-sm text-red-400">{previewError}</span>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Export preview" className="max-w-full rounded-md border border-theme-border" style={{ height: 'auto' }} />
          ) : (
            <span className="text-sm text-theme-text-muted">Generating preview...</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-theme-text-muted h-4">{copyFeedback}</span>
          <div className="flex gap-2">
            <button
              className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-xs text-theme-text-muted hover:bg-theme-bg-elevated"
              onClick={handleCopy}
            >
              Copy
            </button>
            <button
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
