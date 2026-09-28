import type { FilterState, OutcomeFilter } from '../../types'
import { Dropdown, Segmented } from '../../components/Dropdown'
import { Icon } from '../../components/Icon'
import { countActiveFilters } from '../../lib/filters'
import { ColumnsPanel } from './ColumnsPanel'
import { FiltersPanel, type ScoreKeyMeta } from './FiltersPanel'

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'png'

type Props = {
  outcomeCounts: Record<OutcomeFilter, number>
  search: string
  onSearch: (search: string) => void
  filters: FilterState
  onFilters: (filters: FilterState) => void
  scoreKeys: ScoreKeyMeta
  datasets: string[]
  labels: string[]
  hiddenColumns: string[]
  searchColumns: string[]
  onHiddenColumns: (hidden: string[]) => void
  onSearchColumns: (columns: string[]) => void
  onResetSort: () => void
  onResetWidths: () => void
  onExport: (format: ExportFormat) => void
  selectedCount: number
  onClearSelection: () => void
}

const OUTCOMES: [OutcomeFilter, string][] = [['all', 'All'], ['failed', 'Failed'], ['errors', 'Errors']]
const EXPORTS = [['json', 'JSON', 'all results'], ['csv', 'CSV', 'all results'], ['md', 'Markdown', 'this view'], ['png', 'Image', 'this view']] as const

/** Narrow and shape the table: outcome switch, search, filters, columns and export. */
export function FilterBar(props: Props) {
  const activeFilters = countActiveFilters(props.filters)
  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <Segmented
        id="outcome-switch"
        label="Show"
        value={props.filters.outcome}
        onChange={(outcome) => props.onFilters({ ...props.filters, outcome })}
        options={OUTCOMES.map(([value, label]) => ({
          value,
          id: `outcome-${value}`,
          label: <>{label}<span className="font-mono text-2xs tabular-nums">{props.outcomeCounts[value]}</span></>,
        }))}
      />
      <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <input
          id="search-input"
          type="search"
          aria-label="Search results"
          className="input w-full pl-8"
          placeholder="Search"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>
      <Dropdown
        kind="dialog"
        label="Filters"
        align="left"
        panelClass="filters-panel w-80"
        button={({ toggle, trigger }) => (
          <button id="filters-toggle" className={`btn ${activeFilters ? 'btn-pressed' : ''}`} onClick={toggle} {...trigger}>
            <Icon name="filter" />Filters
            {activeFilters ? <span id="filters-count-badge" className="rounded-sm bg-accent-emphasis px-1 font-mono text-2xs leading-4 text-fg-on-emphasis">{activeFilters}</span> : null}
          </button>
        )}
      >
        <FiltersPanel filters={props.filters} onChange={props.onFilters} scoreKeys={props.scoreKeys} datasets={props.datasets} labels={props.labels} />
      </Dropdown>
      {props.selectedCount ? (
        <span id="selection-count" className="flex h-8 items-center gap-0.5 rounded-md bg-accent-subtle pl-2.5 pr-1 text-sm font-medium text-accent">
          {props.selectedCount} selected
          <button className="btn btn-ghost btn-xs btn-icon !text-accent" aria-label="Clear selection" title="Clear selection" onClick={props.onClearSelection}>
            <Icon name="close" className="h-3 w-3" />
          </button>
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Dropdown
          kind="dialog"
          label="Columns"
          panelClass="w-72"
          button={({ toggle, trigger }) => <button id="columns-toggle" className="btn" onClick={toggle} {...trigger}><Icon name="grid" />Columns</button>}
        >
          <ColumnsPanel
            hidden={props.hiddenColumns}
            searchColumns={props.searchColumns}
            onHiddenChange={props.onHiddenColumns}
            onSearchColumnsChange={props.onSearchColumns}
            onResetSort={props.onResetSort}
            onResetWidths={props.onResetWidths}
          />
        </Dropdown>
        <Dropdown
          label="Export"
          panelClass="w-56 p-1"
          button={({ toggle, trigger }) => <button id="export-toggle" className="btn" onClick={toggle} {...trigger}><Icon name="download" />Export</button>}
        >
          {(close) => (
            <div id="export-menu">
              {EXPORTS.map(([id, label, hint]) => (
                <button key={id} id={`export-${id}-btn`} role="menuitem" className="menu-item" onClick={() => { close(); props.onExport(id === 'md' ? 'markdown' : id) }}>
                  {label}<span className="ml-auto text-xs text-fg-muted">{hint}</span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>
      </div>
    </div>
  )
}
