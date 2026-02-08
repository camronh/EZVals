import type { NormalizedComparisonRun, RunSummary, ScoreChip } from '../types'
import { chipStats, COMPARISON_COLORS } from './utils'

export type PngExportData = {
  displayChips: ScoreChip[]
  displayLatency: number
  displayFilteredCount: number | null
  totalTests: number
  isComparisonMode: boolean
  normalizedComparisonRuns: NormalizedComparisonRun[]
  comparisonData: Record<string, RunSummary>
}

const W = 1200
const H = 630
const PAD = 48
const BAR_AREA_TOP = 160
const BAR_AREA_BOTTOM = 520
const BAR_MAX_H = BAR_AREA_BOTTOM - BAR_AREA_TOP

const BAR_HEX = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' } as const

function barColor(pct: number): string {
  return pct >= 80 ? BAR_HEX.green : pct >= 50 ? BAR_HEX.amber : BAR_HEX.red
}

function getThemeColors(): { bg: string; text: string; muted: string; border: string } {
  const style = getComputedStyle(document.documentElement)
  return {
    bg: style.getPropertyValue('--bg').trim() || '#09090b',
    text: style.getPropertyValue('--text').trim() || '#fafafa',
    muted: style.getPropertyValue('--text-muted').trim() || '#a1a1aa',
    border: style.getPropertyValue('--border').trim() || '#27272a',
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function topRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, r: number) {
  if (h < 2) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, Math.max(h, 2))
    return
  }
  const [cr, cg, cb] = hexToRgb(color)

  // Glow
  ctx.save()
  ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, 0.35)`
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  topRoundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()

  // Gradient fill
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.9)`)
  grad.addColorStop(0.5, color)
  grad.addColorStop(1, `rgba(${Math.max(cr - 30, 0)}, ${Math.max(cg - 30, 0)}, ${Math.max(cb - 30, 0)}, 1)`)
  topRoundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = grad
  ctx.fill()

  // Highlight — thin lighter stripe near top
  const hlGrad = ctx.createLinearGradient(x, y, x, y + Math.min(h * 0.35, 40))
  hlGrad.addColorStop(0, `rgba(255, 255, 255, 0.18)`)
  hlGrad.addColorStop(1, `rgba(255, 255, 255, 0)`)
  topRoundRect(ctx, x, y, w, Math.min(h * 0.35, 40), r)
  ctx.fillStyle = hlGrad
  ctx.fill()
}

