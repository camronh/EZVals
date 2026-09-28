import type { Score } from '../types'
import { formatScoreValue } from '../lib/format'

const tone = (score: Score) => (score.passed === true ? 'chip-success' : score.passed === false ? 'chip-danger' : '')

type Props = {
  scores: Score[]
  latency?: number | null
  annotation?: string | null
  /** Which pass/fail chips to show. Next to an outcome icon, passed chips repeat it, and with a single key so do failed ones. */
  passFail?: 'all' | 'failed' | 'none'
}

/** "✓ key" / "✗ key" for pass/fail scores, "key 0.83" for numeric ones, then failed scores' notes; optionally latency and an annotation. */
export function ScoreBadges({ scores, latency, annotation, passFail = 'all' }: Props) {
  const chips = scores.filter((s) => s.passed == null || passFail === 'all' || (passFail === 'failed' && !s.passed))
  const notes = scores.filter((s) => s.notes && s.passed === false)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((s, i) => (
        <span
          key={`${s.key}-${i}`}
          className={`score-badge chip ${tone(s)}`}
          title={`${s.key}${s.passed != null ? `: ${s.passed ? 'passed' : 'failed'}` : ''}${s.value != null ? ` (${formatScoreValue(s.value, 3)})` : ''}${s.notes ? `\n${s.notes}` : ''}`}
        >
          {s.passed != null ? <span aria-hidden="true">{s.passed ? '✓' : '✗'}</span> : null}
          {s.key}
          {s.passed != null ? <span className="sr-only">{s.passed ? 'passed' : 'failed'}</span> : null}
          {s.passed == null && s.value != null ? <span className="font-mono tabular-nums">{formatScoreValue(s.value, 2)}</span> : null}
        </span>
      ))}
      {latency != null ? <span className="latency-value text-2xs tabular-nums text-fg-muted">{latency.toFixed(2)}s</span> : null}
      {annotation?.trim() ? (
        <span title={annotation} className="chip max-w-[220px] truncate font-normal">
          {annotation}
        </span>
      ) : null}
      {notes.map((s, i) => (
        <p key={`notes-${i}`} className="score-notes line-clamp-2 w-full text-xs leading-5 text-danger">{s.notes}</p>
      ))}
    </div>
  )
}
