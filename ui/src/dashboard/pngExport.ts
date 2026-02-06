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
const BAR_AREA_TOP = 240
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

async function drawNormalMode(ctx: CanvasRenderingContext2D, data: PngExportData, colors: ReturnType<typeof getThemeColors>, logo: HTMLImageElement | null) {
  // Background
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  // Logo + title
  let titleX = PAD
  if (logo) {
    const logoH = 36
    const logoW = (logo.width / logo.height) * logoH
    ctx.drawImage(logo, PAD, PAD, logoW, logoH)
    titleX = PAD + logoW + 12
  }
  ctx.fillStyle = colors.text
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('EZVals', titleX, PAD + 18)

  // Metrics line
  const metricsY = PAD + 70
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = colors.text
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
  const barW = Math.min(80, (barAreaW - barGap * (chips.length - 1)) / chips.length)
  const totalBarsW = barW * chips.length + barGap * (chips.length - 1)
  const startX = PAD + (barAreaW - totalBarsW) / 2

  chips.forEach((chip, i) => {
    const { pct, value } = chipStats(chip, 2)
    const x = startX + i * (barW + barGap)
    const h = (pct / 100) * BAR_MAX_H
    const y = BAR_AREA_BOTTOM - h

    // Bar
    ctx.fillStyle = barColor(pct)
    roundRect(ctx, x, y, barW, h, 4)
    ctx.fill()

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

  // Footer branding
  ctx.fillStyle = colors.muted
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('ezvals.com', W - PAD, H - PAD + 10)
  ctx.textAlign = 'left'
}

async function drawComparisonMode(ctx: CanvasRenderingContext2D, data: PngExportData, colors: ReturnType<typeof getThemeColors>, logo: HTMLImageElement | null) {
  // Background
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  // Logo + title
  let titleX = PAD
  if (logo) {
    const logoH = 36
    const logoW = (logo.width / logo.height) * logoH
    ctx.drawImage(logo, PAD, PAD, logoW, logoH)
    titleX = PAD + logoW + 12
  }
  ctx.fillStyle = colors.text
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('EZVals', titleX, PAD + 18)

  // Run chips
  const runs = data.normalizedComparisonRuns
  let chipX = PAD
  const chipY = PAD + 64
  ctx.textBaseline = 'middle'
  runs.forEach((run) => {
    const runData = data.comparisonData[run.runId]
    const testCount = runData?.results?.length || 0
    const label = `${run.runName} (${testCount})`

    // Dot
    ctx.fillStyle = run.color
    ctx.beginPath()
    ctx.arc(chipX + 8, chipY, 6, 0, Math.PI * 2)
    ctx.fill()

    // Label
    ctx.fillStyle = colors.text
    ctx.font = '500 16px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'
    const labelW = ctx.measureText(label).width
    ctx.fillText(label, chipX + 20, chipY)

    chipX += 20 + labelW + 28
  })

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

  // Grid lines
  const compBarTop = 180
  const compBarBottom = 500
  const compBarMaxH = compBarBottom - compBarTop

  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = compBarTop + (compBarMaxH * i) / 4
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
  }

  // Draw grouped bars
  const barAreaW = W - PAD * 2
  const groupGap = Math.min(50, barAreaW / keys.length * 0.35)
  const groupW = Math.min(runs.length * 30 + (runs.length - 1) * 4, (barAreaW - groupGap * (keys.length - 1)) / keys.length)
  const singleBarW = Math.max(12, (groupW - (runs.length - 1) * 4) / runs.length)
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

      const x = groupX + runIdx * (singleBarW + 4)
      const h = (pct / 100) * compBarMaxH
      const y = compBarBottom - h

      ctx.fillStyle = run.color
      roundRect(ctx, x, y, singleBarW, Math.max(h, 2), 3)
      ctx.fill()

      // Percentage above bar
      if (pct > 0) {
        ctx.fillStyle = colors.text
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const label = key === '_latency'
          ? `${((runData?.average_latency || 0)).toFixed(1)}s`
          : `${Math.round(pct)}%`
        ctx.fillText(label, x + singleBarW / 2, y - 3)
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

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Footer branding
  ctx.fillStyle = colors.muted
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('ezvals.com', W - PAD, H - PAD + 10)
  ctx.textAlign = 'left'
}

export async function renderPngCanvas(data: PngExportData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

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