async function drawNormalMode(ctx: CanvasRenderingContext2D, data: PngExportData, colors: ReturnType<typeof getThemeColors>, logo: HTMLImageElement | null) {
  // Background
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  // Metrics line
  const metricsY = PAD + 24
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = colors.text
  ctx.textBaseline = 'middle'
  const testLabel = data.displayFilteredCount != null
    ? `${data.displayFilteredCount} / ${data.totalTests} tests`
    : `${data.totalTests} tests`
  ctx.fillText(testLabel, PAD, metricsY)

  if (data.displayLatency > 0) {
    const testWidth = ctx.measureText(testLabel).width
    ctx.fillStyle = colors.muted
    ctx.font = '400 20px system-ui, -apple-system, sans-serif'
    ctx.fillText(`${data.displayLatency.toFixed(2)}s avg latency`, PAD + testWidth + 32, metricsY)
  }

  // Grid lines
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = BAR_AREA_TOP + (BAR_MAX_H * i) / 4
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
  }

  // Y-axis labels
  ctx.fillStyle = colors.muted
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yLabels = ['100%', '75%', '50%', '25%', '0%']
  for (let i = 0; i <= 4; i++) {
    const y = BAR_AREA_TOP + (BAR_MAX_H * i) / 4
    ctx.fillText(yLabels[i], PAD - 10, y)
  }
  ctx.textAlign = 'left'

  // Bars
  const chips = data.displayChips
  if (chips.length === 0) {
    ctx.fillStyle = colors.muted
    ctx.font = '400 18px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('No score data', W / 2, BAR_AREA_TOP + BAR_MAX_H / 2)
    ctx.textAlign = 'left'
    return
  }

  const barAreaW = W - PAD * 2
  const barGap = Math.min(40, barAreaW / chips.length * 0.3)
  const barW = Math.min(140, (barAreaW - barGap * (chips.length - 1)) / chips.length)
  const totalBarsW = barW * chips.length + barGap * (chips.length - 1)
  const startX = PAD + (barAreaW - totalBarsW) / 2

  chips.forEach((chip, i) => {
    const { pct, value } = chipStats(chip, 2)
    const x = startX + i * (barW + barGap)
    const h = (pct / 100) * BAR_MAX_H
    const y = BAR_AREA_BOTTOM - h

    // Bar
    drawBar(ctx, x, y, barW, h, barColor(pct), 6)

    // Percentage above bar
    ctx.fillStyle = colors.text
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${pct}%`, x + barW / 2, y - 8)

    // Label below bar
    ctx.fillStyle = colors.muted
    ctx.font = '400 14px system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'top'
    const label = chip.key.length > 12 ? chip.key.slice(0, 11) + '...' : chip.key
    ctx.fillText(label, x + barW / 2, BAR_AREA_BOTTOM + 10)

    // Value below label
    ctx.fillStyle = colors.text
    ctx.font = '400 13px system-ui, -apple-system, sans-serif'
    ctx.fillText(value, x + barW / 2, BAR_AREA_BOTTOM + 30)
  })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  drawFooter(ctx, colors, logo)
}

async function drawComparisonMode(ctx: CanvasRenderingContext2D, data: PngExportData, colors: ReturnType<typeof getThemeColors>, logo: HTMLImageElement | null) {
  // Background
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  const runs = data.normalizedComparisonRuns

  // Collect all metric keys
  const allKeys = new Set<string>()
  Object.values(data.comparisonData).forEach((runData) => {
    ;(runData?.score_chips || []).forEach((chip) => allKeys.add(chip.key))
  })
  allKeys.add('_latency')
  const keys = Array.from(allKeys)

  // Find max latency for normalization
  let maxLatency = 0
  Object.values(data.comparisonData).forEach((runData) => {
    const lat = runData?.average_latency || 0
    if (lat > maxLatency) maxLatency = lat
  })

  // Layout
  const compBarTop = PAD + 10
  const compBarBottom = 460
  const compBarMaxH = compBarBottom - compBarTop

  // Grid lines
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = compBarTop + (compBarMaxH * i) / 4
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
  }

  // Draw grouped bars — fill available width
  const barAreaW = W - PAD * 2
  const groupGap = Math.min(60, barAreaW / keys.length * 0.3)
  const availPerGroup = (barAreaW - groupGap * (keys.length - 1)) / keys.length
  const barGapInGroup = 6
  const singleBarW = Math.min(60, (availPerGroup - barGapInGroup * (runs.length - 1)) / runs.length)
  const groupW = singleBarW * runs.length + barGapInGroup * (runs.length - 1)
  const totalGroupsW = groupW * keys.length + groupGap * (keys.length - 1)
  const startX = PAD + (barAreaW - totalGroupsW) / 2

  keys.forEach((key, keyIdx) => {
    const groupX = startX + keyIdx * (groupW + groupGap)

    runs.forEach((run, runIdx) => {
      const runData = data.comparisonData[run.runId]
      let pct = 0
      if (key === '_latency') {
        const lat = runData?.average_latency || 0
        pct = maxLatency > 0 ? (lat / maxLatency) * 100 : 0
      } else {
        const chip = (runData?.score_chips || []).find((c) => c.key === key)
        if (chip) pct = chipStats(chip, 2).pct
      }

      const x = groupX + runIdx * (singleBarW + barGapInGroup)
      const h = (pct / 100) * compBarMaxH
      const y = compBarBottom - h

      drawBar(ctx, x, y, singleBarW, h, run.color, 4)

      // Percentage above bar
      if (pct > 0) {
        ctx.fillStyle = colors.text
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const label = key === '_latency'
          ? `${((runData?.average_latency || 0)).toFixed(1)}s`
          : `${Math.round(pct)}%`
        ctx.fillText(label, x + singleBarW / 2, y - 4)
      }
    })

    // Label below group
    ctx.fillStyle = colors.muted
    ctx.font = '400 13px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const label = key === '_latency' ? 'Latency' : (key.length > 12 ? key.slice(0, 11) + '...' : key)
    ctx.fillText(label, groupX + groupW / 2, compBarBottom + 10)
  })

  // Run key — outline chips, bottom left
  const keyY = H - PAD + 10
  ctx.font = '500 13px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  const chipPadX = 12
  const chipH = 26
  const chipGap = 10

  let chipX = PAD
  runs.forEach((run) => {
    const textW = ctx.measureText(run.runName).width
    const chipW = textW + chipPadX * 2

    ctx.strokeStyle = run.color
    ctx.lineWidth = 1.5
    roundRect(ctx, chipX, keyY - chipH / 2, chipW, chipH, chipH / 2)
    ctx.stroke()

    ctx.fillStyle = run.color
    ctx.font = '500 13px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(run.runName, chipX + chipPadX, keyY)

    chipX += chipW + chipGap
  })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  drawFooter(ctx, colors, logo)
}

function drawFooter(ctx: CanvasRenderingContext2D, colors: ReturnType<typeof getThemeColors>, logo: HTMLImageElement | null) {
  const footerY = H - PAD + 10
  ctx.fillStyle = colors.muted
  ctx.font = '400 13px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  if (logo) {
    const logoH = 26
    const logoW = (logo.width / logo.height) * logoH
    const text = 'ezvals.com'
    const textW = ctx.measureText(text).width
    const totalW = logoW + 6 + textW
    const startX = W - PAD - totalW
    ctx.drawImage(logo, startX, footerY - logoH / 2, logoW, logoH)
    ctx.fillText(text, W - PAD, footerY)
  } else {
    ctx.fillText('ezvals.com', W - PAD, footerY)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

export async function renderPngCanvas(data: PngExportData): Promise<HTMLCanvasElement> {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  const colors = getThemeColors()

  let logo: HTMLImageElement | null = null
  try {
    logo = await loadImage('/logo.png')
  } catch {
    // logo optional
  }

  if (data.isComparisonMode && data.normalizedComparisonRuns.length > 1) {
    await drawComparisonMode(ctx, data, colors, logo)
  } else {
    await drawNormalMode(ctx, data, colors, logo)
  }

  return canvas
}
