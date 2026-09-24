import type { Score } from '../types'
import { Icon } from './Icon'

const TONES = {
  passed: ['border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10', 'text-emerald-700 dark:text-emerald-300', 'text-emerald-600 dark:text-emerald-400'],
  failed: ['border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10', 'text-rose-700 dark:text-rose-300', 'text-rose-600 dark:text-rose-400'],
  neutral: ['border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50', 'text-zinc-700 dark:text-zinc-300', 'text-zinc-500 dark:text-zinc-400'],
}

/** A score with its value, pass/fail mark and notes. `onEdit` adds an edit button that appears on hover. */
export function ScoreCard({ score, onEdit }: { score: Score; onEdit?: () => void }) {
  const [card, keyTone, valueTone] = TONES[score.passed === true ? 'passed' : score.passed === false ? 'failed' : 'neutral']
  return (
    <div className={`group rounded border px-2.5 py-1.5 ${card}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs font-medium ${keyTone}`}>{score.key}</span>
        <div className="flex items-center gap-1.5">
          {onEdit ? (
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              title="Edit score"
              onClick={onEdit}
            >
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          ) : null}
          {score.value != null ? <span className={`font-mono text-xs ${valueTone}`}>{String(score.value)}</span> : null}
          {score.passed != null ? (
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ${score.passed ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <Icon name={score.passed ? 'check' : 'close'} className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </div>
      </div>
      {score.notes ? <div className={`mt-1 text-[11px] ${valueTone}`}>{score.notes}</div> : null}
    </div>
  )
}
