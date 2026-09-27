import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ScoreCard } from './ScoreCard'

const meta: Meta<typeof ScoreCard> = { title: 'Components/ScoreCard', component: ScoreCard, decorators: [(Story) => <div className="w-72"><Story /></div>] }
export default meta
type Story = StoryObj<typeof ScoreCard>

export const Passed: Story = { args: { score: { key: 'pass', passed: true } } }
export const Failed: Story = { args: { score: { key: 'pass', passed: false, notes: 'Output does not mention the refund window' } } }
export const Value: Story = { args: { score: { key: 'helpfulness', value: 0.87 } } }
export const ValueAndPassed: Story = { args: { score: { key: 'similarity', value: 0.91, passed: true, notes: 'Above the 0.8 threshold' } } }
export const Editable: Story = { args: { score: { key: 'pass', passed: false, notes: 'Missing the refund timeline' }, onEdit: fn() } }
