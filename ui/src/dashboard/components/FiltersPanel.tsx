import { useState } from 'react'
import type { FilterState, TriState, ValueRule } from '../../types'
import { cyclePill, cycleTriState, defaultFilters } from '../../lib/filters'

export type ScoreKeyMeta = Record<string, { numeric: boolean; passed: boolean }>

type Props = {
  filters: FilterState
  onChange: (filters: FilterState) => void
  scoreKeys: ScoreKeyMeta
  datasets: string[]
  labels: string[]
}

const selectClass = 'rounded border border-theme-border bg-theme-bg-elevated px-1.5 py-0.5 text-[11px] text-theme-text focus:border-blue-500 focus:outline-none'
const pillTone = (state: TriState) => (state === true ? 'bg-blue-600 text-white' : state === false ? 'bg-rose-500/30 text-rose-300' : 'bg-theme-bg-elevated text-theme-text-muted hover:bg-theme-btn-bg-hover hover:text-theme-text-secondary')

function TriStateToggle({ id, label, value, onChange }: { id: string; label: string; value: TriState; onChange: (v: TriState) => void }) {
  return (
    <button id={id} className={`rounded px-2 py-0.5 text-[10px] font-medium ${pillTone(value)}`} title="Click to cycle: include → exclude → any" onClick={() => onChange(cycleTriState(value))}>
      {value === false ? <><span className="mr-0.5">✕</span>{label}</> : `Has ${label}`}
    </button>
  )
}

