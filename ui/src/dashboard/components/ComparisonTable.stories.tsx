import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { RunSummary } from '../../types'
import { buildComparison, withColors } from '../../lib/comparison'
import { completedRun, improvedRun } from '../../stories/fixtures'
import { ComparisonTable } from './ComparisonTable'

function args(runs: RunSummary[]) {
  const colored = withColors(runs.map((r) => ({ runId: r.run_id, runName: r.run_name ?? '' })))
  const data = Object.fromEntries(runs.map((r) => [r.run_id, r]))
  return { runs: colored, rows: buildComparison(colored, data).map((entry, index) => ({ ...entry, index })) }
}

const meta: Meta<typeof ComparisonTable> = {
  title: 'Dashboard/ComparisonTable',
  component: ComparisonTable,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="bg-surface p-4"><Story /></div>],
  args: { onSort: fn(), onSaveAnnotation: fn(async () => {}) },
}
export default meta
type Story = StoryObj<typeof ComparisonTable>

export const TwoRuns: Story = { args: args([completedRun, improvedRun]) }
export const MissingResults: Story = {
  args: args([completedRun, { ...improvedRun, run_id: 'partial', run_name: 'partial', results: improvedRun.results.slice(0, 3) }, { ...improvedRun, run_id: 'third', run_name: 'third' }]),
}
