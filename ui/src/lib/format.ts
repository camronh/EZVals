export function formatValue(value: unknown) {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Text for copying or previewing a value: strings as-is, everything else as pretty JSON. */
export function getRawText(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

export function formatRunTimestamp(seconds?: number | null) {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDuration(ms: number) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatScoreValue(value: unknown, digits: number) {
  return typeof value === 'number' ? value.toFixed(digits) : String(value)
}