function Pills({ id, title, values, selection, onChange }: {
  id: string
  title: string
  values: string[]
  selection: { include: string[]; exclude: string[] }
  onChange: (selection: { include: string[]; exclude: string[] }) => void
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-theme-text-muted">{title}</div>
      <div id={id} className="flex flex-wrap gap-1">
        {values.length === 0 ? <span className="text-[10px] italic text-theme-text-muted">None</span> : values.map((value) => {
          const state = selection.include.includes(value) ? true : selection.exclude.includes(value) ? false : null
          return (
            <button key={value} title={value} className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-[10px] font-medium ${pillTone(state)}`} onClick={() => onChange(cyclePill(selection, value))}>
              {state === false ? <span className="mr-1">x</span> : null}
              <span className="filter-pill-text max-w-[220px] truncate">{value}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ActiveFilter({ tone, children, onRemove }: { tone: string; children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-[10px] ${tone}`}>
      <span className="filter-pill-text max-w-[180px] truncate">{children}</span>
      <button className="ml-1 hover:text-white" onClick={onRemove}>x</button>
    </span>
  )
}

/** Score rules, three-state toggles, dataset/label pills and a list of active filters. */
export function FiltersPanel({ filters, onChange, scoreKeys, datasets, labels }: Props) {
  const keys = Object.keys(scoreKeys).sort()
  const [key, setKey] = useState(keys[0] ?? '')
  const [op, setOp] = useState<ValueRule['op']>('>')
  const [value, setValue] = useState('')
  const [passed, setPassed] = useState(true)
  const selectedKey = keys.includes(key) ? key : keys[0]
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  const addValueRule = () => {
    if (selectedKey && value !== '' && !Number.isNaN(Number(value))) {
      set({ valueRules: [...filters.valueRules, { key: selectedKey, op, value: Number(value) }] })
      setValue('')
    }
  }
  const remove = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)
  const without = (sel: { include: string[]; exclude: string[] }, v: string) => ({ include: sel.include.filter((x) => x !== v), exclude: sel.exclude.filter((x) => x !== v) })

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-theme-text-muted">Filters</span>
        <button id="clear-filters" className="text-[10px] text-blue-400 hover:text-blue-300" onClick={() => onChange(defaultFilters())}>Clear</button>
      </div>
      {keys.length ? (
        <div className="mb-2 rounded bg-theme-bg-elevated/50 p-2">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-theme-text-muted">Score</span>
            <select id="key-select" className={`w-0 min-w-0 flex-1 ${selectClass}`} value={selectedKey} onChange={(e) => setKey(e.target.value)}>
              {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {scoreKeys[selectedKey]?.numeric ? (
            <div id="value-section" className="flex gap-1">
              <select id="fv-op" className={`w-12 ${selectClass}`} value={op} onChange={(e) => setOp(e.target.value as ValueRule['op'])}>
                {(['>', '>=', '<', '<=', '==', '!='] as const).map((o) => <option key={o} value={o}>{o === '==' ? '=' : o}</option>)}
              </select>
              <input id="fv-val" type="number" step="any" placeholder="val" className={`w-14 ${selectClass}`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addValueRule()} />
              <button id="add-fv" className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500" onClick={addValueRule}>+</button>
            </div>
          ) : null}
          {scoreKeys[selectedKey]?.passed ? (
            <div id="passed-section" className="mt-1 flex gap-1">
              <select id="fp-val" className={`flex-1 ${selectClass}`} value={String(passed)} onChange={(e) => setPassed(e.target.value === 'true')}>
                <option value="true">Passed</option>
                <option value="false">Failed</option>
              </select>
              <button id="add-fp" className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500" onClick={() => set({ passedRules: [...filters.passedRules, { key: selectedKey, value: passed }] })}>+</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          id="filter-has-annotation"
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${pillTone(filters.annotation === 'yes' ? true : filters.annotation === 'no' ? false : null)}`}
          title="Click to cycle: include → exclude → any"
          onClick={() => set({ annotation: filters.annotation === 'any' ? 'yes' : filters.annotation === 'yes' ? 'no' : 'any' })}
        >
          {filters.annotation === 'no' ? <><span className="mr-0.5">✕</span>Note</> : 'Has Note'}
        </button>
        <TriStateToggle id="filter-has-error" label="Error" value={filters.hasError} onChange={(hasError) => set({ hasError })} />
        <TriStateToggle id="filter-has-url" label="URL" value={filters.hasUrl} onChange={(hasUrl) => set({ hasUrl })} />
        <TriStateToggle id="filter-has-messages" label="Messages" value={filters.hasMessages} onChange={(hasMessages) => set({ hasMessages })} />
      </div>
      <Pills id="dataset-pills" title="Dataset" values={datasets} selection={filters.selectedDatasets} onChange={(selectedDatasets) => set({ selectedDatasets })} />
      <Pills id="label-pills" title="Labels" values={labels} selection={filters.selectedLabels} onChange={(selectedLabels) => set({ selectedLabels })} />
      <div id="active-filters" className="flex flex-wrap gap-1 border-t border-theme-border pt-2">
        {filters.valueRules.map((r, i) => (
          <ActiveFilter key={`v${i}`} tone="bg-blue-500/20 text-blue-300" onRemove={() => set({ valueRules: remove(filters.valueRules, i) })}>{r.key} {r.op} {r.value}</ActiveFilter>
        ))}
        {filters.passedRules.map((r, i) => (
          <ActiveFilter key={`p${i}`} tone="bg-blue-500/20 text-blue-300" onRemove={() => set({ passedRules: remove(filters.passedRules, i) })}>{r.key} = {r.value ? 'pass' : 'fail'}</ActiveFilter>
        ))}
        {filters.annotation !== 'any' ? <ActiveFilter tone="bg-blue-500/20 text-blue-300" onRemove={() => set({ annotation: 'any' })}>note: {filters.annotation}</ActiveFilter> : null}
        {filters.selectedDatasets.include.map((d) => (
          <ActiveFilter key={`di${d}`} tone="bg-emerald-500/20 text-emerald-300" onRemove={() => set({ selectedDatasets: without(filters.selectedDatasets, d) })}>{d}</ActiveFilter>
        ))}
        {filters.selectedDatasets.exclude.map((d) => (
          <ActiveFilter key={`de${d}`} tone="bg-rose-500/20 text-rose-300" onRemove={() => set({ selectedDatasets: without(filters.selectedDatasets, d) })}>x {d}</ActiveFilter>
        ))}
        {filters.selectedLabels.include.map((l) => (
          <ActiveFilter key={`li${l}`} tone="bg-amber-500/20 text-amber-300" onRemove={() => set({ selectedLabels: without(filters.selectedLabels, l) })}>{l}</ActiveFilter>
        ))}
        {filters.selectedLabels.exclude.map((l) => (
          <ActiveFilter key={`le${l}`} tone="bg-rose-500/20 text-rose-300" onRemove={() => set({ selectedLabels: without(filters.selectedLabels, l) })}>x {l}</ActiveFilter>
        ))}
        {filters.hasError !== null ? <ActiveFilter tone={filters.hasError ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'} onRemove={() => set({ hasError: null })}>{filters.hasError ? 'has' : 'no'} error</ActiveFilter> : null}
        {filters.hasUrl !== null ? <ActiveFilter tone={filters.hasUrl ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'} onRemove={() => set({ hasUrl: null })}>{filters.hasUrl ? 'has' : 'no'} URL</ActiveFilter> : null}
        {filters.hasMessages !== null ? <ActiveFilter tone={filters.hasMessages ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'} onRemove={() => set({ hasMessages: null })}>{filters.hasMessages ? 'has' : 'no'} messages</ActiveFilter> : null}
      </div>
    </div>
  )
}
