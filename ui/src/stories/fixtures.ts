import { http, HttpResponse } from 'msw'
import type { ResultData, RunResultRow, RunSummary, Score, SessionRun } from '../types'
import { statsFor } from '../lib/stats'

export const messages = [
  { role: 'system', content: 'You are AcmeBot, a helpful support agent.' },
  { role: 'user', content: 'Where is my refund for order A-1001?' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', function: { name: 'lookup_order', arguments: '{"order_id": "A-1001"}' } }] },
  { role: 'tool', tool_call_id: 'call_1', content: '{"status": "refunded", "amount": 42.5, "date": "2026-09-20"}' },
  { role: 'assistant', content: 'Your refund of **$42.50** was issued on Sept 20. It usually shows up within 3-5 business days.' },
]

const pass = (key = 'pass', notes?: string): Score => ({ key, passed: true, notes })
const fail = (key = 'pass', notes?: string): Score => ({ key, passed: false, notes })

function row(fn: string, dataset: string, result: ResultData, extra: Partial<RunResultRow> = {}): RunResultRow {
  return { id: `evals/${dataset}.py::${fn}`, function: fn, dataset, labels: [], result: { status: result.error ? 'error' : 'completed', latency: 0.4, metadata: {}, ...result }, ...extra }
}

export const completedRows: RunResultRow[] = [
  row('refund_request[direct]', 'support', {
    input: 'I want a refund for order A-1001',
    reference: 'Acknowledge the refund and give a timeline',
    output: 'Your refund of $42.50 was issued on Sept 20. It usually shows up within 3-5 business days.',
    scores: [pass()],
    latency: 1.24,
    metadata: { model: 'claude-sonnet-5', temperature: 0.2 },
    trace_data: { messages, trace_url: 'https://smith.langchain.com/trace/abc' },
    annotation: 'Great answer, mentions the timeline.',
  }, { labels: ['production'], regradable: true }),
  row('refund_request[indirect]', 'support', {
    input: 'Money back please',
    reference: 'Acknowledge the refund and give a timeline',
    output: 'Could you share your order number so I can look into this?',
    scores: [fail('pass', 'Asked for the order number instead of confirming the refund')],
    latency: 0.87,
  }, { labels: ['production'], regradable: true }),
  row('greeting', 'smalltalk', { input: 'Hello!', output: 'Hi! How can I help you today?', scores: [pass()], latency: 0.21 }),
  row('order_lookup', 'tools', {
    input: { order_id: 'A-1002', user: 'dana@example.com' },
    output: { status: 'shipped', eta: '2026-09-27', carrier: 'UPS' },
    reference: { status: 'shipped' },
    scores: [pass()],
    latency: 2.8,
  }, { labels: ['tools', 'regression'] }),
  row('escalation', 'support', {
    input: 'This is the third time I am asking!!',
    output: null,
    error: 'RateLimitError: 429 Too Many Requests\n  File "agent.py", line 42, in run\n    response = client.messages.create(...)',
    scores: [],
    latency: 6.2,
  }, { labels: ['production'] }),
  row('long_answer', 'smalltalk', {
    input: 'Explain how refunds work in detail.',
    output: '## How refunds work\n\n1. Request a refund within **30 days**.\n2. We review it within 2 business days.\n3. The money goes back to the original payment method.\n\nQuestions? Reply to this message.',
    scores: [pass()],
    latency: 3.4,
  }),
]

function run(runId: string, runName: string, results: RunResultRow[], extra: Partial<RunSummary> = {}): RunSummary {
  const stats = statsFor(results)
  return {
    run_id: runId,
    run_name: runName,
    session_name: 'model-upgrade',
    created_at: 1_790_280_000,
    path: 'evals/',
    total_evaluations: results.length,
    total_errors: results.filter((r) => r.result.error).length,
    total_passed: results.filter((r) => r.result.scores?.some((s) => s.passed)).length,
    average_latency: stats.avgLatency,
    score_chips: stats.chips,
    results,
    ...extra,
  }
}

const withStatus = (rows: RunResultRow[], status: (i: number) => ResultData['status']) =>
  rows.map((r, i) => {
    const s = status(i)
    return s === 'completed' ? r : { ...r, result: { input: r.result.input, reference: r.result.reference, status: s } }
  })

export const completedRun = run('a1b2c3d4', 'baseline', completedRows)
export const notStartedRun = run('a1b2c3d4', 'swift-falcon', withStatus(completedRows, () => 'not_started'))
export const runningRun = { ...run('a1b2c3d4', 'baseline', withStatus(completedRows, (i) => (i < 2 ? 'completed' : i === 2 ? 'running' : 'pending'))), selected_total: null }
export const pausedRun = { ...runningRun, is_paused: true }
export const emptyRun = run('a1b2c3d4', 'empty', [])

/** The same run graded on three keys: the pass/fail check plus a numeric judge score and a second check. */
const extraScores: (Score[] | null)[] = [
  [{ key: 'helpfulness', value: 0.92 }, pass('concise')],
  [{ key: 'helpfulness', value: 0.41 }, pass('concise')],
  [{ key: 'helpfulness', value: 0.85 }, pass('concise')],
  [{ key: 'helpfulness', value: 0.7 }, pass('concise')],
  null,
  [{ key: 'helpfulness', value: 0.78 }, fail('concise', 'Over 40 words')],
]
export const multiMetricRun = run('a1b2c3d4', 'baseline', completedRows.map((r, i) => (
  extraScores[i] ? { ...r, result: { ...r.result, scores: [...(r.result.scores ?? []), ...extraScores[i]!] } } : r
)))

export const improvedRun = run('e5f6a7b8', 'improved', completedRows.map((r, i) => ({
  ...r,
  result: i === 1
    ? { ...r.result, output: 'Your refund is on its way and should arrive within 5 days.', scores: [pass()] }
    : i === 4 ? { ...r.result, error: null, output: 'I am sorry for the trouble. Escalating to a human now.', scores: [pass()] } : r.result,
})), { created_at: 1_790_290_000 })

const trialOutputs = ['Your refund was issued on Sept 20.', 'Please contact support.', 'Your refund was issued on Sept 20.']
export const trialsRun = run('c9d0e1f2', 'three-trials', [
  ...trialOutputs.map((output, i) => row('refund_status', 'support', {
    input: 'Where is my refund?', output, scores: [output.includes('refund') ? pass() : fail('pass', "Didn't address the refund")], latency: 0.3 + i * 0.05,
  }, { id: `evals/support.py::refund_status~${i + 1}`, trial: i + 1, trial_of: 'evals/support.py::refund_status', regradable: true })),
  ...[1, 2, 3].map((trial) => row('greeting', 'smalltalk', { input: 'Hello!', output: 'Hi there!', scores: [pass()], latency: 0.2 }, { trial, trial_of: 'evals/smalltalk.py::greeting' })),
], { trials: 3, pass_at_k: 1, pass_all_k: 0.5 })

export const sessionRuns: SessionRun[] = [
  { run_id: 'e5f6a7b8', run_name: 'improved', timestamp: 1_790_290_000, total_evaluations: 6, total_passed: 5, total_failed: 1, total_errors: 0 },
  { run_id: 'a1b2c3d4', run_name: 'baseline', timestamp: 1_790_280_000, total_evaluations: 6, total_passed: 4, total_failed: 1, total_errors: 1 },
  { run_id: 'f0e1d2c3', run_name: 'gpt-5-mini', timestamp: 1_790_270_000, total_evaluations: 6, total_passed: 3, total_failed: 1, total_errors: 2 },
]

/** MSW handlers serving `active` as the active run of a small session. */
export function apiHandlers(active: RunSummary, others: RunSummary[] = [improvedRun]) {
  const runs = Object.fromEntries([active, ...others].map((r) => [r.run_id, r]))
  return [
    http.get('/results', () => HttpResponse.json(active)),
    http.get('/api/sessions/:session/runs', () => HttpResponse.json({ runs: sessionRuns })),
    http.get('/api/runs/:id/data', ({ params }) => HttpResponse.json(runs[params.id as string] ?? active)),
    http.get('/api/runs/:id/results/:index', ({ params }) => {
      const data = runs[params.id as string] ?? active
      const index = Number(params.index)
      return HttpResponse.json({ result: data.results[index], index, total: data.results.length, run_id: data.run_id, run_name: data.run_name, session_name: data.session_name, eval_path: 'evals/' })
    }),
    http.get('/api/configs', () => HttpResponse.json({ names: ['claude', 'gpt-5'], active: null })),
    http.get('/api/config', () => HttpResponse.json({ concurrency: 4, timeout: 30, results_dir: '.', completion_notifications: false })),
    http.post('/api/runs/regrade', () => HttpResponse.json({ ok: true, regraded: 2, skipped_without_target: 1 })),
    http.all('/api/*', () => HttpResponse.json({ ok: true })),
  ]
}
