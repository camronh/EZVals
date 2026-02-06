import type { RefObject } from 'react'
import type { ColumnDef, FilterState, RunButtonState, SortStateItem } from '../../types'
import { DEFAULT_HIDDEN_COLS, defaultFilters } from '../utils'

type DashboardHeaderProps = {
  search: string
  setSearch: (value: string) => void
  filtersOpen: boolean
  columnsOpen: boolean
  exportOpen: boolean
  setFiltersOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  setColumnsOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  setExportOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  filtersToggleRef: RefObject<HTMLButtonElement>
  filtersMenuRef: RefObject<HTMLDivElement>
  columnsToggleRef: RefObject<HTMLButtonElement>
  columnsMenuRef: RefObject<HTMLDivElement>
  exportToggleRef: RefObject<HTMLButtonElement>
  exportMenuRef: RefObject<HTMLDivElement>
  activeFilterCount: number
  filters: FilterState
  setFilters: (updater: FilterState | ((prev: FilterState) => FilterState)) => void
  selectedScoreKey: string
  setSelectedScoreKey: (value: string) => void
  scoreKeysMeta: { all: string[]; meta: Record<string, { hasNumeric: boolean; hasPassed: boolean }> }
  datasetLabels: { datasets: string[]; labels: string[] }
  hiddenSet: Set<string>
  setHiddenColumns: (value: string[]) => void
  columnDefs: ColumnDef[]
  setSortState: React.Dispatch<React.SetStateAction<SortStateItem[]>>
  setColWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>
  handleExport: (format: string) => void
  handleSettingsOpen: () => void
  runButtonState: RunButtonState
  runMode: string
  setRunMode: (value: string) => void
  runMenuOpen: boolean
  setRunMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  isComparisonMode: boolean
  onRunExecute: (mode: string) => void
}

