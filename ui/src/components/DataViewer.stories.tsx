import type { Meta, StoryObj } from '@storybook/react-vite'
import { messages } from '../stories/fixtures'
import { DataViewer } from './DataViewer'

const meta: Meta<typeof DataViewer> = {
  title: 'Components/DataViewer',
  component: DataViewer,
  decorators: [(Story) => <div className="max-w-2xl rounded-sm border border-line p-3"><Story /></div>],
}
export default meta
type Story = StoryObj<typeof DataViewer>

export const PlainText: Story = { args: { content: 'Your refund of $42.50 was issued on Sept 20.' } }
export const Json: Story = { args: { content: { status: 'shipped', eta: '2026-09-27', items: [{ sku: 'A-1', qty: 2 }] } } }
export const JsonString: Story = { args: { content: '{"status": "refunded", "amount": 42.5}' } }
export const Markdown: Story = { args: { content: '## How refunds work\n\n1. Request within **30 days**\n2. We review it\n\n```\nrefund(order_id)\n```\n\nSee [the policy](https://example.com).' } }
export const ChatMessages: Story = { args: { content: messages } }
export const AnthropicMessages: Story = {
  args: {
    content: [
      { role: 'user', content: [{ type: 'text', text: 'What is 2 + 2?' }] },
      { role: 'assistant', content: [{ type: 'text', text: '4' }] },
    ],
  },
}
export const Empty: Story = { args: { content: null, placeholder: 'No output' } }
