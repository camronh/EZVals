import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { SettingsModal } from './SettingsModal'

const meta: Meta<typeof SettingsModal> = {
  title: 'Dashboard/SettingsModal',
  component: SettingsModal,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-[480px]"><Story /></div>],
  args: { configNames: [], activeConfig: null, onConfigSelect: fn(), onToggleTheme: fn(), onSave: fn(), onClose: fn() },
}
export default meta
type Story = StoryObj<typeof SettingsModal>

export const Defaults: Story = { args: { config: { concurrency: 1 } } }
export const Configured: Story = {
  args: { config: { concurrency: 8, timeout: 30, trials: 3, results_dir: 'eval-results', completion_notifications: true }, configNames: ['claude', 'gpt-5'], activeConfig: 'claude' },
}
