import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { RunSummary } from '../../types'
import { withColors } from '../../lib/comparison'
import { statsFor, summarizeStats } from '../../lib/stats'
import { completedRun, improvedRun, notStartedRun, runningRun, sessionRuns, trialsRun } from '../../stories/fixtures'
import { StatsPanel } from './StatsPanel'

const props = (run: RunSummary) => ({ stats: summarizeStats(run), sessionName: run.session_name, runName: run.run_name, runId: run.run_id, chips: run.score_chips ?? [], filteredCount: null })

const meta: Meta<typeof StatsPanel> = {
  title: 'Dashboard/StatsPanel',
  component: StatsPanel,
  args: { sessionRuns, onRename: fn(), onRenameRun: fn(), onDeleteRun: fn(), onSelectRun: fn(), onNewRun: fn(), onCompare: fn() },
}
export default meta
type Story = StoryObj<typeof StatsPanel>

export const Completed: Story = { args: props(completedRun) }
export const Running: Story = { args: props(runningRun) }
export const NotStarted: Story = { args: { ...props(notStartedRun), sessionRuns: [] } }
export const Filtered: Story = { args: { ...props(completedRun), filteredCount: 2, chips: statsFor(completedRun.results.slice(0, 2)).chips } }
export const Trials: Story = { args: props(trialsRun) }

const comparing = (runs: RunSummary[]) => ({
  ...props(runs[0]),
  comparison: {
    runs: withColors(runs.map((r) => ({ runId: r.run_id, runName: r.run_name ?? '' }))),
    stats: Object.fromEntries(runs.map((r) => [r.run_id, statsFor(r.results)])),
    onMove: fn(), onRemove: fn(), onAdd: fn(),
  },
})
export const ComparingTwoRuns: Story = { args: comparing([completedRun, improvedRun]) }
export const ComparingFourRuns: Story = {
  args: comparing([completedRun, improvedRun, { ...completedRun, run_id: 'x1', run_name: 'gpt-5-mini' }, { ...improvedRun, run_id: 'x2', run_name: 'haiku' }]),
}
