import type { ComparisonRun } from '../types'
import { barTone, chipStats, extraChips, type SubsetStats } from '../lib/stats'

/** What the image shows: the summary as on screen (the visible rows), or the compared runs' summaries. */
export type PngExportData = {
  stats: SubsetStats
  total: number
  comparison?: { runs: ComparisonRun[]; stats: Record<string, SubsetStats> }
}

export type PngRunOverride = { runId: string; runName: string; color: string }
export type PngScoreColors = { good: string; mid: string; bad: string }

export type PngExportOptions = {
  title?: string
  scoreColors: PngScoreColors
  runOverrides?: PngRunOverride[]
  showTests?: boolean
  showLatency?: boolean
}

// Drawn at 1200 × 630 (the social-card ratio), exported at 2× that scale again for sharp text.
const W = 1200
const H = 630
const PAD = 56
const SCALE = 2 * (1600 / 1200)
const FONT = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/** A colour as the canvas needs it: a `var(--token)` is resolved against the current theme. */
export function cssColor(value: string) {
  const token = /^var\((--[\w-]+)\)$/.exec(value)
  return token ? getComputedStyle(document.documentElement).getPropertyValue(token[1]).trim() : value
}

/** The score colours the image starts with: the theme's own passed, in-progress and failed colours. */
export function defaultScoreColors(): PngScoreColors {
  return { good: cssColor('var(--success)'), mid: cssColor('var(--warning)'), bad: cssColor('var(--danger)') }
}

type Ctx = CanvasRenderingContext2D
type Theme = Record<'bg' | 'fg' | 'muted' | 'line' | 'track', string>

