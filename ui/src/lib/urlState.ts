import type { FilterState, SortRule, ValueRule } from '../types'
import { COLUMN_KEYS } from './table'
import { defaultFilters } from './filters'

/** Dashboard state kept in the URL so views can be shared (and opened by `ezvals serve --search ...`). */
export type DashboardQuery = {
  runId: string | null
  compareRunIds: string[]
  search: string | null
  filters: FilterState | null
  sort: SortRule[]
  searchColumns: string[] | null
}

const OPS: Record<string, ValueRule['op']> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '==', neq: '!=' }
const OP_NAMES = Object.fromEntries(Object.entries(OPS).map(([name, op]) => [op, name]))
const FILTER_PARAMS = ['annotation', 'has_error', 'has_url', 'has_messages', 'score_value', 'score_passed', 'dataset_in', 'dataset_out', 'label_in', 'label_out']

function triState(value: string | null) {
  return value === '1' ? true : value === '0' ? false : null
}

export function readQuery(params: URLSearchParams): DashboardQuery {
  const all = (name: string) => params.getAll(name).map((v) => v.trim()).filter(Boolean)
  const annotation = params.get('annotation')
  const compareRunIds = [...new Set(all('compare_run_id'))]
  const runId = params.get('run_id')?.trim() || null
  if (compareRunIds.length === 1 && runId && runId !== compareRunIds[0]) compareRunIds.unshift(runId)
  const searchColumns = [...new Set(all('search_col').filter((c) => COLUMN_KEYS.includes(c)))]
  return {
    runId: compareRunIds.length > 1 ? null : runId,
    compareRunIds,
    search: params.get('search'),
    filters: FILTER_PARAMS.some((p) => params.has(p)) ? {
      ...defaultFilters(),
      annotation: annotation === 'yes' || annotation === 'no' ? annotation : 'any',
      hasError: triState(params.get('has_error')),
      hasUrl: triState(params.get('has_url')),
      hasMessages: triState(params.get('has_messages')),
      valueRules: all('score_value').flatMap((raw) => {
        const [key, op, value] = raw.split(',')
        return key && OPS[op] && !Number.isNaN(Number(value)) ? [{ key, op: OPS[op], value: Number(value) }] : []
      }),
      passedRules: all('score_passed').flatMap((raw) => {
        const [key, value] = raw.split(',')
        return key && (value === 'true' || value === 'false') ? [{ key, value: value === 'true' }] : []
      }),
      selectedDatasets: { include: all('dataset_in'), exclude: all('dataset_out') },
      selectedLabels: { include: all('label_in'), exclude: all('label_out') },
    } : null,
    sort: all('sort').flatMap((raw) => {
      const [col, dir, type = 'string'] = raw.split(',')
      return col && (dir === 'asc' || dir === 'desc') && (type === 'string' || type === 'number') ? [{ col, dir, type }] : []
    }),
    searchColumns: searchColumns.length ? searchColumns : null,
  }
}

const OWNED = ['run_id', 'compare_run_id', 'search', 'search_col', 'sort', ...FILTER_PARAMS]

/** Updates the dashboard's keys in `current`, leaving any other query parameters alone. */
export function writeQuery(current: URLSearchParams, state: { runId?: string; compareRunIds: string[]; search: string; searchColumns: string[]; filters: FilterState; sort: SortRule[] }) {
  const params = new URLSearchParams(current)
  OWNED.forEach((key) => params.delete(key))
  const f = state.filters
  if (state.runId && state.compareRunIds.length < 2) params.set('run_id', state.runId)
  if (state.compareRunIds.length > 1) state.compareRunIds.forEach((id) => params.append('compare_run_id', id))
  if (state.search.trim()) params.set('search', state.search.trim())
  if (state.searchColumns.length < COLUMN_KEYS.length) state.searchColumns.forEach((c) => params.append('search_col', c))
  if (f.annotation !== 'any') params.set('annotation', f.annotation)
  if (f.hasError !== null) params.set('has_error', f.hasError ? '1' : '0')
  if (f.hasUrl !== null) params.set('has_url', f.hasUrl ? '1' : '0')
  if (f.hasMessages !== null) params.set('has_messages', f.hasMessages ? '1' : '0')
  f.selectedDatasets.include.forEach((v) => params.append('dataset_in', v))
  f.selectedDatasets.exclude.forEach((v) => params.append('dataset_out', v))
  f.selectedLabels.include.forEach((v) => params.append('label_in', v))
  f.selectedLabels.exclude.forEach((v) => params.append('label_out', v))
  f.valueRules.forEach((r) => params.append('score_value', `${r.key},${OP_NAMES[r.op]},${r.value}`))
  f.passedRules.forEach((r) => params.append('score_passed', `${r.key},${r.value}`))
  state.sort.forEach((r) => params.append('sort', `${r.col},${r.dir},${r.type}`))
  return params
}
