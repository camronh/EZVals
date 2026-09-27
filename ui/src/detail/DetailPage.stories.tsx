import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { apiHandlers, completedRows, completedRun, improvedRun, runningRun, trialsRun } from '../stories/fixtures'
import { DetailPage } from './DetailPage'

const meta: Meta<typeof DetailPage> = {
  title: 'Pages/Detail',
  component: DetailPage,
  parameters: { layout: 'fullscreen', msw: { handlers: apiHandlers(completedRun) } },
  args: { runId: completedRun.run_id, index: 0, compareRunIds: [] },
}
export default meta
type Story = StoryObj<typeof DetailPage>

export const WithMessages: Story = {}
export const FailedScore: Story = { args: { index: 1 } }
export const StructuredData: Story = { args: { index: 3 } }
export const Errored: Story = { args: { index: 4 } }
export const Markdown: Story = { args: { index: 5 } }
export const Running: Story = { args: { index: 2 }, parameters: { msw: { handlers: apiHandlers(runningRun) } } }
export const Trial: Story = { args: { runId: trialsRun.run_id, index: 1 }, parameters: { msw: { handlers: apiHandlers(trialsRun) } } }
export const Comparison: Story = { args: { index: 1, compareRunIds: [completedRun.run_id, improvedRun.run_id] } }

const markdownOutput = [
  '## Refund summary',
  '',
  '| Order | Amount | Status |',
  '| --- | ---: | --- |',
  '| A-1001 | $42.50 | Issued |',
  '| A-1002 | $18.00 | Pending review |',
  '| A-1003 | $7.25 | Denied |',
  '',
  '> Refunds post within 3-5 business days.',
  '',
  'Call `refunds.lookup(order_id)` to check one:',
  '',
  '```python',
  'status = refunds.lookup("A-1001")',
  'print(status.eta)',
  '```',
  '',
  '- Issued refunds cannot be cancelled',
  '- Denied refunds can be appealed',
].join('\n')
const traceback = ['Traceback (most recent call last):', ...Array.from({ length: 40 }, (_, i) => `  File "agent/step_${i}.py", line ${10 + i}, in step_${i}`), 'anthropic.RateLimitError: 429 Too Many Requests'].join('\n')
const extraRun = {
  ...completedRun,
  results: [
    { ...completedRows[5], result: { ...completedRows[5].result, output: markdownOutput } },
    { ...completedRows[4], result: { ...completedRows[4].result, error: traceback } },
  ],
}

/** Markdown output with a table, blockquote, inline code and a code block. */
export const MarkdownTable: Story = { args: { runId: extraRun.run_id, index: 0 }, parameters: { msw: { handlers: apiHandlers(extraRun) } } }
/** A long traceback stays capped so the panels remain usable. */
export const LongError: Story = { args: { runId: extraRun.run_id, index: 1 }, parameters: { msw: { handlers: apiHandlers(extraRun) } } }
/** On a phone the panes stack: input, reference, output, then the sidebar. */
export const Mobile: Story = { globals: { viewport: { value: 'mobile2', isRotated: false } } }

/** Escape closes an open drawer instead of leaving the page. */
export const EscapeClosesDrawer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /^Messages/ }))
    const drawer = canvasElement.ownerDocument.getElementById('messages-pane')!
    await waitFor(() => expect(drawer.className).not.toContain('translate-x-full'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(drawer.className).toContain('translate-x-full'))
  },
}
