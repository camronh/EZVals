import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { withColors } from '../../lib/comparison'
import { statsFor } from '../../lib/stats'
import { completedRun, improvedRun, multiMetricRun } from '../../stories/fixtures'
import { PngExportModal } from './PngExportModal'

const meta: Meta<typeof PngExportModal> = {
  title: 'Dashboard/PngExportModal',
  component: PngExportModal,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-[720px]"><Story /></div>],
  args: {
    onClose: fn(),
    stats: statsFor(completedRun.results),
    total: completedRun.results.length,
    sessionName: 'model-upgrade',
  },
}
export default meta
type Story = StoryObj<typeof PngExportModal>

export const SingleRun: Story = {}
export const SeveralMetrics: Story = { args: { stats: statsFor(multiMetricRun.results) } }
export const Comparison: Story = {
  args: {
    comparison: {
      runs: withColors([{ runId: completedRun.run_id, runName: 'baseline' }, { runId: improvedRun.run_id, runName: 'improved' }]),
      stats: { [completedRun.run_id]: statsFor(completedRun.results), [improvedRun.run_id]: statsFor(improvedRun.results) },
    },
  },
}
