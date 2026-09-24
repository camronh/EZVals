import { COLUMNS, COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS } from '../../lib/table'

type Props = {
  hidden: string[]
  searchColumns: string[]
  onHiddenChange: (hidden: string[]) => void
  onSearchColumnsChange: (columns: string[]) => void
  onResetSort: () => void
  onResetWidths: () => void
}

const toggle = (list: string[], key: string, on: boolean) => (on ? [...list, key] : list.filter((k) => k !== key))
const resetButton = 'flex-1 rounded bg-theme-bg-elevated px-2 py-1 text-[10px] text-theme-text-muted hover:bg-theme-btn-bg-hover hover:text-theme-text-secondary'

/** Which columns are shown and which ones search looks at. */
export function ColumnsPanel({ hidden, searchColumns, onHiddenChange, onSearchColumnsChange, onResetSort, onResetWidths }: Props) {
  return (
    <div id="columns-menu" className="p-2">
      <div className="mb-2 grid grid-cols-[1fr_44px_52px] items-center text-[9px] font-medium uppercase tracking-wider text-theme-text-muted">
        <span>Columns</span>
        <span className="text-center">Show</span>
        <span className="text-center">Search</span>
      </div>
      {COLUMNS.map((col) => (
        <div key={col.key} className="grid grid-cols-[1fr_44px_52px] items-center py-0.5 text-theme-text-secondary hover:text-theme-text">
          <span>{col.label}</span>
          <input type="checkbox" data-col={col.key} className="mx-auto accent-blue-500" checked={!hidden.includes(col.key)} onChange={(e) => onHiddenChange(toggle(hidden, col.key, !e.target.checked))} />
          <input type="checkbox" data-search-col={col.key} className="mx-auto accent-emerald-500" checked={searchColumns.includes(col.key)} onChange={(e) => onSearchColumnsChange(toggle(searchColumns, col.key, e.target.checked))} />
        </div>
      ))}
      <div className="mt-2 flex gap-1 border-t border-theme-border pt-2">
        <button id="reset-columns" className={resetButton} onClick={() => onHiddenChange(DEFAULT_HIDDEN_COLUMNS)}>Reset</button>
        <button id="reset-search-columns" className={resetButton} onClick={() => onSearchColumnsChange(COLUMN_KEYS)}>Search</button>
        <button id="reset-sorting" className={resetButton} onClick={onResetSort}>Sort</button>
        <button id="reset-widths" className={resetButton} onClick={onResetWidths}>Width</button>
      </div>
    </div>
  )
}
