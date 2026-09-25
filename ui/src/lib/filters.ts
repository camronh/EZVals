import type { FilterState, Score, TriState, ValueRule } from '../types'
import type { Outcome } from './stats'

export function defaultFilters(): FilterState {
  return {
    outcome: 'all',
    valueRules: [],
    passedRules: [],
    annotation: 'any',
    selectedDatasets: { include: [], exclude: [] },
    selectedLabels: { include: [], exclude: [] },
    hasUrl: null,
    hasMessages: null,
    hasError: null,
  }
}

/** "Only" or "Hide" a dataset/label; picking the active mode again clears it. */
export function toggleSelection(selection: { include: string[]; exclude: string[] }, value: string, mode: 'include' | 'exclude') {
  const active = selection[mode].includes(value)
  const next = { include: selection.include.filter((v) => v !== value), exclude: selection.exclude.filter((v) => v !== value) }
  if (!active) next[mode].push(value)
  return next
}

export function countActiveFilters(f: FilterState) {
  return f.valueRules.length + f.passedRules.length + (f.annotation !== 'any' ? 1 : 0)
    + f.selectedDatasets.include.length + f.selectedDatasets.exclude.length
    + f.selectedLabels.include.length + f.selectedLabels.exclude.length
    + [f.hasError, f.hasUrl, f.hasMessages].filter((v) => v !== null).length
}

const compare: Record<ValueRule['op'], (a: number, b: number) => boolean> = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
}

export type FilterableRow = {
  outcome: Outcome
  annotation?: string | null
  dataset?: string | null
  labels?: string[] | null
  scores?: Score[] | null
  hasError: boolean
  hasUrl: boolean
  hasMessages: boolean
}

function matchesTriState(filter: TriState, value: boolean) {
  return filter === null || filter === value
}

export function matchesFilters(f: FilterState, row: FilterableRow) {
  const dataset = (row.dataset ?? '').trim()
  const labels = row.labels ?? []
  const scores = row.scores ?? []
  const hasAnnotation = !!row.annotation?.trim()
  if (f.outcome === 'errors' && row.outcome !== 'error') return false
  if (f.outcome === 'failed' && row.outcome !== 'failed' && row.outcome !== 'error') return false
  if ((f.annotation === 'yes' && !hasAnnotation) || (f.annotation === 'no' && hasAnnotation)) return false
  if (f.selectedDatasets.include.length && !f.selectedDatasets.include.includes(dataset)) return false
  if (f.selectedDatasets.exclude.includes(dataset)) return false
  if (f.selectedLabels.include.length && !f.selectedLabels.include.some((l) => labels.includes(l))) return false
  if (f.selectedLabels.exclude.some((l) => labels.includes(l))) return false
  if (!matchesTriState(f.hasError, row.hasError) || !matchesTriState(f.hasUrl, row.hasUrl) || !matchesTriState(f.hasMessages, row.hasMessages)) return false
  for (const rule of f.valueRules) {
    const value = Number(scores.find((s) => s.key === rule.key)?.value)
    if (Number.isNaN(value) || !compare[rule.op](value, rule.value)) return false
  }
  for (const rule of f.passedRules) {
    const score = scores.find((s) => s.key === rule.key)
    if (!score || (score.passed === true) !== rule.value) return false
  }
  return true
}
