import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { completedRows, messages } from '../../stories/fixtures'
import { DataViewer } from '../../components/DataViewer'
import { DataPanel, Drawer, Verdict } from './Panels'

const meta: Meta = { title: 'Detail/Panels', parameters: { layout: 'fullscreen' } }
export default meta

const frame = (children: React.ReactNode) => <div className="flex h-64 bg-surface">{children}</div>

export const Input: StoryObj = { render: () => frame(<DataPanel tone="input" value={completedRows[0].result.input} />) }
export const Reference: StoryObj = { render: () => frame(<DataPanel tone="reference" value={completedRows[0].result.reference} />) }
export const Output: StoryObj = { render: () => frame(<DataPanel tone="output" value={completedRows[5].result.output} />) }
export const OutputLoading: StoryObj = { render: () => frame(<DataPanel tone="output" value={null} loading />) }

/** The verdict strip: an error with its traceback, or a result that hasn't finished. Passed and failed results have none. */
export const NoVerdictWhenScored: StoryObj = {
  render: () => <div id="verdicts"><Verdict result={completedRows[0].result} /><Verdict result={completedRows[1].result} /></div>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#verdicts')).toBeEmptyDOMElement()
  },
}
export const VerdictError: StoryObj = { render: () => <Verdict result={completedRows[4].result} /> }
export const VerdictRunning: StoryObj = { render: () => <Verdict result={{ status: 'running' }} /> }

const traceback = [
  'anthropic.RateLimitError: 429 Too Many Requests',
  'Traceback (most recent call last):',
  ...Array.from({ length: 40 }, (_, i) => `  File "agent/step_${i}.py", line ${10 + i}, in step_${i}\n    return step_${i + 1}(state)`),
].join('\n')

/** A long traceback is capped in height and scrolls; "Show all" gives it more room. */
export const LongTraceback: StoryObj = {
  render: () => <div className="flex h-[600px] flex-col bg-surface"><Verdict result={{ status: 'error', error: traceback }} /><div className="flex-1 p-3 text-xs text-fg-muted">Panels below stay visible</div></div>,
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('button', { name: 'Show all' })
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  },
}
export const MessagesDrawer: StoryObj = {
  render: () => (
    <div className="h-[600px]">
      <Drawer id="messages-pane" title="Messages" count={messages.length} open onClose={fn()}>
        <div className="p-4"><DataViewer content={messages} /></div>
      </Drawer>
    </div>
  ),
}
