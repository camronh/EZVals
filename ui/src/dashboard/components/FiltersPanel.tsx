import { useState } from 'react'
import type { FilterState, TriState, ValueRule } from '../../types'
import { defaultFilters, toggleSelection } from '../../lib/filters'
import { Segmented } from '../../components/Dropdown'
import { Icon } from '../../components/Icon'

export type ScoreKeyMeta = Record<string, { numeric: boolean; passed: boolean }>

type Props = {
  filters: FilterState
  onChange: (filters: FilterState) => void
  scoreKeys: ScoreKeyMeta
  datasets: string[]
  labels: string[]
}

type Presence = 'any' | 'yes' | 'no'
const control = 'h-7 rounded-md border border-theme-border bg-theme-bg px-2 text-[13px] text-theme-text focus:border-accent-link focus:outline-none'
const addButton = 'h-7 rounded-md bg-blue-600 px-2.5 text-[12px] font-medium text-white hover:bg-blue-500'
const heading = 'mb-1.5 text-[11px] font-medium text-theme-text-muted'
const toPresence = (v: TriState): Presence => (v === true ? 'yes' : v === false ? 'no' : 'any')
const fromPresence = (v: Presence): TriState => (v === 'yes' ? true : v === 'no' ? false : null)

function Values({ id, title, values, selection, onChange }: {
  id: string
  title: string
  values: string[]
  selection: { include: string[]; exclude: string[] }
  onChange: (selection: { include: string[]; exclude: string[] }) => void
}) {
  if (!values.length) return null
  return (
    <section className="border-t border-theme-border px-3 py-2.5">
      <div className={heading}>{title}</div>
      <div id={id} className="max-h-44 overflow-y-auto">
        {values.map((value) => {
          const only = selection.include.includes(value)
          const hide = selection.exclude.includes(value)
          const pick = (mode: 'include' | 'exclude', on: boolean, label: string, tone: string) => (
            <button
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${on ? tone : 'text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text-secondary'}`}
              aria-pressed={on}
              onClick={() => onChange(toggleSelection(selection, value, mode))}
            >
              {label}
            </button>
          )
          return (
            <div key={value} className="flex items-center gap-2 rounded py-0.5">
              <span title={value} className={`min-w-0 flex-1 truncate ${hide ? 'text-theme-text-muted line-through' : only ? 'font-medium text-theme-text' : 'text-theme-text-secondary'}`}>{value}</span>
              {pick('include', only, 'Only', 'bg-blue-600 text-white')}
              {pick('exclude', hide, 'Hide', 'bg-theme-text-secondary text-theme-bg')}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Score rules, presence switches and Only/Hide per dataset and label. */
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
  const presence: [string, string, Presence, (v: Presence) => void][] = [
    ['filter-has-annotation', 'Annotation', filters.annotation, (annotation) => set({ annotation })],
    ['filter-has-error', 'Error', toPresence(filters.hasError), (v) => set({ hasError: fromPresence(v) })],
    ['filter-has-url', 'URL', toPresence(filters.hasUrl), (v) => set({ hasUrl: fromPresence(v) })],
    ['filter-has-messages', 'Messages', toPresence(filters.hasMessages), (v) => set({ hasMessages: fromPresence(v) })],
  ]
  const rules = [
    ...filters.valueRules.map((r, i) => ({ text: `${r.key} ${r.op === '==' ? '=' : r.op} ${r.value}`, remove: () => set({ valueRules: remove(filters.valueRules, i) }) })),
    ...filters.passedRules.map((r, i) => ({ text: `${r.key} ${r.value ? 'passed' : 'failed'}`, remove: () => set({ passedRules: remove(filters.passedRules, i) }) })),
  ]

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[13px] font-semibold text-theme-text">Filters</span>
        <button id="clear-filters" className="text-[12px] text-accent-link hover:text-accent-link-hover" onClick={() => onChange({ ...defaultFilters(), outcome: filters.outcome })}>Clear all</button>
      </div>
      {keys.length ? (
        <section className="border-t border-theme-border px-3 py-2.5">
          <div className={heading}>Score</div>
          <div className="flex gap-1.5">
            <select id="key-select" className={`w-0 min-w-0 flex-1 ${control}`} value={selectedKey} onChange={(e) => setKey(e.target.value)}>
              {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {scoreKeys[selectedKey]?.numeric ? (
              <span id="value-section" className="flex gap-1.5">
                <select id="fv-op" className={`w-14 ${control}`} value={op} onChange={(e) => setOp(e.target.value as ValueRule['op'])}>
                  {(['>', '>=', '<', '<=', '==', '!='] as const).map((o) => <option key={o} value={o}>{o === '==' ? '=' : o}</option>)}
                </select>
                <input id="fv-val" type="number" step="any" placeholder="0.5" className={`w-16 ${control}`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addValueRule()} />
                <button id="add-fv" className={addButton} onClick={addValueRule}>Add</button>
              </span>
            ) : null}
          </div>
          {scoreKeys[selectedKey]?.passed ? (
            <div id="passed-section" className="mt-1.5 flex gap-1.5">
              <select id="fp-val" className={`flex-1 ${control}`} value={String(passed)} onChange={(e) => setPassed(e.target.value === 'true')}>
                <option value="true">passed</option>
                <option value="false">failed</option>
              </select>
              <button id="add-fp" className={addButton} onClick={() => set({ passedRules: [...filters.passedRules, { key: selectedKey, value: passed }] })}>Add</button>
            </div>
          ) : null}
          {rules.length ? (
            <div id="active-filters" className="mt-2 flex flex-wrap gap-1">
              {rules.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[12px] text-accent-link">
                  {r.text}
                  <button className="opacity-70 hover:opacity-100" aria-label={`Remove ${r.text}`} onClick={r.remove}><Icon name="close" className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="border-t border-theme-border px-3 py-2.5">
        {presence.map(([id, label, current, change]) => (
          <div key={id} className="flex items-center justify-between py-0.5">
            <span className="text-theme-text-secondary">{label}</span>
            <Segmented id={id} size="sm" value={current} onChange={change} options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Has' }, { value: 'no', label: 'None' }]} />
          </div>
        ))}
      </section>
      <Values id="dataset-pills" title="Dataset" values={datasets} selection={filters.selectedDatasets} onChange={(selectedDatasets) => set({ selectedDatasets })} />
      <Values id="label-pills" title="Labels" values={labels} selection={filters.selectedLabels} onChange={(selectedLabels) => set({ selectedLabels })} />
    </div>
  )
}
