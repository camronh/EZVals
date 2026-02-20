import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Score } from '../../types'
import { DataViewer } from '../../components/DataViewer'
import { formatValue } from '../utils'

type CellPreviewTarget = {
  col: string
  rect: DOMRect
  content: unknown
  scores?: Score[]
  error?: string | null
} | null

type CellPreviewPopoverProps = {
  target: CellPreviewTarget
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

function ScorePreviewCard({ score }: { score: Score }) {
  let cls = 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50'
  let textCls = 'text-zinc-700 dark:text-zinc-300'
  let valueCls = 'text-zinc-500 dark:text-zinc-400'
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
    <div className={`rounded border px-2.5 py-1.5 ${cls}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`font-mono text-xs font-medium ${textCls}`}>{score.key}</span>
        <div className="flex items-center gap-1.5">
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

const COLUMN_LABELS: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  reference: 'Reference',
  error: 'Error',
  scores: 'Scores',
}

export default function CellPreviewPopover({ target, onMouseEnter, onMouseLeave }: CellPreviewPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null)

  useEffect(() => {
    if (!target) {
      setPosition(null)
      return
    }

    const { rect } = target
    const popoverWidth = 420
    const popoverMaxHeight = 380
    const gap = 6

    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const placement = spaceBelow >= Math.min(popoverMaxHeight, 200) ? 'below' : spaceAbove > spaceBelow ? 'above' : 'below'

    let top = placement === 'below' ? rect.bottom + gap : rect.top - gap
    let left = rect.left + rect.width / 2 - popoverWidth / 2

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))
    if (placement === 'above') top = Math.max(8, top)

    setPosition({ top, left, placement })
  }, [target])

  if (!target || !position) return null

  const hasContent = target.col === 'scores'
    ? (target.scores && target.scores.length > 0)
    : target.col === 'error'
      ? !!target.error
      : target.content != null && target.content !== ''

  if (!hasContent) return null

  // Skip preview for very short content that's fully visible in the cell
  if (target.col !== 'scores') {
    const text = target.col === 'error' ? (target.error || '') : formatValue(target.content)
    if (text.length < 80 && !text.includes('\n')) return null
  }

  const label = COLUMN_LABELS[target.col] || target.col

  return createPortal(
    <div
      ref={popoverRef}
      className="cell-preview-popover"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: position.placement === 'above' ? undefined : position.top,
        bottom: position.placement === 'above' ? window.innerHeight - position.top : undefined,
        left: position.left,
        width: 420,
        maxHeight: 380,
        zIndex: 60,
      }}
    >
      <div className="cell-preview-label">{label}</div>
      <div className="cell-preview-content">
        {target.col === 'scores' && target.scores ? (
          <div className="space-y-1.5">
            {target.scores.map((score, idx) => (
              <ScorePreviewCard key={`${score.key}-${idx}`} score={score} />
            ))}
          </div>
        ) : target.col === 'error' ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-rose-600 dark:text-rose-300">{target.error}</pre>
        ) : (
          <DataViewer content={target.content} placeholder="--" />
        )}
      </div>
    </div>,
    document.body,
  )
}

export type { CellPreviewTarget }
