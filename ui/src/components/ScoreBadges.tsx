import type { Score } from '../types'
import { formatScoreValue } from '../lib/format'

export function scoreTone(score: Score) {
  return score.passed === true ? 'bg-accent-success-bg text-accent-success'
    : score.passed === false ? 'bg-accent-error-bg text-accent-error'
      : 'bg-theme-bg-elevated text-theme-text-secondary'
}

/** "✓ key" / "✗ key" for pass/fail scores, "key 0.83" for numeric ones; optionally followed by latency and an annotation. */
export function ScoreBadges({ scores, latency, annotation }: { scores: Score[]; latency?: number | null; annotation?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {scores.map((s, i) => (
        <span
          key={`${s.key}-${i}`}
          className={`score-badge inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${scoreTone(s)}`}
          title={`${s.key}${s.passed != null ? `: ${s.passed ? 'passed' : 'failed'}` : ''}${s.value != null ? ` (${formatScoreValue(s.value, 3)})` : ''}${s.notes ? `\n${s.notes}` : ''}`}
        >
          {s.passed != null ? <span aria-hidden="true">{s.passed ? '✓' : '✗'}</span> : null}
          {s.key}
          {s.passed == null && s.value != null ? <span className="font-mono tabular-nums">{formatScoreValue(s.value, 2)}</span> : null}
        </span>
      ))}
      {latency != null ? <span className="latency-value font-mono text-[11px] tabular-nums text-theme-text-muted">{latency.toFixed(2)}s</span> : null}
      {annotation?.trim() ? (
        <span title={annotation} className="max-w-[220px] truncate rounded-md border border-theme-border bg-theme-bg-secondary px-1.5 py-0.5 text-[11px] text-theme-text-secondary">
          {annotation}
        </span>
      ) : null}
    </div>
  )
}
