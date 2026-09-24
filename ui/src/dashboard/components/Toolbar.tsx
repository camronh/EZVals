import type { FilterState } from '../../types'
import { Dropdown, toolbarButton } from '../../components/Dropdown'
import { Icon } from '../../components/Icon'
import { countActiveFilters } from '../../lib/filters'
import { ColumnsPanel } from './ColumnsPanel'
import { FiltersPanel, type ScoreKeyMeta } from './FiltersPanel'

export type RunState = 'idle' | 'running' | 'paused' | 'compare'
export type ExportFormat = 'json' | 'csv' | 'markdown' | 'png'

type Props = {
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
  onOpenSettings: () => void
  onRegrade: () => void
  onReloadServer: () => void
  reloading: boolean
  runState: RunState
  selectedCount: number
  onRun: () => void
  onStop: () => void
  onPauseToggle: () => void
}

const menuItem = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-theme-text-secondary hover:bg-theme-bg-elevated disabled:cursor-not-allowed disabled:opacity-60'

function RunControls({ runState, onRun, onStop, onPauseToggle }: Pick<Props, 'runState' | 'onRun' | 'onStop' | 'onPauseToggle'>) {
  if (runState === 'compare') {
    return <span id="compare-mode-label" className="flex h-7 cursor-default select-none items-center px-3 text-xs font-medium text-theme-text-muted">Compare Mode</span>
  }
  if (runState === 'idle') {
    return (
      <button id="play-btn" className="ml-2 flex h-7 items-center gap-1.5 rounded bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500" onClick={onRun}>
        <Icon name="play" className="h-3 w-3" />
        <span id="play-btn-text">Run</span>
      </button>
    )
  }
  const paused = runState === 'paused'
  return (
    <div className="ml-2 flex items-center overflow-hidden rounded border border-theme-btn-border bg-theme-btn-bg shadow-sm">
      <button
        id="pause-btn"
        className={`flex h-7 w-8 items-center justify-center transition-colors ${paused ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-amber-500 hover:bg-amber-500/10'}`}
        onClick={onPauseToggle}
        aria-label={paused ? 'Resume' : 'Pause'}
        title={paused ? 'Resume' : 'Pause'}
      >
        <Icon name={paused ? 'play' : 'pause'} />
      </button>
      <button id="play-btn" className="flex h-7 w-8 items-center justify-center border-l border-theme-btn-border text-rose-500 hover:bg-rose-500/10" onClick={onStop} aria-label="Stop" title="Stop">
        <Icon name="stop" />
        <span id="play-btn-text" className="sr-only">Stop</span>
      </button>
    </div>
  )
}

/** The dashboard header: search, filters, columns, export, settings, more actions and run controls. */
export function Toolbar(props: Props) {
  const activeFilters = countActiveFilters(props.filters)
  return (
    <header className="sticky top-0 z-40 border-b border-theme-border bg-theme-bg/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2">
        <a href="https://ezvals.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
          <img src="/logo.png" alt="EZVals" className="h-7 w-7" />
          <span className="font-mono text-base font-semibold tracking-tight text-theme-text">EZVals</span>
        </a>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-text-muted" />
            <input
              id="search-input"
              type="search"
              className="w-56 rounded border border-theme-border bg-theme-bg-secondary py-1.5 pl-7 pr-3 text-xs text-theme-text placeholder:text-theme-text-muted focus:border-blue-500 focus:outline-none"
              placeholder="Search..."
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
            />
          </div>
          <Dropdown
            panelClass="filters-panel z-50 w-80"
            button={({ toggle }) => (
              <button id="filters-toggle" className={toolbarButton} onClick={toggle} title="Filters">
                <Icon name="filter" />
                {activeFilters ? <span id="filters-count-badge" className="absolute -right-1 -top-1 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">{activeFilters}</span> : null}
              </button>
            )}
          >
            <FiltersPanel filters={props.filters} onChange={props.onFilters} scoreKeys={props.scoreKeys} datasets={props.datasets} labels={props.labels} />
          </Dropdown>
          <Dropdown panelClass="z-[60] w-64" button={({ toggle }) => <button id="columns-toggle" className={toolbarButton} onClick={toggle} title="Columns"><Icon name="grid" /></button>}>
            <ColumnsPanel
              hidden={props.hiddenColumns}
              searchColumns={props.searchColumns}
              onHiddenChange={props.onHiddenColumns}
              onSearchColumnsChange={props.onSearchColumns}
              onResetSort={props.onResetSort}
              onResetWidths={props.onResetWidths}
            />
          </Dropdown>
          <Dropdown panelClass="z-[60] w-44 p-2" button={({ toggle }) => <button id="export-toggle" className={toolbarButton} onClick={toggle} title="Export"><Icon name="download" /></button>}>
            {(close) => (
              <div id="export-menu">
                {([['json', 'JSON', 'raw'], ['csv', 'CSV', 'raw']] as const).map(([format, label, hint]) => (
                  <button key={format} id={`export-${format}-btn`} className={menuItem} onClick={() => { close(); props.onExport(format) }}>
                    <Icon name="download" className="h-3 w-3" />{label}<span className="ml-auto text-[9px] text-theme-text-muted">{hint}</span>
                  </button>
                ))}
                <div className="my-1.5 border-t border-theme-border" />
                <div className="mb-1 px-2 text-[9px] text-theme-text-muted">Filtered view</div>
                <button id="export-md-btn" className={menuItem} onClick={() => { close(); props.onExport('markdown') }}><Icon name="download" className="h-3 w-3" />Markdown</button>
                <button id="export-png-btn" className={menuItem} onClick={() => { close(); props.onExport('png') }}><Icon name="download" className="h-3 w-3" />PNG</button>
              </div>
            )}
          </Dropdown>
          <button id="settings-toggle" className={toolbarButton} onClick={props.onOpenSettings} title="Settings"><Icon name="gear" /></button>
          <Dropdown panelClass="z-50 w-52 p-1.5" button={({ toggle }) => <button id="more-menu-toggle" className="flex h-7 w-4 items-center justify-center text-theme-text-muted hover:text-theme-text-secondary" onClick={toggle} title="More actions"><Icon name="more" /></button>}>
            {(close) => (
              <div id="more-menu">
                <button
                  id="regrade-btn"
                  className={menuItem}
                  disabled={props.runState !== 'idle'}
                  onClick={() => { close(); props.onRegrade() }}
                  title="Score the stored outputs again without re-running targets"
                >
                  <Icon name="target" />
                  <span>{props.selectedCount ? `Regrade ${props.selectedCount} selected` : 'Regrade results'}</span>
                </button>
                <button id="restart-server-btn" className={`${menuItem} text-amber-300`} disabled={props.reloading} onClick={() => { close(); props.onReloadServer() }} title="Rediscover evals and reload settings">
                  <span className={props.reloading ? 'animate-spin' : ''}><Icon name="refresh" /></span>
                  <span>{props.reloading ? 'Reloading...' : 'Reload Server'}</span>
                </button>
              </div>
            )}
          </Dropdown>
          <RunControls runState={props.runState} onRun={props.onRun} onStop={props.onStop} onPauseToggle={props.onPauseToggle} />
        </div>
      </div>
    </header>
  )
}
