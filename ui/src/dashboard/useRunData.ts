import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ResultData, RunSummary, SessionRun } from '../types'
import { api } from '../api'
import { useSessionState } from '../hooks/storage'
import { withColors } from '../lib/comparison'

const POLL_MS = 500

export const isActive = (data: RunSummary | null) => !!data?.results.some((r) => r.result.status === 'pending' || r.result.status === 'running')

/** The run `ezvals serve` has active, refreshed while evals are running. */
export function useActiveRun(poll: boolean) {
  const [data, setData] = useState<RunSummary | null>(null)
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    try {
      const next = await api.activeRun()
      setData(next)
      setError(null)
      if (next.session_name) setSessionRuns(await api.sessionRuns(next.session_name))
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  // Load once, then keep refreshing while evals run (and while paused if an eval is still finishing).
  const running = !!data && (data.results.some((r) => r.result.status === 'running') || (!data.is_paused && isActive(data)))
  useEffect(() => {
    if (data && !(poll && running)) return
    const timer = setTimeout(reload, data ? POLL_MS : 0)
    return () => clearTimeout(timer)
  }, [data, poll, running, reload])

  /** Apply an edit locally (the server already has it) so the table updates without a reload. */
  const patchResult = useCallback((index: number, patch: Partial<ResultData>) => {
    setData((prev) => prev && { ...prev, results: prev.results.map((r, i) => (i === index ? { ...r, result: { ...r.result, ...patch } } : r)) })
  }, [])

  return { data, sessionRuns, error, reload, patchResult }
}

/** Runs chosen for comparison (kept for the session, shared with the detail page) and their data. */
export function useComparison(active: RunSummary | null, fromUrl: string[]) {
  const [chosen, setChosen] = useSessionState<{ runId: string; runName?: string }[]>(
    'ezvals:comparisonRuns', [], fromUrl.length > 1 ? fromUrl.map((runId) => ({ runId })) : null,
  )
  const [loaded, setLoaded] = useState<Record<string, RunSummary>>({})
  const comparing = chosen.length > 1

  useEffect(() => {
    if (!comparing) return
    for (const { runId } of chosen) {
      if (runId !== active?.run_id && !loaded[runId]) {
        api.runData(runId).then((run) => setLoaded((prev) => ({ ...prev, [runId]: run })), () => {})
      }
    }
  }, [active?.run_id, chosen, comparing, loaded])

  const data = useMemo(() => (active ? { ...loaded, [active.run_id]: active } : loaded), [active, loaded])
  const runs = useMemo(() => withColors(chosen.map((r) => ({ runId: r.runId, runName: data[r.runId]?.run_name ?? r.runName }))), [chosen, data])

  return {
    comparing,
    runs,
    data,
    start: (runIds: string[]) => setChosen(runIds.map((runId) => ({ runId }))),
    add: (runId: string) => setChosen((prev) => [...prev, { runId }]),
    remove: (runId: string) => setChosen((prev) => {
      const next = prev.filter((r) => r.runId !== runId)
      return next.length > 1 ? next : []
    }),
    move: (runId: string, direction: -1 | 1) => setChosen((prev) => {
      const i = prev.findIndex((r) => r.runId === runId)
      const j = i + direction
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    }),
    patchResult: (runId: string, index: number, patch: Partial<ResultData>) => setLoaded((prev) => {
      const run = prev[runId]
      return run ? { ...prev, [runId]: { ...run, results: run.results.map((r, i) => (i === index ? { ...r, result: { ...r.result, ...patch } } : r)) } } : prev
    }),
  }
}
