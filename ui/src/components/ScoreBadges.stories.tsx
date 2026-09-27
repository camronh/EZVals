import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ScoreBadges } from './ScoreBadges'

const meta: Meta<typeof ScoreBadges> = { title: 'Components/ScoreBadges', component: ScoreBadges }
export default meta
type Story = StoryObj<typeof ScoreBadges>

export const Passed: Story = { args: { scores: [{ key: 'pass', passed: true }] } }
export const Failed: Story = { args: { scores: [{ key: 'pass', passed: false, notes: 'Missing the refund timeline' }] } }
export const Mixed: Story = { args: { scores: [{ key: 'pass', passed: true }, { key: 'helpfulness', value: 0.92 }, { key: 'format', passed: false }] } }
export const WithLatency: Story = { args: { scores: [{ key: 'pass', passed: true }], latency: 0.42 } }
export const SlowLatency: Story = { args: { scores: [{ key: 'pass', passed: true }], latency: 7.9 } }
export const WithAnnotation: Story = { args: { scores: [{ key: 'pass', passed: false }], latency: 1.2, annotation: 'Judge was too strict here' } }

/** Next to a row's outcome icon with one pass/fail key, only the failure notes appear. */
export const OneMetricRow: Story = {
  args: { scores: [{ key: 'pass', passed: false, notes: 'Missing the refund timeline' }], passFail: 'none' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.score-badge')).toBeNull()
    await expect(within(canvasElement).getByText('Missing the refund timeline')).toBeVisible()
  },
}

/** With several keys, a row shows which checks failed and the numeric scores, not the checks that passed. */
export const SeveralMetricsRow: Story = {
  args: { scores: [{ key: 'pass', passed: true }, { key: 'helpfulness', value: 0.41 }, { key: 'concise', passed: false, notes: 'Over 40 words' }], passFail: 'failed' },
  play: async ({ canvasElement }) => {
    await expect([...canvasElement.querySelectorAll('.score-badge')].map((b) => b.textContent)).toEqual(['helpfulness0.41', '✗concisefailed'])
  },
}
