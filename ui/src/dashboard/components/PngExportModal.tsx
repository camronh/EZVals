import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedValue } from '../../hooks/storage'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { cssColor, defaultScoreColors, renderPngCanvas, type PngExportData, type PngRunOverride } from '../pngExport'

type PngExportModalProps = PngExportData & {
  onClose: () => void
  sessionName: string
}

function slugifyFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Renders the summary as a shareable PNG, with title, colour and run options behind a compact options button. */
export function PngExportModal({ onClose, stats, total, comparison, sessionName }: PngExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [title, setTitle] = useState(sessionName)
  const [scoreColors, setScoreColors] = useState(defaultScoreColors)
  const [runOverrides, setRunOverrides] = useState<PngRunOverride[]>(() => (comparison?.runs ?? []).map(({ runId, runName, color }) => ({ runId, runName, color: cssColor(color) })))
  const [showTests, setShowTests] = useState(true)
  const [showLatency, setShowLatency] = useState(true)
  const debouncedTitle = useDebouncedValue(title, 120)
  const debouncedRunOverrides = useDebouncedValue(runOverrides, 120)

  // The latest drawing and the options it was drawn with; the preview keeps showing it while a newer one draws.
  const request = useMemo(
    () => ({ title: debouncedTitle, scoreColors, runOverrides: debouncedRunOverrides, showTests, showLatency }),
    [debouncedTitle, scoreColors, debouncedRunOverrides, showTests, showLatency],
  )
  const [drawn, setDrawn] = useState<{ request: typeof request; url?: string; error?: string } | null>(null)
  useEffect(() => {
    let current = true
    renderPngCanvas({ stats, total, comparison }, request).then((canvas) => {
      if (!current) return
      canvasRef.current = canvas
      setDrawn({ request, url: canvas.toDataURL('image/png') })
    }).catch((err) => current && setDrawn({ request, error: `Couldn't draw the image: ${err.message}` }))
    return () => { current = false }
  }, [stats, total, comparison, request])
  const previewUrl = drawn?.url
  const previewError = drawn?.request === request ? drawn.error : undefined
  const isRendering = drawn?.request !== request

  const moveRun = (runId: string, direction: -1 | 1) => setRunOverrides((prev) => {
    const idx = prev.findIndex((run) => run.runId === runId)
    const next = [...prev]
    next.splice(idx + direction, 0, ...next.splice(idx, 1))
    return next
  })
  const patchRun = (runId: string, patch: Partial<PngRunOverride>) => setRunOverrides((prev) => prev.map((run) => (run.runId === runId ? { ...run, ...patch } : run)))

  const handleSave = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const fileName = slugifyFilename(title || sessionName)
      a.download = fileName ? `ezvals-${fileName}.png` : 'ezvals-export.png'
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }

  const handleCopy = async () => {
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('empty image'))), 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopyFeedback('Copied to clipboard')
    } catch {
      setCopyFeedback("Couldn't copy. Use Save instead.")
    }
    setTimeout(() => setCopyFeedback(''), 3000)
  }

  const showRunControls = !!comparison && comparison.runs.length > 1
  const swatch = (label: string, key: keyof typeof scoreColors) => (
    <label className="flex h-8 items-center justify-between gap-2 rounded-md border border-line bg-surface pl-2.5 pr-1 text-sm text-fg-secondary">
      {label}
      <input id={`png-export-score-${key}-color`} type="color" className="h-6 w-8 cursor-pointer rounded-sm border-0 bg-transparent" value={scoreColors[key]} onChange={(e) => setScoreColors((prev) => ({ ...prev, [key]: e.target.value }))} />
    </label>
  )

  return (
    <Dialog
      id="png-export-modal"
      title="Export image"
      onClose={onClose}
      className="w-[960px]"
      actions={(
        <button id="png-export-config-toggle" className={`btn btn-ghost btn-sm btn-icon ${configOpen ? 'btn-pressed' : ''}`} onClick={() => setConfigOpen(!configOpen)} title="Options" aria-label="Options" aria-expanded={configOpen}>
          <Icon name="gear" />
        </button>
      )}
    >
      <div className="p-5">
        {configOpen ? (
          <div className="mb-4 space-y-3 rounded-lg border border-line bg-surface-subtle p-3">
            <label className="flex flex-col gap-1.5">
              <span className="section-label">Title</span>
              <input id="png-export-title-input" type="text" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {swatch('Good', 'good')}
              {swatch('Mid', 'mid')}
              {swatch('Low', 'bad')}
            </div>
            {showRunControls ? (
              <div id="png-export-run-overrides" className="space-y-2">
                <div className="section-label">Runs</div>
                {runOverrides.map((run, idx) => (
                  <div key={run.runId} className="flex items-center gap-1.5">
                    <button type="button" data-png-run-move-up={run.runId} disabled={idx === 0} className="btn btn-ghost btn-xs btn-icon" onClick={() => moveRun(run.runId, -1)} aria-label="Move run up"><Icon name="chevron-up" /></button>
                    <button type="button" data-png-run-move-down={run.runId} disabled={idx === runOverrides.length - 1} className="btn btn-ghost btn-xs btn-icon" onClick={() => moveRun(run.runId, 1)} aria-label="Move run down"><Icon name="chevron-down" /></button>
                    <input type="text" data-png-run-name={run.runId} aria-label="Run name" className="input flex-1" value={run.runName} onChange={(e) => patchRun(run.runId, { runName: e.target.value })} />
                    <input type="color" data-png-run-color={run.runId} aria-label="Run colour" className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent" value={run.color} onChange={(e) => patchRun(run.runId, { color: e.target.value })} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-5 text-sm text-fg-secondary">
                <label className="inline-flex items-center gap-2">
                  <input id="png-export-show-tests" type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} />
                  Show eval count
                </label>
                <label className="inline-flex items-center gap-2">
                  <input id="png-export-show-latency" type="checkbox" checked={showLatency} onChange={(e) => setShowLatency(e.target.checked)} />
                  Show average latency
                </label>
              </div>
            )}
          </div>
        ) : null}

        <div className="relative flex min-h-[220px] items-center justify-center rounded-lg border border-line bg-surface-subtle p-4">
          {previewError ? (
            <span className="text-sm text-danger">{previewError}</span>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Export preview" className="h-auto max-h-[420px] max-w-full rounded-md shadow-sm" />
          ) : (
            <span className="flex items-center gap-2 text-sm text-fg-muted"><Spinner />Drawing preview…</span>
          )}
          {isRendering && previewUrl ? <span className="absolute right-2 top-2"><Spinner className="h-3.5 w-3.5 text-fg-muted" /></span> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span role="status" className="text-xs text-fg-muted">{copyFeedback}</span>
          <div className="flex gap-2">
            <button id="png-export-copy-btn" className="btn" onClick={handleCopy} disabled={!previewUrl}>Copy</button>
            <button id="png-export-save-btn" className="btn btn-primary" onClick={handleSave} disabled={!previewUrl}>Save</button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
