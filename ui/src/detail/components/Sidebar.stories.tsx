import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { completedRows, multiMetricRun } from '../../stories/fixtures'
import { Sidebar } from './Sidebar'

const meta: Meta<typeof Sidebar> = {
  title: 'Detail/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-[640px] w-80"><Story /></div>],
  args: {
    runId: 'a1b2c3d4',
    onSaveAnnotation: fn(async () => {}),
    onSaveScores: fn(async () => {}),
    onOpenMessages: fn(),
    onEditingChange: fn(),
  },
}
export default meta
type Story = StoryObj<typeof Sidebar>

/** A stored trace_url is a link named after its site. */
export const Everything: Story = {
  args: { row: completedRows[0] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: /smith\.langchain\.com/ })).toHaveAttribute('href', 'https://smith.langchain.com/trace/abc')
  },
}
export const FailedScores: Story = { args: { row: completedRows[1] } }
export const SeveralScores: Story = { args: { row: multiMetricRun.results[5] } }
export const StructuredResult: Story = { args: { row: completedRows[3] } }
export const Minimal: Story = { args: { row: { function: 'greeting', result: { status: 'completed', scores: [] } } } }

export const EditingScore: Story = {
  args: { row: completedRows[1] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByTitle('Edit score')[0])
    await expect(await within(canvasElement).findByDisplayValue('Passed: false')).toBeVisible()
  },
}

/** A score with both a value and pass/fail edits both; `.5` saves as a number. */
export const EditingValueAndPassed: Story = {
  args: { row: { function: 'similarity_check', result: { status: 'completed', scores: [{ key: 'similarity', value: 0.91, passed: true, notes: 'Above the 0.8 threshold' }] } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByTitle('Edit score'))
    const value = canvas.getByLabelText('Value')
    await userEvent.clear(value)
    await userEvent.type(value, '.5')
    await userEvent.selectOptions(canvas.getByLabelText('Passed'), 'false')
    await userEvent.click(canvas.getByText('Save'))
    await waitFor(() => expect(args.onSaveScores).toHaveBeenCalledWith([{ key: 'similarity', value: 0.5, passed: false, notes: 'Above the 0.8 threshold' }]))
  },
}

/** Scientific notation is a number too; text that isn't a number stays text. */
export const EditingValueScientific: Story = {
  args: { row: { function: 'tokens', result: { status: 'completed', scores: [{ key: 'tokens', value: 12 }, { key: 'grade', value: 'B' }] } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByTitle('Edit score')[0])
    const value = canvas.getByLabelText('Value')
    await userEvent.clear(value)
    await userEvent.type(value, '1e3')
    await userEvent.click(canvas.getByText('Save'))
    await waitFor(() => expect(args.onSaveScores).toHaveBeenCalledWith([{ key: 'tokens', value: 1000, notes: null }, { key: 'grade', value: 'B' }]))
    await waitFor(() => expect(canvas.queryByLabelText('Value')).toBeNull())
    await userEvent.click(canvas.getAllByTitle('Edit score')[1])
    await userEvent.type(canvas.getByLabelText('Value'), '+')
    await userEvent.click(canvas.getByText('Save'))
    await waitFor(() => expect(args.onSaveScores).toHaveBeenLastCalledWith([{ key: 'tokens', value: 12 }, { key: 'grade', value: 'B+', notes: null }]))
  },
}

/** Escape cancels a score edit from any field, including the pass/fail select. */
export const EscapeCancelsScoreEdit: Story = {
  args: { row: completedRows[1] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByTitle('Edit score')[0])
    const select = canvas.getByLabelText('Passed')
    await waitFor(() => expect(select).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByLabelText('Passed')).toBeNull())
  },
}

/** Without an annotation, a "+ Add annotation" link opens the editor. */
export const AddAnnotation: Story = {
  args: { row: completedRows[1] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('+ Add annotation'))
    await expect(canvas.getByPlaceholderText('Add annotation...')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.getByText('+ Add annotation')).toBeVisible())
  },
}

export const EditingAnnotation: Story = {
  args: { row: completedRows[0] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTitle('Edit annotation'))
    await expect(within(canvasElement).getByText('cancel')).toBeVisible()
  },
}
