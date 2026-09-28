import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AnnotationEditor } from './AnnotationEditor'

const meta: Meta<typeof AnnotationEditor> = {
  title: 'Components/AnnotationEditor',
  component: AnnotationEditor,
  args: { onSave: fn(async () => {}), onCancel: fn() },
  decorators: [(Story) => <div className="w-80"><Story /></div>],
}
export default meta
type Story = StoryObj<typeof AnnotationEditor>

export const Empty: Story = { args: { initial: '' } }
export const Existing: Story = { args: { initial: 'The judge missed that the answer cites the policy.' } }

export const SaveFails: Story = {
  args: { initial: 'Needs review', onSave: fn(async () => { throw new Error('Run not found') }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await expect(await canvas.findByText("Couldn't save: Run not found")).toBeVisible()
  },
}

export const SavesTrimmedText: Story = {
  args: { initial: '' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Annotation' }), '  looks right  ')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await expect(args.onSave).toHaveBeenCalledWith('looks right')
  },
}