function text(ctx: Ctx, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = `${font} ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(value, x, y)
  return ctx.measureText(value).width
}

function fit(ctx: Ctx, value: string, font: string, maxWidth: number) {
  ctx.font = `${font} ${FONT}`
  let out = value
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2) + '…'
  return out
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(w, h), h, h / 2)
  ctx.fill()
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One run: the pass rate, its outcome bar and legend, and each score key when there is more than one. */
function drawRun(ctx: Ctx, data: PngExportData, theme: Theme, options: PngExportOptions) {
  const { stats } = data
  const colors = options.scoreColors
  let y = 250
  const headline = stats.rate != null ? pct(stats.rate) : String(stats.finished)
  const width = text(ctx, headline, PAD, y, '600 112px', theme.fg)
  text(ctx, stats.rate != null ? 'pass rate' : 'scored', PAD + width + 20, y, '400 26px', theme.muted)

  // The outcome bar: passed, failed and errored shares with a gap between them, the rest left as track.
  y += 40
  const barW = W - PAD * 2
  bar(ctx, PAD, y, barW, 14, theme.track)
  let x = PAD
  for (const [n, color] of [[stats.passed, colors.good], [stats.failed, colors.bad], [stats.errors, `${colors.bad}88`]] as const) {
    if (!n) continue
    const w = (n / stats.count) * barW
    bar(ctx, x, y, w - 4, 14, color)
    x += w
  }

  // The legend under the bar: a dot and a count per outcome.
  y += 58
  x = PAD
  for (const [label, color] of [[`${stats.passed} passed`, colors.good], [`${stats.failed} failed`, colors.bad], [plural(stats.errors, 'error'), `${colors.bad}88`]] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + 7, y - 8, 7, 0, Math.PI * 2)
    ctx.fill()
    x += 24 + text(ctx, label, x + 22, y, '500 22px', theme.fg) + 28
  }

  const metrics = extraChips(stats.chips).slice(0, 4)
  if (!metrics.length) return
  y += 64
  const colW = (W - PAD * 2 - 40 * (metrics.length - 1)) / metrics.length
  metrics.forEach((chip, i) => {
    const { pct: value, value: detail } = chipStats(chip)
    const cx = PAD + i * (colW + 40)
    text(ctx, fit(ctx, chip.key, '400 18px', colW), cx, y, '400 18px', theme.muted)
    const shown = chip.type === 'ratio' ? `${value}%` : detail
    const w = text(ctx, shown, cx, y + 38, '600 30px', theme.fg)
    text(ctx, chip.type === 'ratio' ? detail : 'avg', cx + w + 10, y + 38, '400 16px', theme.muted)
    bar(ctx, cx, y + 54, colW, 8, theme.track)
    const tone = barTone(value)
    bar(ctx, cx, y + 54, (Math.max(value, 0) / 100) * colW, 8, tone === 'tone-good' ? colors.good : tone === 'tone-mid' ? colors.mid : colors.bad)
  })
}

/** Compared runs: one row each with a pass-rate bar in the run's colour, the change from the first run, and latency. */
function drawComparison(ctx: Ctx, data: PngExportData, theme: Theme, options: PngExportOptions) {
  const comparison = data.comparison!
  const overrides = new Map((options.runOverrides ?? []).map((o) => [o.runId, o]))
  const runs = (options.runOverrides?.length ? options.runOverrides.map((o) => comparison.runs.find((r) => r.runId === o.runId)!) : comparison.runs)
    .map((run) => ({ ...run, runName: overrides.get(run.runId)?.runName || run.runName, color: cssColor(overrides.get(run.runId)?.color || run.color) }))
  const base = comparison.stats[runs[0].runId].rate
  const rowH = Math.min(84, 300 / runs.length)
  const nameW = 300
  const barX = PAD + nameW
  const barW = 460
  text(ctx, 'Pass rate', barX, 196, '500 16px', theme.muted)
  text(ctx, 'Latency', W - PAD, 196, '500 16px', theme.muted, 'right')
  runs.forEach((run, i) => {
    const stats = comparison.stats[run.runId]
    const y = 232 + i * rowH + rowH / 2
    ctx.fillStyle = run.color
    ctx.beginPath()
    ctx.arc(PAD + 8, y - 8, 8, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, fit(ctx, run.runName, '600 26px', nameW - 50), PAD + 28, y, '600 26px', theme.fg)
    bar(ctx, barX, y - 18, barW, 14, theme.track)
    if (stats.rate != null) {
      bar(ctx, barX, y - 18, stats.rate * barW, 14, run.color)
      const w = text(ctx, pct(stats.rate), barX + barW + 24, y, '600 26px', theme.fg)
      const change = i && base != null ? Math.round(stats.rate * 100) - Math.round(base * 100) : 0
      if (change) text(ctx, `${change > 0 ? '+' : '−'}${Math.abs(change)}`, barX + barW + 36 + w, y, '600 20px', change > 0 ? options.scoreColors.good : options.scoreColors.bad)
    }
    if (stats.avgLatency) text(ctx, `${stats.avgLatency.toFixed(2)}s`, W - PAD, y, '400 22px', theme.muted, 'right')
  })
}

export async function renderPngCanvas(data: PngExportData, options: PngExportOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'
  const theme: Theme = { bg: cssColor('var(--surface)'), fg: cssColor('var(--fg)'), muted: cssColor('var(--fg-muted)'), line: cssColor('var(--line)'), track: cssColor('var(--surface-muted)') }
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)

  const comparing = !!data.comparison && data.comparison.runs.length > 1
  text(ctx, fit(ctx, options.title?.trim() || 'Eval results', '600 34px', W - PAD * 2), PAD, PAD + 34, '600 34px', theme.fg)
  const facts = comparing ? [`Comparing ${data.comparison!.runs.length} runs`] : [
    options.showTests !== false ? (data.stats.count < data.total ? `${data.stats.count} of ${plural(data.total, 'eval')}` : plural(data.total, 'eval')) : null,
    options.showLatency !== false && data.stats.avgLatency ? `${data.stats.avgLatency.toFixed(2)}s avg latency` : null,
  ].filter((f): f is string => !!f)
  if (facts.length) text(ctx, facts.join('  ·  '), PAD, PAD + 72, '400 20px', theme.muted)

  if (comparing) drawComparison(ctx, data, theme, options)
  else drawRun(ctx, data, theme, options)

  // Footer: a hairline, then the mark and address bottom-right.
  ctx.fillStyle = theme.line
  ctx.fillRect(PAD, H - PAD - 34, W - PAD * 2, 1)
  const logo = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = '/logo.png'
  })
  const w = text(ctx, 'ezvals.com', W - PAD, H - PAD + 2, '500 18px', theme.muted, 'right')
  if (logo) ctx.drawImage(logo, W - PAD - w - 34, H - PAD - 20, 26, 26)
  return canvas
}
