import type { Score } from '../types'
import { formatScoreValue, latencyTone } from '../lib/format'

export function scoreTone(score: Score) {
  return score.passed === true ? 'bg-accent-success-bg text-accent-success'
    : score.passed === false ? 'bg-accent-error-bg text-accent-error'
      : 'bg-theme-bg-elevated text-theme-text-muted'
}

/** Compact score chips (key:value), optionally followed by latency and an annotation. */
export function ScoreBadges({ scores, latency, annotation }: { scores: Score[]; latency?: number | null; annotation?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {scores.map((s, i) => (
        <span
          key={`${s.key}-${i}`}
          className={`score-badge shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${scoreTone(s)}`}
          title={`${s.key}${s.value != null ? `: ${formatScoreValue(s.value, 3)}` : ''}${s.notes ? ` -- ${s.notes}` : ''}`}
        >
          {s.key}{s.value != null ? `:${formatScoreValue(s.value, 1)}` : ''}
        </span>
      ))}
      {latency != null ? <span className={`latency-value font-mono text-[10px] ${latencyTone(latency)}`}>{latency.toFixed(2)}s</span> : null}
      {annotation?.trim() ? (
        <span title={annotation} className="max-w-[220px] truncate rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
          {annotation}
        </span>
      ) : null}
    </div>
  )
}
