import type { Meta, StoryObj } from '@storybook/react-vite'
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
