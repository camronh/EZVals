import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DetailHeader } from './DetailHeader'

const meta: Meta<typeof DetailHeader> = {
  title: 'Detail/DetailHeader',
  component: DetailHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'refund_request[direct]',
    sessionName: 'model-upgrade',
    run: { id: 'a1b2c3d4', name: 'baseline' },
    runCommand: 'ezvals run evals/::refund_request[direct]',
    position: { index: 3, total: 12 },
    busy: null,
    onNavigate: fn(),
    onRerun: fn(),
    onRegrade: fn(),
  },
}
export default meta
type Story = StoryObj<typeof DetailHeader>

export const Default: Story = {}
export const Trial: Story = { args: { name: 'refund_status', trial: 2 } }
export const Rerunning: Story = { args: { busy: 'rerun' } }
export const Regrading: Story = { args: { busy: 'regrade' } }
export const NotRegradable: Story = { args: { onRegrade: undefined } }
export const FirstResult: Story = { args: { position: { index: 0, total: 12 } } }
export const ComparisonMode: Story = { args: { onRerun: undefined, onRegrade: undefined } }
