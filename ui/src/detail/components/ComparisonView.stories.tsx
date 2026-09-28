import type { Meta, StoryObj } from '@storybook/react-vite'
import { COMPARISON_COLORS } from '../../lib/stats'
import { completedRows, improvedRun } from '../../stories/fixtures'
import { ComparisonView } from './ComparisonView'

const layout = { inputWidth: 50, refHeight: 120, sidebarWidth: 280, comparisonInputWidth: 50, comparisonContextHeight: 220 }

const meta: Meta<typeof ComparisonView> = {
  title: 'Detail/ComparisonView',
  component: ComparisonView,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-[640px] flex-col bg-surface"><Story /></div>],
  args: { base: completedRows[1], layout, onResize: () => () => {} },
}
export default meta
type Story = StoryObj<typeof ComparisonView>

export const TwoRuns: Story = {
  args: {
    runs: [
      { runId: 'a1b2c3d4', runName: 'baseline', color: COMPARISON_COLORS[0], match: { row: completedRows[1], index: 1 } },
      { runId: 'e5f6a7b8', runName: 'improved', color: COMPARISON_COLORS[1], match: { row: improvedRun.results[1], index: 1 } },
    ],
  },
}
export const MissingMatch: Story = {
  args: {
    runs: [
      { runId: 'a1b2c3d4', runName: 'baseline', color: COMPARISON_COLORS[0], match: { row: completedRows[1], index: 1 } },
      { runId: 'x', runName: 'older', color: COMPARISON_COLORS[1], match: null },
      { runId: 'e5f6a7b8', runName: 'improved', color: COMPARISON_COLORS[2], match: { row: improvedRun.results[1], index: 1 } },
    ],
  },
}
