import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { RunSummary } from '../../types'
import { withColors } from '../../lib/comparison'
import { runProgress, statsFor, trialStats } from '../../lib/stats'
import { completedRun, improvedRun, multiMetricRun, notStartedRun, runningRun, sessionRuns, trialsRun } from '../../stories/fixtures'
import { StatsPanel } from './StatsPanel'

const props = (run: RunSummary) => ({
  stats: statsFor(run.results),
  total: run.results.length,
  progress: runProgress(run),
  trials: trialStats(run.results),
})

const meta: Meta<typeof StatsPanel> = {
  title: 'Dashboard/StatsPanel',
  component: StatsPanel,
  args: { sessionRuns },
}
export default meta
type Story = StoryObj<typeof StatsPanel>

/** One pass/fail key: the pass rate is the whole story, so no per-key breakdown. */
export const Completed: Story = {
  args: props(completedRun),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#outcome-bar')).toBeVisible()
    await expect(canvasElement.querySelector('#score-metrics')).toBeNull()
  },
}
/** Rows that finished without a pass/fail score (numeric scores only, or none) are named beside the grey share of the bar. */
export const SomeWithoutPassFail: Story = {
  args: props({
    ...completedRun,
    results: completedRun.results.map((row, i) => (i < 2 ? { ...row, result: { ...row.result, error: null, scores: [{ key: 'helpfulness', value: 0.8 }] } } : row)),
  }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#stats-unjudged')).toHaveTextContent('2 without pass/fail')
    await expect(canvasElement.querySelector('#outcome-bar [title="2 without pass/fail"]')).not.toBeNull()
  },
}

export const SeveralMetrics: Story = {
  args: props(multiMetricRun),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.score-metric')).toHaveLength(3)
  },
}
export const Improved: Story = {
  args: { ...props(improvedRun), delta: { points: 17, previous: 'baseline', onCompare: fn() } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByText(/17 pts/))
    await expect(args.delta!.onCompare).toHaveBeenCalled()
  },
}
export const Regressed: Story = { args: { ...props(completedRun), delta: { points: -17, previous: 'improved', onCompare: fn() } } }
export const Running: Story = { args: props(runningRun) }
export const NotRun: Story = { args: props(notStartedRun) }
export const Filtered: Story = { args: { ...props(completedRun), stats: statsFor(completedRun.results.slice(0, 2)) } }
export const Trials: Story = { args: props(trialsRun) }

const comparing = (runs: RunSummary[]) => ({
  ...props(runs[0]),
  comparison: {
    runs: withColors(runs.map((r) => ({ runId: r.run_id, runName: r.run_name ?? '' }))),
    stats: Object.fromEntries(runs.map((r) => [r.run_id, statsFor(r.results)])),
    onMove: fn(), onRemove: fn(), onAdd: fn(),
  },
})
export const ComparingTwoRuns: Story = {
  args: comparing([completedRun, improvedRun]),
  play: async ({ canvasElement }) => {
    const headers = [...canvasElement.querySelectorAll('#comparison-summary th')].map((th) => th.textContent)
    await expect(headers).toEqual(['Run', 'Pass rate', 'Latency', ''])
  },
}
export const ComparingFourRuns: Story = {
  args: comparing([completedRun, improvedRun, { ...completedRun, run_id: 'x1', run_name: 'gpt-5-mini' }, { ...improvedRun, run_id: 'x2', run_name: 'haiku' }]),
}
