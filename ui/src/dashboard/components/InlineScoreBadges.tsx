import type { Score } from '../../types'

type InlineScoreBadgesProps = {
  scores: Score[]
  latency?: number | null
}

export default function InlineScoreBadges({ scores, latency }: InlineScoreBadgesProps) {
  const items = []
  if (scores?.length) {
    scores.forEach((s, idx) => {
      let badgeClass = 'bg-theme-bg-elevated text-theme-text-muted'
      if (s.passed === true) badgeClass = 'bg-accent-success-bg text-accent-success'
      else if (s.passed === false) badgeClass = 'bg-accent-error-bg text-accent-error'
      const val = s.value != null ? `:${typeof s.value === 'number' ? s.value.toFixed(1) : s.value}` : ''
      items.push(
        <span key={`${s.key}-${idx}`} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {s.key}{val}
        </span>,
      )
    })
  }
  if (latency != null) {
    const latColor = latency <= 1 ? 'text-accent-success' : (latency <= 5 ? 'text-theme-text-muted' : 'text-accent-error')
    items.push(
      <span key="latency" className={`font-mono text-[10px] ${latColor}`}>
        {latency.toFixed(2)}s
      </span>,
    )
  }
  return items
}
