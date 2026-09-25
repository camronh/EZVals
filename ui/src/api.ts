import type { Config, ResultDetail, RunSummary, Score, SessionRun } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, init)
  if (!resp.ok) {
    const text = await resp.text()
    let detail = text
    try {
      detail = JSON.parse(text).detail ?? text
    } catch {
      // not JSON: use the text as-is
    }
    throw new Error(detail || `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

function send<T>(method: string, path: string, body?: unknown) {
  return request<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
}

const run = (runId: string) => `/api/runs/${encodeURIComponent(runId)}`

/** Every call the UI makes to `ezvals serve`. */
export const api = {
  activeRun: () => request<RunSummary>('/results'),
  runData: (runId: string) => request<RunSummary>(`${run(runId)}/data`),
  result: (runId: string, index: number) => request<ResultDetail>(`${run(runId)}/results/${index}`),
  sessionRuns: (session: string) =>
    request<{ runs: SessionRun[] }>(`/api/sessions/${encodeURIComponent(session)}/runs`).then((r) => r.runs),

  /** Runs rows of the active run, or of `runId` (which then becomes the active run). */
  run: (indices?: number[], configName?: string | null, runId?: string) =>
    send('POST', '/api/runs/rerun', { indices, config_name: configName ?? undefined, run_id: runId }),
  regrade: (indices?: number[], runId?: string) =>
    send<{ regraded: number; skipped_without_target: number }>('POST', '/api/runs/regrade', { indices, run_id: runId }),
  newRun: () => send('POST', '/api/runs/new', { indices: [] }),
  stop: () => send('POST', '/api/runs/stop'),
  pause: () => send('POST', '/api/runs/pause'),
  resume: () => send('POST', '/api/runs/resume'),
  reloadServer: () => send('POST', '/api/server/restart'),

  activate: (runId: string) => send('POST', `${run(runId)}/activate`),
  rename: (runId: string, name: string) => send('PATCH', run(runId), { run_name: name }),
  deleteRun: (runId: string) => send('DELETE', run(runId)),
  setPendingRunName: (name: string) => send('PUT', '/api/pending-run-name', { run_name: name }),
  updateResult: (runId: string, index: number, patch: { annotation?: string | null; scores?: Score[] }) =>
    send('PATCH', `${run(runId)}/results/${index}`, { result: patch }),

  config: () => request<Config>('/api/config'),
  saveConfig: (patch: Config) => send('PUT', '/api/config', patch),
  configs: () => request<{ names: string[]; active: string | null }>('/api/configs'),
  selectConfig: (name: string | null) => send('POST', '/api/configs/select', { name }),

  exportUrl: (runId: string, format: 'json' | 'csv') => `${run(runId)}/export/${format}`,
  exportMarkdown: async (runId: string, payload: unknown) => {
    const resp = await fetch(`${run(runId)}/export/markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(await resp.text())
    return resp.blob()
  },
}
