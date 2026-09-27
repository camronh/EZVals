import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
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

/** Every cell's content is centred on its row: checkbox, eval, text, JSON, scores and time. */
export const Completed: Story = {
  args: { run: completedRun },
  play: async ({ canvasElement }) => {
    const middle = (r: DOMRect) => r.top + r.height / 2
    for (const row of canvasElement.querySelectorAll('tr[data-row="main"]')) {
      const center = middle(row.getBoundingClientRect())
      for (const cell of row.querySelectorAll('td')) {
        if (!cell.getClientRects().length || !cell.firstElementChild) continue
        const boxes = [...cell.children].map((el) => el.getBoundingClientRect())
        const content = middle(new DOMRect(0, Math.min(...boxes.map((b) => b.top)), 0, Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top))))
        await expect(Math.abs(content - center), cell.dataset.col ?? 'checkbox').toBeLessThanOrEqual(1.5)
      }
    }
  },
}
export const NotStarted: Story = { args: { run: notStartedRun } }
export const Running: Story = { args: { run: runningRun } }
export const Trials: Story = { args: { run: trialsRun } }
export const Selected: Story = { args: { run: completedRun, initialSelection: [1, 3] } }
export const SortedByLatency: Story = { args: { run: completedRun, initialSort: [{ col: 'latency', dir: 'desc', type: 'number' }] } }
export const AllColumns: Story = { args: { run: completedRun, hidden: [] } }
export const Empty: Story = { args: { run: emptyRun } }
