import type { Score } from '../types'
import { Icon } from './Icon'

/** A score with its value, pass/fail mark and notes. `onEdit` adds a subtle edit button that brightens on hover or focus. */
export function ScoreCard({ score, onEdit }: { score: Score; onEdit?: () => void }) {
  return (
    <div className="group rounded-md border border-theme-border bg-theme-bg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-theme-text" title={score.key}>{score.key}</span>
        <div className="flex shrink-0 items-center gap-2">
          {onEdit ? (
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-theme-text-muted opacity-60 transition-opacity hover:bg-theme-bg-elevated hover:text-theme-text hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
              title="Edit score"
              onClick={onEdit}
            >
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          ) : null}
          {score.value != null ? <span className="font-mono text-[12px] tabular-nums text-theme-text-secondary">{String(score.value)}</span> : null}
          {score.passed != null ? (
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${score.passed ? 'bg-accent-success-bg text-accent-success' : 'bg-accent-error-bg text-accent-error'}`}>
              <Icon name={score.passed ? 'check' : 'close'} className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      </div>
      {score.notes ? <div className="mt-1 text-[13px] text-theme-text-secondary">{score.notes}</div> : null}
    </div>
  )
}
