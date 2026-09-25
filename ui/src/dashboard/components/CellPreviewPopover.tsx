import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResultData } from '../../types'
import { AnnotationEditor } from '../../components/AnnotationEditor'
import { DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { ScoreCard } from '../../components/ScoreCard'
import { formatValue } from '../../lib/format'

export type PreviewColumn = 'input' | 'output' | 'reference' | 'error' | 'scores' | 'annotation'

export type PreviewTarget = {
  col: PreviewColumn
  rect: DOMRect
  result: ResultData
  runId: string
  index: number
  editing?: boolean
}

const WIDTH = 420
const MAX_HEIGHT = 380
const GAP = 6
const LABELS: Record<PreviewColumn, string> = { input: 'Input', output: 'Output', reference: 'Reference', error: 'Error', scores: 'Scores', annotation: 'Annotation' }

/** Whether hovering this cell shows anything: text cells only preview content too long to read in the table. */
export function hasPreview(col: PreviewColumn, result: ResultData) {
  if (col === 'scores') return !!result.scores?.length
  if (col === 'annotation') return true
  const text = col === 'error' ? (result.error ?? '') : formatValue(result[col])
  return text.length >= 80 || text.includes('\n')
}

type Props = {
  target: PreviewTarget | null
  onKeep: () => void
  onClose: () => void
  onSaveAnnotation: (runId: string, index: number, annotation: string | null) => Promise<void>
}

/** Full content of a table cell, shown on hover. Annotations can be edited in place. */
export function CellPreviewPopover({ target, onKeep, onClose, onSaveAnnotation }: Props) {
  const [editingTarget, setEditingTarget] = useState<PreviewTarget | null>(null)
  if (!target) return null
  const editing = !!target.editing || editingTarget === target

  const { rect, result, col } = target
  const below = window.innerHeight - rect.bottom - GAP >= Math.min(MAX_HEIGHT, 200) || rect.top < window.innerHeight - rect.bottom
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8))
  const annotation = result.annotation ?? ''

  return createPortal(
    <div
      className="cell-preview-popover"
      onMouseEnter={onKeep}
      onMouseLeave={editing ? undefined : onClose}
      style={{
        position: 'fixed',
        top: below ? rect.bottom + GAP : undefined,
        bottom: below ? undefined : window.innerHeight - Math.max(8, rect.top - GAP),
        left,
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
        zIndex: 60,
      }}
    >
      <div className="cell-preview-label flex items-center justify-between gap-2">
        <span>{LABELS[col]}</span>
        {col === 'annotation' && !editing ? (
          <button className="-my-1 -mr-1.5 flex h-5 w-5 items-center justify-center rounded text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text" title="Edit annotation" onClick={() => setEditingTarget(target)}>
            <Icon name="pencil" className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <div className="cell-preview-content">
        {col === 'scores' ? (
          <div className="space-y-1.5">{(result.scores ?? []).map((s, i) => <ScoreCard key={`${s.key}-${i}`} score={s} />)}</div>
        ) : col === 'error' ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-accent-error">{result.error}</pre>
        ) : col === 'annotation' ? (
          editing ? (
            <AnnotationEditor
              initial={annotation}
              rows={5}
              onCancel={onClose}
              onSave={async (next) => {
                await onSaveAnnotation(target.runId, target.index, next)
                onClose()
              }}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words text-[13px] text-theme-text-secondary">{annotation}</div>
          )
        ) : (
          <DataViewer content={result[col]} placeholder="—" />
        )}
      </div>
    </div>,
    document.body,
  )
}
