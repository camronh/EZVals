import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { withColors } from '../../lib/comparison'
import { completedRun, improvedRun } from '../../stories/fixtures'
import { PngExportModal } from './PngExportModal'

const meta: Meta<typeof PngExportModal> = {
  title: 'Dashboard/PngExportModal',
  component: PngExportModal,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-[720px]"><Story /></div>],
  args: {
    open: true,
    onClose: fn(),
    displayChips: completedRun.score_chips ?? [],
    displayLatency: completedRun.average_latency ?? 0,
    displayFilteredCount: null,
    totalTests: completedRun.results.length,
    isComparisonMode: false,
    normalizedComparisonRuns: [],
    comparisonData: {},
    sessionName: 'model-upgrade',
  },
}
export default meta
type Story = StoryObj<typeof PngExportModal>

export const SingleRun: Story = {}
export const Comparison: Story = {
  args: {
    isComparisonMode: true,
    normalizedComparisonRuns: withColors([{ runId: completedRun.run_id, runName: 'baseline' }, { runId: improvedRun.run_id, runName: 'improved' }]),
    comparisonData: { [completedRun.run_id]: completedRun, [improvedRun.run_id]: improvedRun },
  },
}