export default function DashboardHeader({
  search,
  setSearch,
  filtersOpen,
  columnsOpen,
  exportOpen,
  setFiltersOpen,
  setColumnsOpen,
  setExportOpen,
  filtersToggleRef,
  filtersMenuRef,
  columnsToggleRef,
  columnsMenuRef,
  exportToggleRef,
  exportMenuRef,
  activeFilterCount,
  filters,
  setFilters,
  selectedScoreKey,
  setSelectedScoreKey,
  scoreKeysMeta,
  datasetLabels,
  hiddenSet,
  setHiddenColumns,
  columnDefs,
  setSortState,
  setColWidths,
  handleExport,
  handleSettingsOpen,
  runButtonState,
  runMode,
  setRunMode,
  runMenuOpen,
  setRunMenuOpen,
  isComparisonMode,
  onRunExecute,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-theme-border bg-theme-bg/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="EZVals" className="h-7 w-7" />
          <span className="font-mono text-base font-semibold tracking-tight text-theme-text">EZVals</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-search"></use>
            </svg>
            <input
              id="search-input"
              type="search"
              className="w-56 rounded border border-theme-border bg-theme-bg-secondary py-1.5 pl-7 pr-3 text-xs text-theme-text placeholder:text-theme-text-muted focus:border-blue-500 focus:outline-none"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="dropdown relative">
            <button
              ref={filtersToggleRef}
              id="filters-toggle"
              className="relative flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
              onClick={() => { setFiltersOpen((prev) => !prev); setColumnsOpen(false) }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-filter"></use>
              </svg>
              <span id="filters-count-badge" className={`filter-badge absolute -right-1 -top-1 h-4 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white ${activeFilterCount > 0 ? 'active' : ''}`}>
                {activeFilterCount > 0 ? activeFilterCount : ''}
              </span>
            </button>
            <div
              ref={filtersMenuRef}
              id="filters-menu"
              className={`filters-panel absolute right-0 z-50 mt-1 w-80 rounded border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl ${filtersOpen ? 'active' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Filters</span>
                <button
                  id="clear-filters"
                  className="text-[10px] text-blue-400 hover:text-blue-300"
                  onClick={() => setFilters(defaultFilters())}
                >
                  Clear
                </button>
              </div>
              <div className="mb-2 rounded bg-zinc-800/50 p-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Score</span>
                  <select
                    id="key-select"
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:border-blue-500 focus:outline-none"
                    value={selectedScoreKey}
                    onChange={(e) => setSelectedScoreKey(e.target.value)}
                  >
                    {scoreKeysMeta.all.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div className={`flex gap-1 ${scoreKeysMeta.meta?.[selectedScoreKey]?.hasNumeric ? '' : 'hidden'}`} id="value-section">
                  <select id="fv-op" className="w-12 rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">=</option>
                    <option value="!=">!=</option>
                  </select>
                  <input
                    id="fv-val"
                    type="number"
                    step="any"
                    placeholder="val"
                    className="w-14 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const op = (document.getElementById('fv-op') as HTMLSelectElement | null)?.value || '>'
                      const val = parseFloat(e.currentTarget.value)
                      if (!selectedScoreKey || Number.isNaN(val)) return
                      setFilters((prev) => ({ ...prev, valueRules: [...prev.valueRules, { key: selectedScoreKey, op, value: val }] }))
                      e.currentTarget.value = ''
                    }}
                  />
                  <button
                    id="add-fv"
                    className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
                    onClick={() => {
                      const op = (document.getElementById('fv-op') as HTMLSelectElement | null)?.value || '>'
                      const input = document.getElementById('fv-val') as HTMLInputElement | null
                      const val = parseFloat(input?.value || '')
                      if (!selectedScoreKey || Number.isNaN(val)) return
                      setFilters((prev) => ({ ...prev, valueRules: [...prev.valueRules, { key: selectedScoreKey, op, value: val }] }))
                      if (input) input.value = ''
                    }}
                  >
                    +
                  </button>
                </div>
                <div className={`flex gap-1 mt-1 ${scoreKeysMeta.meta?.[selectedScoreKey]?.hasPassed ? '' : 'hidden'}`} id="passed-section">
                  <select id="fp-val" className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                    <option value="true">Passed</option>
                    <option value="false">Failed</option>
                  </select>
                  <button
                    id="add-fp"
                    className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
                    onClick={() => {
                      const val = (document.getElementById('fp-val') as HTMLSelectElement | null)?.value === 'true'
                      if (!selectedScoreKey) return
                      setFilters((prev) => ({ ...prev, passedRules: [...prev.passedRules, { key: selectedScoreKey, value: val }] }))
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  id="filter-has-annotation"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.annotation === 'yes' ? 'bg-blue-600 text-white' : filters.annotation === 'no' ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, annotation: prev.annotation === 'any' ? 'yes' : prev.annotation === 'yes' ? 'no' : 'any' }))
                  }}
                >
                  {filters.annotation === 'no' ? 'No Note' : 'Has Note'}
                </button>
                <button
                  id="filter-has-error"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasError === true ? 'bg-blue-600 text-white' : filters.hasError === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                  onClick={() => setFilters((prev) => ({ ...prev, hasError: prev.hasError === null ? true : prev.hasError === true ? false : null }))}
                >
                  Has Error
                </button>
                <button
                  id="filter-has-url"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasUrl === true ? 'bg-blue-600 text-white' : filters.hasUrl === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                  onClick={() => setFilters((prev) => ({ ...prev, hasUrl: prev.hasUrl === null ? true : prev.hasUrl === true ? false : null }))}
                >
                  Has URL
                </button>
                <button
                  id="filter-has-messages"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${filters.hasMessages === true ? 'bg-blue-600 text-white' : filters.hasMessages === false ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
                  onClick={() => setFilters((prev) => ({ ...prev, hasMessages: prev.hasMessages === null ? true : prev.hasMessages === true ? false : null }))}
                >
                  Has Messages
                </button>
              </div>
              <div className="mb-2">
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Dataset</div>
                <div id="dataset-pills" className="flex flex-wrap gap-1">
                  {datasetLabels.datasets.length === 0 ? (
                    <span className="text-[10px] text-zinc-600 italic">None</span>
                  ) : datasetLabels.datasets.map((ds) => {
                    const isInc = filters.selectedDatasets?.include?.includes(ds)
                    const isExc = filters.selectedDatasets?.exclude?.includes(ds)
                    const pillClass = isInc ? 'bg-blue-600 text-white' : isExc ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    return (
                      <button
                        key={ds}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium cursor-pointer ${pillClass}`}
                        onClick={() => {
                          setFilters((prev) => {
                            const next = { ...prev, selectedDatasets: { include: [...prev.selectedDatasets.include], exclude: [...prev.selectedDatasets.exclude] } }
                            const incIdx = next.selectedDatasets.include.indexOf(ds)
                            const excIdx = next.selectedDatasets.exclude.indexOf(ds)
                            if (incIdx >= 0) {
                              next.selectedDatasets.include.splice(incIdx, 1)
                              next.selectedDatasets.exclude.push(ds)
                            } else if (excIdx >= 0) {
                              next.selectedDatasets.exclude.splice(excIdx, 1)
                            } else {
                              next.selectedDatasets.include.push(ds)
                            }
                            return next
                          })
                        }}
                      >
                        {isExc ? `x ${ds}` : ds}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Labels</div>
                <div id="label-pills" className="flex flex-wrap gap-1">
                  {datasetLabels.labels.length === 0 ? (
                    <span className="text-[10px] text-zinc-600 italic">None</span>
                  ) : datasetLabels.labels.map((la) => {
                    const isInc = filters.selectedLabels?.include?.includes(la)
                    const isExc = filters.selectedLabels?.exclude?.includes(la)
                    const pillClass = isInc ? 'bg-blue-600 text-white' : isExc ? 'bg-rose-500/30 text-rose-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    return (
                      <button
                        key={la}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium cursor-pointer ${pillClass}`}
                        onClick={() => {
                          setFilters((prev) => {
                            const next = { ...prev, selectedLabels: { include: [...prev.selectedLabels.include], exclude: [...prev.selectedLabels.exclude] } }
                            const incIdx = next.selectedLabels.include.indexOf(la)
                            const excIdx = next.selectedLabels.exclude.indexOf(la)
                            if (incIdx >= 0) {
                              next.selectedLabels.include.splice(incIdx, 1)
                              next.selectedLabels.exclude.push(la)
                            } else if (excIdx >= 0) {
                              next.selectedLabels.exclude.splice(excIdx, 1)
                            } else {
                              next.selectedLabels.include.push(la)
                            }
                            return next
                          })
                        }}
                      >
                        {isExc ? `x ${la}` : la}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div id="active-filters" className="flex flex-wrap gap-1 border-t border-zinc-800 pt-2">
                {filters.valueRules.map((rule, idx) => (
                  <span key={`value-${idx}`} className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                    {rule.key} {rule.op} {rule.value}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, valueRules: prev.valueRules.filter((_, i) => i !== idx) }))
                    }}>x</button>
                  </span>
                ))}
                {filters.passedRules.map((rule, idx) => (
                  <span key={`passed-${idx}`} className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                    {rule.key} = {rule.value ? 'pass' : 'fail'}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, passedRules: prev.passedRules.filter((_, i) => i !== idx) }))
                    }}>x</button>
                  </span>
                ))}
                {filters.annotation !== 'any' ? (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                    note: {filters.annotation}
                    <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, annotation: 'any' }))}>x</button>
                  </span>
                ) : null}
                {(filters.selectedDatasets?.include || []).map((ds) => (
                  <span key={`ds-inc-${ds}`} className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    {ds}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, selectedDatasets: { ...prev.selectedDatasets, include: prev.selectedDatasets.include.filter((d) => d !== ds) } }))
                    }}>x</button>
                  </span>
                ))}
                {(filters.selectedDatasets?.exclude || []).map((ds) => (
                  <span key={`ds-exc-${ds}`} className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
                    x {ds}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, selectedDatasets: { ...prev.selectedDatasets, exclude: prev.selectedDatasets.exclude.filter((d) => d !== ds) } }))
                    }}>x</button>
                  </span>
                ))}
                {(filters.selectedLabels?.include || []).map((la) => (
                  <span key={`la-inc-${la}`} className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                    {la}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, selectedLabels: { ...prev.selectedLabels, include: prev.selectedLabels.include.filter((l) => l !== la) } }))
                    }}>x</button>
                  </span>
                ))}
                {(filters.selectedLabels?.exclude || []).map((la) => (
                  <span key={`la-exc-${la}`} className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
                    x {la}
                    <button className="ml-1 hover:text-white" onClick={() => {
                      setFilters((prev) => ({ ...prev, selectedLabels: { ...prev.selectedLabels, exclude: prev.selectedLabels.exclude.filter((l) => l !== la) } }))
                    }}>x</button>
                  </span>
                ))}
                {filters.hasError !== null ? (
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasError ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                    {filters.hasError ? 'has' : 'no'} error
                    <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasError: null }))}>x</button>
                  </span>
                ) : null}
                {filters.hasUrl !== null ? (
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasUrl ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {filters.hasUrl ? 'has' : 'no'} URL
                    <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasUrl: null }))}>x</button>
                  </span>
                ) : null}
                {filters.hasMessages !== null ? (
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${filters.hasMessages ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {filters.hasMessages ? 'has' : 'no'} messages
                    <button className="ml-1 hover:text-white" onClick={() => setFilters((prev) => ({ ...prev, hasMessages: null }))}>x</button>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="dropdown relative">
            <button
              ref={columnsToggleRef}
              id="columns-toggle"
              className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
              onClick={() => { setColumnsOpen((prev) => !prev); setFiltersOpen(false) }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-grid"></use>
              </svg>
            </button>
            <div
              ref={columnsMenuRef}
              id="columns-menu"
              className={`columns-panel absolute right-0 z-50 mt-1 w-48 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl ${columnsOpen ? 'active' : ''}`}
            >
              <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Columns</div>
              {columnDefs.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100">
                  <input
                    type="checkbox"
                    data-col={col.key}
                    checked={!hiddenSet.has(col.key)}
                    className="accent-blue-500"
                    onChange={(e) => {
                      const next = new Set(hiddenSet)
                      if (e.target.checked) next.delete(col.key)
                      else next.add(col.key)
                      setHiddenColumns(Array.from(next))
                    }}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
              <div className="mt-2 flex gap-1 border-t border-zinc-800 pt-2">
                <button id="reset-columns" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setHiddenColumns(Array.from(DEFAULT_HIDDEN_COLS))}>Reset</button>
                <button id="reset-sorting" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setSortState([])}>Sort</button>
                <button id="reset-widths" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300" onClick={() => setColWidths({})}>Width</button>
              </div>
            </div>
          </div>
          <div className="dropdown relative">
            <button
              ref={exportToggleRef}
              id="export-toggle"
              className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text"
              onClick={() => setExportOpen((prev) => !prev)}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-download"></use>
              </svg>
            </button>
            <div
              ref={exportMenuRef}
              id="export-menu"
              className={`absolute right-0 z-50 mt-1 w-44 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl ${exportOpen ? '' : 'hidden'}`}
            >
              <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Export</div>
              <button id="export-json-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('json')}>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                JSON
                <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
              </button>
              <button id="export-csv-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('csv')}>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                CSV
                <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
              </button>
              <div className="border-t border-zinc-800 my-1.5"></div>
              <div className="text-[9px] text-zinc-500 mb-1 px-2">Filtered view</div>
              <button id="export-md-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800" onClick={() => handleExport('markdown')}>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                Markdown
              </button>
            </div>
          </div>
          <button id="settings-toggle" className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text" onClick={handleSettingsOpen}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-gear"></use>
            </svg>
          </button>
          <div className="flex items-center">
            <span id="compare-mode-label" className={`h-7 items-center px-3 text-xs font-medium text-theme-text-muted select-none cursor-default border border-transparent ${isComparisonMode ? 'flex' : 'hidden'}`}>
              Compare Mode
            </span>
            <button
              id="play-btn"
              className={`flex h-7 items-center gap-1.5 ${runButtonState.showDropdown ? 'rounded-l' : 'rounded'} bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 ${runButtonState.hidden ? 'hidden' : ''}`}
              onClick={() => onRunExecute(runMode)}
            >
              <svg className={`play-icon h-3 w-3 ${runButtonState.isRunning ? 'hidden' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                <use href="#icon-play"></use>
              </svg>
              <svg className={`stop-icon h-3 w-3 ${runButtonState.isRunning ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="currentColor">
                <use href="#icon-stop"></use>
              </svg>
              <span id="play-btn-text">{runButtonState.text}</span>
            </button>
            <div className="dropdown relative">
              <button
                id="run-dropdown-toggle"
                className={`h-7 items-center justify-center rounded-r border-l border-emerald-700 bg-emerald-600 px-1.5 text-white hover:bg-emerald-500 ${runButtonState.showDropdown ? 'flex' : 'hidden'}`}
                onClick={() => setRunMenuOpen((prev) => !prev)}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-chevron-down"></use>
                </svg>
              </button>
              <div id="run-dropdown-menu" className={`absolute right-0 z-50 mt-1 w-52 rounded border border-zinc-700 bg-zinc-900 py-1 text-xs shadow-xl ${runMenuOpen ? '' : 'hidden'}`}>
                <button id="run-rerun-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800" onClick={() => { setRunMode('rerun'); setRunMenuOpen(false) }}>
                  <svg className={`h-3 w-3 mt-0.5 text-emerald-400 flex-shrink-0 ${runMode === 'rerun' ? '' : 'invisible'}`} id="rerun-check"><use href="#icon-check"></use></svg>
                  <div>
                    <div className="text-zinc-200">Rerun</div>
                    <div className="text-zinc-500 text-[10px]">Overwrite current run results</div>
                  </div>
                </button>
                <button id="run-new-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800" onClick={() => { setRunMode('new'); setRunMenuOpen(false) }}>
                  <svg className={`h-3 w-3 mt-0.5 text-emerald-400 flex-shrink-0 ${runMode === 'new' ? '' : 'invisible'}`} id="new-check"><use href="#icon-check"></use></svg>
                  <div>
                    <div className="text-zinc-200">New Run</div>
                    <div className="text-zinc-500 text-[10px]">Create a fresh run in this session</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
