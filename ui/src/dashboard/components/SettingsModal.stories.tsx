import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SettingsModal } from './SettingsModal'

const meta: Meta<typeof SettingsModal> = {
  title: 'Dashboard/SettingsModal',
  component: SettingsModal,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-[480px]"><Story /></div>],
  args: { configNames: [], activeConfig: null, onConfigSelect: fn(), onSave: fn(), onClose: fn() },
}
export default meta
type Story = StoryObj<typeof SettingsModal>

export const Defaults: Story = { args: { config: { concurrency: 1 } } }
/** The dialog takes focus, and Escape closes it. */
export const KeyboardDismiss: Story = {
  args: { config: { concurrency: 1 } },
  play: async ({ canvasElement, args }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Settings' })
    await expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}
export const Configured: Story = {
  args: { config: { concurrency: 8, timeout: 30, trials: 3, results_dir: 'eval-results', completion_notifications: true }, configNames: ['claude', 'gpt-5'], activeConfig: 'claude' },
}
