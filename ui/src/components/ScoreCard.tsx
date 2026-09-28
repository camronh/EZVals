import type { Score } from '../types'
import { Icon } from './Icon'

/** A score with its value, pass/fail mark and notes in full; `onEdit` adds an edit button. */
export function ScoreCard({ score, onEdit }: { score: Score; onEdit?: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-fg" title={score.key}>{score.key}</span>
        <div className="flex shrink-0 items-center gap-2">
          {onEdit ? (
            <button className="btn btn-ghost btn-xs btn-icon" title="Edit score" aria-label={`Edit ${score.key} score`} onClick={onEdit}>
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          ) : null}
          {score.value != null ? <span className="font-mono text-sm tabular-nums text-fg">{String(score.value)}</span> : null}
          {score.passed != null ? (
            <span className={`chip ${score.passed ? 'chip-success' : 'chip-danger'}`}>
              <Icon name={score.passed ? 'check' : 'close'} className="h-3 w-3" />{score.passed ? 'Passed' : 'Failed'}
            </span>
          ) : null}
        </div>
      </div>
      {score.notes ? <div className="mt-1 text-sm text-fg-secondary">{score.notes}</div> : null}
    </div>
  )
}
