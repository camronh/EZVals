import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import type { RunSummary, SortRule } from '../../types'
import { COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS, sortBy, sortValue, tableRows, toggleSort } from '../../lib/table'
import { completedRun, emptyRun, notStartedRun, runningRun, trialsRun } from '../../stories/fixtures'
import { ResultsTable } from './ResultsTable'

type Args = { run: RunSummary; hidden: string[]; initialSelection: number[]; initialSort: SortRule[] }

const meta: Meta<Args> = {
  title: 'Dashboard/ResultsTable',
  parameters: { layout: 'fullscreen' },
  args: { hidden: DEFAULT_HIDDEN_COLUMNS, initialSelection: [], initialSort: [] },
  // Holds selection, sort and widths the way the page does, so the table can be used.
  render: function Render({ run, hidden, initialSelection, initialSort }) {
    const [selected, setSelected] = useState(new Set(initialSelection))
    const [sort, setSort] = useState(initialSort)
    const [widths, setWidths] = useState<Record<string, number>>({})
    const rows = sortBy(tableRows(run.results, new Set(COLUMN_KEYS)), sort, (r, col) => sortValue(r.result, r.row, col))
    return (
      <div className="bg-surface p-4">
        <ResultsTable
          runId={run.run_id}
          rows={rows}
          hidden={hidden}
          sort={sort}
          widths={widths}
          selected={selected}
          onSelect={setSelected}
          onSort={(col, type, multi) => setSort(toggleSort(sort, col, type, multi))}
          onWidths={setWidths}
          onOpen={fn()}
          onSaveAnnotation={fn(async () => {})}
        />
      </div>
    )
  },
}
export default meta
type Story = StoryObj<Args>

export const Completed: Story = { args: { run: completedRun } }
export const NotStarted: Story = { args: { run: notStartedRun } }
export const Running: Story = { args: { run: runningRun } }
export const Trials: Story = { args: { run: trialsRun } }
export const Selected: Story = { args: { run: completedRun, initialSelection: [1, 3] } }
export const SortedByLatency: Story = { args: { run: completedRun, initialSort: [{ col: 'latency', dir: 'desc', type: 'number' }] } }
export const AllColumns: Story = { args: { run: completedRun, hidden: [] } }
export const Empty: Story = { args: { run: emptyRun } }
