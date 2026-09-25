import type { FilterState, OutcomeFilter } from '../../types'
import { Dropdown, Segmented, button } from '../../components/Dropdown'
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

/** Narrow and shape the table: outcome switch, search, filters, columns and export. */
export function FilterBar(props: Props) {
  const activeFilters = countActiveFilters(props.filters)
  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <Segmented
        id="outcome-switch"
        value={props.filters.outcome}
        onChange={(outcome) => props.onFilters({ ...props.filters, outcome })}
        options={OUTCOMES.map(([value, label]) => ({
          value,
          id: `outcome-${value}`,
          label: <>{label}<span className="font-mono text-[11px] tabular-nums opacity-70">{props.outcomeCounts[value]}</span></>,
        }))}
      />
      <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-text-muted" />
        <input
          id="search-input"
          type="search"
          className="h-8 w-full rounded-md border border-theme-border bg-theme-bg pl-8 pr-3 text-[13px] text-theme-text placeholder:text-theme-text-muted focus:border-accent-link focus:outline-none"
          placeholder="Search"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>
      <Dropdown
        align="left"
        panelClass="filters-panel z-50 w-80"
        button={({ toggle }) => (
          <button id="filters-toggle" className={`${button} ${activeFilters ? '!border-accent-link !text-accent-link' : ''}`} onClick={toggle}>
            <Icon name="filter" />Filters
            {activeFilters ? <span id="filters-count-badge" className="rounded bg-blue-600 px-1 font-mono text-[11px] leading-4 text-white">{activeFilters}</span> : null}
          </button>
        )}
      >
        <FiltersPanel filters={props.filters} onChange={props.onFilters} scoreKeys={props.scoreKeys} datasets={props.datasets} labels={props.labels} />
      </Dropdown>
      {props.selectedCount ? (
        <span id="selection-count" className="flex h-8 items-center gap-1 rounded-md bg-blue-500/10 pl-2.5 pr-1 text-[13px] font-medium text-accent-link">
          {props.selectedCount} selected
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-blue-500/10" aria-label="Clear selection" title="Clear selection" onClick={props.onClearSelection}>
            <Icon name="close" className="h-3 w-3" />
          </button>
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Dropdown panelClass="z-[60] w-72" button={({ toggle }) => <button id="columns-toggle" className={button} onClick={toggle}><Icon name="grid" />Columns</button>}>
          <ColumnsPanel
            hidden={props.hiddenColumns}
            searchColumns={props.searchColumns}
            onHiddenChange={props.onHiddenColumns}
            onSearchColumnsChange={props.onSearchColumns}
            onResetSort={props.onResetSort}
            onResetWidths={props.onResetWidths}
          />
        </Dropdown>
        <Dropdown panelClass="z-[60] w-52 p-1" button={({ toggle }) => <button id="export-toggle" className={button} onClick={toggle}><Icon name="download" />Export</button>}>
          {(close) => (
            <div id="export-menu">
              {([['json', 'JSON', 'all results'], ['csv', 'CSV', 'all results'], ['md', 'Markdown', 'this view'], ['png', 'Image', 'this view']] as const).map(([id, label, hint]) => (
                <button key={id} id={`export-${id}-btn`} className="menu-item" onClick={() => { close(); props.onExport(id === 'md' ? 'markdown' : id) }}>
                  {label}<span className="ml-auto text-[11px] text-theme-text-muted">{hint}</span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>
      </div>
    </div>
  )
}
