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
const resetButton = 'btn btn-ghost btn-sm'

/** Which columns are shown and which ones search looks at. */
export function ColumnsPanel({ hidden, searchColumns, onHiddenChange, onSearchColumnsChange, onResetSort, onResetWidths }: Props) {
  return (
    <div id="columns-menu" className="p-3">
      <div className="mb-2 grid grid-cols-[1fr_44px_52px] items-center text-2xs font-medium text-fg-muted">
        <span className="text-sm font-semibold text-fg">Columns</span>
        <span className="text-center">Show</span>
        <span className="text-center">Search</span>
      </div>
      {COLUMNS.map((col) => (
        <div key={col.key} className="grid grid-cols-[1fr_44px_52px] items-center py-1 text-fg-secondary">
          <span>{col.label}</span>
          <input type="checkbox" data-col={col.key} aria-label={`Show ${col.label}`} className="mx-auto" checked={!hidden.includes(col.key)} onChange={(e) => onHiddenChange(toggle(hidden, col.key, !e.target.checked))} />
          <input type="checkbox" data-search-col={col.key} aria-label={`Search ${col.label}`} className="mx-auto" checked={searchColumns.includes(col.key)} onChange={(e) => onSearchColumnsChange(toggle(searchColumns, col.key, e.target.checked))} />
        </div>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-line pt-2">
        <button id="reset-columns" className={resetButton} onClick={() => onHiddenChange(DEFAULT_HIDDEN_COLUMNS)}>Reset columns</button>
        <button id="reset-search-columns" className={resetButton} onClick={() => onSearchColumnsChange(COLUMN_KEYS)}>Reset search</button>
        <button id="reset-sorting" className={resetButton} onClick={onResetSort}>Reset sort</button>
        <button id="reset-widths" className={resetButton} onClick={onResetWidths}>Reset widths</button>
      </div>
    </div>
  )
}
