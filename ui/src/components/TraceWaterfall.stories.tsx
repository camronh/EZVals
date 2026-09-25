import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { agentSpans } from '../stories/fixtures'
import { TraceWaterfall } from './TraceWaterfall'

const meta: Meta<typeof TraceWaterfall> = {
  title: 'Components/TraceWaterfall',
  component: TraceWaterfall,
  decorators: [(Story) => <div className="max-w-3xl rounded border border-theme-border"><Story /></div>],
}
export default meta
type Story = StoryObj<typeof TraceWaterfall>

export const AgentRun: Story = { args: { spans: agentSpans() } }
export const FailedToolCall: Story = { args: { spans: agentSpans(undefined, true) } }
export const Empty: Story = { args: { spans: [] } }

export const InspectSpan: Story = {
  args: { spans: agentSpans() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('tool lookup_order'))
    await expect(await canvas.findByText(/order\.id/)).toBeVisible()
  },
}
