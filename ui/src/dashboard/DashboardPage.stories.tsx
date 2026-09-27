import type { Meta, StoryObj } from '@storybook/react-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { readQuery } from '../lib/urlState'
import { apiHandlers, completedRun, emptyRun, improvedRun, multiMetricRun, notStartedRun, pausedRun, runningRun, trialsRun } from '../stories/fixtures'
import { DashboardPage } from './DashboardPage'

const meta: Meta<typeof DashboardPage> = {
  title: 'Pages/Dashboard',
  component: DashboardPage,
  parameters: { layout: 'fullscreen' },
  args: { query: readQuery(new URLSearchParams()) },
}
export default meta
type Story = StoryObj<typeof DashboardPage>

export const Completed: Story = { parameters: { msw: { handlers: apiHandlers(completedRun) } } }

/** A result open in the review panel beside the table (?result=1); ↓ steps to the next row, Esc closes it. */
export const ReviewPanel: Story = {
  args: { query: readQuery(new URLSearchParams('result=1')) },
  parameters: { msw: { handlers: apiHandlers(completedRun) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await canvas.findByRole('complementary', { name: /Result: refund_request\[indirect\]/ })
    await expect(within(panel).getByRole('status', { name: 'failed' })).toBeVisible()
    await userEvent.keyboard('{ArrowDown}')
    await expect(await canvas.findByRole('complementary', { name: /Result: greeting/ })).toBeVisible()
    await userEvent.keyboard('{ArrowUp}')
    await expect(await canvas.findByRole('complementary', { name: /Result: refund_request\[indirect\]/ })).toBeVisible()
  },
}

/** On a phone the review panel covers the table, and fits the screen. */
export const ReviewPanelOnPhone: Story = {
  args: { query: readQuery(new URLSearchParams('result=1')) },
  parameters: { msw: { handlers: apiHandlers(completedRun) } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const panel = await within(canvasElement).findByRole('complementary', { name: /Result: refund_request\[indirect\]/ })
    const { left, right } = panel.getBoundingClientRect()
    await expect(left).toBeGreaterThanOrEqual(0)
    await expect(right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth)
  },
}

export const SidebarHidden: Story = {
  parameters: { msw: { handlers: apiHandlers(completedRun) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Hide runs' }))
    await waitFor(() => expect(canvas.queryByRole('complementary', { name: 'Session' })).toBeNull())
  },
}
export const SeveralMetrics: Story = { parameters: { msw: { handlers: apiHandlers(multiMetricRun) } } }
export const NotStarted: Story = { parameters: { msw: { handlers: apiHandlers(notStartedRun) } } }
export const Running: Story = { parameters: { msw: { handlers: apiHandlers(runningRun) } } }
export const Paused: Story = { parameters: { msw: { handlers: apiHandlers(pausedRun) } } }
export const Trials: Story = { parameters: { msw: { handlers: apiHandlers(trialsRun) } } }
export const Empty: Story = { parameters: { msw: { handlers: apiHandlers(emptyRun, []) } } }
export const ImportError: Story = {
  parameters: {
    msw: {
      handlers: apiHandlers({
        ...emptyRun,
        discovery_error: 'Traceback (most recent call last):\n  File "evals/support.py", line 3, in <module>\n    import not_a_real_module\nModuleNotFoundError: No module named \'not_a_real_module\'',
      }, []),
    },
  },
}
export const FilteredFromUrl: Story = {
  args: { query: readQuery(new URLSearchParams('search=refund&dataset_in=support&has_error=0')) },
  parameters: { msw: { handlers: apiHandlers(completedRun) } },
}
export const Comparison: Story = {
  args: { query: readQuery(new URLSearchParams(`compare_run_id=${completedRun.run_id}&compare_run_id=${improvedRun.run_id}`)) },
  parameters: { msw: { handlers: apiHandlers(completedRun) } },
}
export const FailsToLoad: Story = { parameters: { msw: { handlers: [http.get('/results', () => HttpResponse.json({ detail: 'Run not found' }, { status: 404 }))] } } }
