import type { RunResultRow, Score } from '../../types'
import { Icon } from '../../components/Icon'
import { DataPanel, Verdict } from '../../detail/components/Panels'
import { Sidebar } from '../../detail/components/Sidebar'
import { outcomeOf } from '../../lib/stats'
import { StatusIcon } from './ResultsTable'

type Props = {
  row: RunResultRow
  index: number
  runId: string
  /** Where this result sits among the rows in view. */
  position: { index: number; total: number }
  onMove: (step: -1 | 1) => void
  onClose: () => void
  onSaveAnnotation: (annotation: string | null) => Promise<void>
  onSaveScores: (scores: Score[]) => Promise<void>
  onOpenMessages: () => void
  onEditingChange: (editing: boolean) => void
}

/**
 * The review panel beside the results table: one result's verdict, output, reference and input, then its scores,
 * annotation and details. ↑/↓ step through the rows in view; "Open" gives it the whole page.
 */
export function ResultPanel({ row, index, runId, position, onMove, onClose, ...props }: Props) {
  const r = row.result
  const loading = r.status === 'pending' || r.status === 'running'
  return (
    <aside id="result-panel" aria-label={`Result: ${row.function}`} className="flex w-[min(560px,46%)] lg:min-w-[380px] shrink-0 flex-col border-l border-line bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-[min(560px,100%)] max-lg:shadow-dialog">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        <StatusIcon outcome={outcomeOf(r)} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-fg" title={row.function}>{row.function}</span>
        <span className="shrink-0 pr-1 text-xs tabular-nums text-fg-muted">{position.index + 1} of {position.total}</span>
        <button className="btn btn-ghost btn-xs btn-icon" aria-label="Previous result" title="Previous result (↑)" disabled={position.index <= 0} onClick={() => onMove(-1)}><Icon name="chevron-up" /></button>
        <button className="btn btn-ghost btn-xs btn-icon" aria-label="Next result" title="Next result (↓)" disabled={position.index >= position.total - 1} onClick={() => onMove(1)}><Icon name="chevron-down" /></button>
        <a href={`/runs/${runId}/results/${index}`} className="btn btn-ghost btn-xs" title="Open on its own page (Enter)"><Icon name="external" className="h-3 w-3" />Open</a>
        <button className="btn btn-ghost btn-xs btn-icon" aria-label="Close result" title="Close (Esc)" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Verdict result={r} />
        <DataPanel id="panel-output" tone="output" value={r.output} loading={loading} className="border-b border-line" />
        {r.reference != null ? <DataPanel id="panel-reference" tone="reference" value={r.reference} className="border-b border-line" /> : null}
        <DataPanel id="panel-input" tone="input" value={r.input} className="border-b border-line" />
        <Sidebar row={row} runId={runId} inPanel {...props} />
      </div>
    </aside>
  )
}
