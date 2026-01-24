import { useCallback, useEffect, useMemo, useState } from 'react'
import { getResultKey, normalizeComparisonRuns } from '../dashboard/utils.js'

const DETAIL_BODY_CLASS = 'min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100'
const COMPARISON_STORAGE_KEY = 'ezvals:comparisonRuns'

function useBodyClass(bodyClass, title) {
  useEffect(() => {
    if (title) document.title = title
    document.body.className = bodyClass
    return () => {
      document.body.className = ''
    }
  }, [bodyClass, title])
}

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function looksLikeMarkdown(text) {
  if (!text) return false
  return [/^#{1,6}\s+\S/m, /^\s*[-*+]\s+\S/m, /^\s*\d+\.\s+\S/m, /^>+\s+\S/m, /`{3,}[\s\S]*?`{3,}/m, /\[.+?\]\(.+?\)/m]
    .some((re) => re.test(text))
}

function buildRunCommand(path, name) {
  return path ? `ezvals run ${path}::${name}` : `ezvals run ${name || ''}`.trim()
}

function getLatencyColor(latency) {
  if (latency == null) return ''
  if (latency <= 1) return 'text-emerald-600 dark:text-emerald-400'
  if (latency <= 5) return 'text-blue-600 dark:text-blue-400'
  return 'text-amber-600 dark:text-amber-400'
}

function getRawText(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function buildViewer(content, placeholder = '—') {
  if (content == null || content === '') {
    return {
      raw: '',
      html: `<div class="data-surface text-xs text-zinc-400">${escapeHtml(placeholder)}</div>`,
    }
  }

  let rawText = getRawText(content)
  let mode = 'text'
  if (typeof content === 'object' && content !== null) {
    mode = 'json'
  } else if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(rawText)
      rawText = JSON.stringify(parsed, null, 2)
      mode = 'json'
    } catch {
      if (looksLikeMarkdown(rawText.trim())) mode = 'markdown'
    }
  }

  if (mode === 'markdown') {
    const marked = typeof window !== 'undefined' ? window.marked : null
    const purifier = typeof window !== 'undefined' ? window.DOMPurify : null
    let html = marked ? marked.parse(rawText) : `<pre class="data-pre">${escapeHtml(rawText)}</pre>`
    if (purifier) html = purifier.sanitize(html)
    return { raw: rawText, html: `<div class="data-surface markdown-body">${html}</div>` }
  }

  if (mode === 'json') {
    const hljs = typeof window !== 'undefined' ? window.hljs : null
    let highlighted = escapeHtml(rawText)
    if (hljs) {
      try {
        highlighted = hljs.highlight(rawText, { language: 'json' }).value
      } catch {
        highlighted = escapeHtml(rawText)
      }
    }
    return {
      raw: rawText,
      html: `<div class="data-surface"><pre class="data-pre"><code class="hljs language-json">${highlighted}</code></pre></div>`,
    }
  }

  return { raw: rawText, html: `<div class="data-surface"><pre class="data-pre">${escapeHtml(rawText)}</pre></div>` }
}

function CopyButton({ getText, className = '', title = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      const text = typeof getText === 'function' ? getText() : String(getText || '')
      if (!text) return
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore copy failures
    }
  }, [getText])

  return (
    <button className={className} onClick={handleCopy} title={title}>
      <svg className={`copy-icon h-3.5 w-3.5 ${copied ? 'hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      <svg className={`check-icon h-3.5 w-3.5 text-emerald-500 ${copied ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </button>
  )
}

function DataViewer({ content, placeholder }) {
  const { html, raw } = useMemo(() => buildViewer(content, placeholder), [content, placeholder])
  return (
    <div
      className="data-viewer"
      data-raw={raw}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function ScoreCard({ score }) {
  let cls = 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50'
  let textCls = 'text-zinc-700 dark:text-zinc-300'
  let valueCls = 'text-zinc-500'
  if (score.passed === true) {
    cls = 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
    textCls = 'text-emerald-700 dark:text-emerald-300'
    valueCls = 'text-emerald-600 dark:text-emerald-400'
  } else if (score.passed === false) {
    cls = 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
    textCls = 'text-rose-700 dark:text-rose-300'
    valueCls = 'text-rose-600 dark:text-rose-400'
  }

  return (
    <div className={`rounded border px-2.5 py-1.5 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs font-medium ${textCls}`}>{score.key}</span>
        <div className="flex items-center gap-1.5">
          {score.value != null ? <span className={`font-mono text-xs ${valueCls}`}>{score.value}</span> : null}
          {score.passed === true ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
            </span>
          ) : null}
          {score.passed === false ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </span>
          ) : null}
        </div>
      </div>
      {score.notes ? <div className={`mt-1 text-[11px] ${valueCls}`}>{score.notes}</div> : null}
    </div>
  )
}

function InlineScoreBadges({ scores, latency }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(scores || []).map((score, idx) => {
        let badgeClass = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300'
        if (score.passed === true) badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        else if (score.passed === false) badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        const val = score.value != null ? `:${typeof score.value === 'number' ? score.value.toFixed(2) : score.value}` : ''
        return (
          <span key={`${score.key}-${idx}`} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}>
            {score.key}{val}
          </span>
        )
      })}
      {latency != null ? (
        <span className={`font-mono text-[10px] ${getLatencyColor(latency) || 'text-zinc-500'}`}>
          {latency.toFixed(2)}s
        </span>
      ) : null}
    </div>
  )
}

function buildMessageItems(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return { raw: '', items: [] }
  const isKnownSchema = messages.every(
    (msg) => (msg.role || msg.type) && (msg.content !== undefined || msg.text !== undefined || msg.message !== undefined || msg.tool_calls),
  )

  if (!isKnownSchema) {
    return { raw: JSON.stringify(messages, null, 2), items: null }
  }

  const items = []
  for (const msg of messages) {
    const role = (msg.role || msg.type || 'unknown').toLowerCase()
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      const toolCallsContent = msg.tool_calls.map((tc) => {
        const fn = tc.function || tc
        const name = fn.name || tc.name || 'tool'
        let args = fn.arguments || tc.args || tc.input || {}
        let argsStr
        if (typeof args === 'string') {
          try {
            argsStr = JSON.stringify(JSON.parse(args), null, 2)
          } catch {
            argsStr = args
          }
        } else {
          argsStr = JSON.stringify(args, null, 2)
        }
        return `${name}(${argsStr})`
      }).join('\n\n')
      items.push({
        key: `tool-calls-${items.length}`,
        role: 'tool_calls',
        title: 'Tool Calls',
        content: toolCallsContent,
      })
      continue
    }

    if (role === 'tool' || role === 'tool_result' || role === 'function') {
      let toolName = msg.name
      if (!toolName && msg.tool_call_id) {
        for (const m of messages) {
          if (!m.tool_calls) continue
          const found = m.tool_calls.find((t) => t.id === msg.tool_call_id)
          if (found) {
            toolName = found.function?.name || found.name
            break
          }
        }
      }
      toolName = toolName || 'tool'
      let content = msg.content || msg.text || msg.message || ''
      if (typeof content === 'object' && content !== null) {
        content = JSON.stringify(content, null, 2)
      } else if (typeof content === 'string') {
        try {
          content = JSON.stringify(JSON.parse(content), null, 2)
        } catch {
          try {
            const jsonified = content
              .replace(/'/g, '"')
              .replace(/True/g, 'true')
              .replace(/False/g, 'false')
              .replace(/None/g, 'null')
              .replace(/datetime\.date\([^)]+\)/g, '"[date]"')
              .replace(/datetime\.datetime\([^)]+\)/g, '"[datetime]"')
            content = JSON.stringify(JSON.parse(jsonified), null, 2)
          } catch {
            // keep original
          }
        }
      }
      items.push({
        key: `tool-result-${items.length}`,
        role: 'tool_result',
        title: `${toolName} Result`,
        content: String(content),
      })
      continue
    }

    let content = msg.content || msg.text || msg.message || ''
    if (Array.isArray(content)) {
      content = content.map((c) => (typeof c === 'string' ? c : (c.text || c.content || JSON.stringify(c)))).join('\n')
    }
    if (typeof content === 'object' && content !== null) {
      content = JSON.stringify(content, null, 2)
    }

    const normalizedRole = role === 'human' ? 'user' : role === 'ai' ? 'assistant' : role
    const displayRole = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)
    items.push({
      key: `msg-${items.length}`,
      role: normalizedRole,
      title: displayRole,
      content: String(content),
    })
  }

  return { raw: JSON.stringify(messages, null, 2), items }
}

export default function DetailPage() {
  useBodyClass(DETAIL_BODY_CLASS, 'Result Detail - EZVals')

  const [{ runId, index }] = useState(() => {
    const match = window.location.pathname.match(/\/runs\/([^/]+)\/results\/(\d+)/)
    return {
      runId: match ? match[1] : 'latest',
      index: match ? parseInt(match[2], 10) : 0,
    }
  })

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRerunning, setIsRerunning] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({ metadata: false, trace: false })
  const [comparison, setComparison] = useState(null)

  const comparisonRuns = useMemo(() => {
    try {
      const saved = sessionStorage.getItem(COMPARISON_STORAGE_KEY)
      if (!saved) return []
      return normalizeComparisonRuns(JSON.parse(saved) || [])
    } catch {
      return []
    }
  }, [])

  const isComparisonMode = comparisonRuns.length > 1

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${index}`)
      if (!resp.ok) throw new Error('Failed to load result')
      const payload = await resp.json()
      setData(payload)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [index, runId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    if (!data || !isComparisonMode) {
      setComparison(null)
      return
    }

    let active = true

    async function loadComparison() {
      const baseResult = data.result
      const key = baseResult ? getResultKey(baseResult) : ''
      const runs = await Promise.all(comparisonRuns.map(async (run) => {
        if (run.runId === data.run_id) {
          return {
            runId: run.runId,
            runName: data.run_name || run.runId,
            color: run.color,
            evalPath: data.eval_path,
            result: baseResult,
            resultIndex: data.index,
          }
        }
        try {
          const resp = await fetch(`/api/runs/${encodeURIComponent(run.runId)}/data`)
          if (!resp.ok) throw new Error('Failed')
          const runData = await resp.json()
          let match = null
          let matchIndex = null
          if (key && runData?.results) {
            const idx = runData.results.findIndex((r) => getResultKey(r) === key)
            if (idx >= 0) {
              match = runData.results[idx]
              matchIndex = idx
            }
          }
          return {
            runId: run.runId,
            runName: runData?.run_name || run.runName || run.runId,
            color: run.color,
            evalPath: runData?.eval_path,
            result: match,
            resultIndex: matchIndex,
          }
        } catch {
          return {
            runId: run.runId,
            runName: run.runName || run.runId,
            color: run.color,
            evalPath: null,
            result: null,
            resultIndex: null,
          }
        }
      }))

      if (!active) return
      setComparison({ baseResult: baseResult || runs.find((r) => r.result)?.result || null, runs })
    }

    loadComparison()
    return () => { active = false }
  }, [comparisonRuns, data, isComparisonMode])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        window.location.href = '/'
      } else if (event.key === 'ArrowUp') {
        if (data && data.index > 0) window.location.href = `/runs/${runId}/results/${data.index - 1}`
      } else if (event.key === 'ArrowDown') {
        if (data && data.index < data.total - 1) window.location.href = `/runs/${runId}/results/${data.index + 1}`
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [data, runId])

  const handleRerun = useCallback(async () => {
    if (!data || isRerunning) return
    setIsRerunning(true)
    try {
      const resp = await fetch('/api/runs/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices: [data.index] }),
      })
      if (resp.ok) {
        const poll = async () => {
          const r = await fetch(`/api/runs/${encodeURIComponent(runId)}/results/${data.index}`)
          if (r.ok) {
            const next = await r.json()
            const status = next.result?.result?.status
            if (status === 'completed' || status === 'error') {
              setData(next)
              setIsRerunning(false)
              return
            }
          }
          setTimeout(poll, 500)
        }
        setTimeout(poll, 500)
      } else {
        setIsRerunning(false)
      }
    } catch {
      setIsRerunning(false)
    }
  }, [data, isRerunning, runId])

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
        <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
        <div className="p-4 text-zinc-400">Failed to load result.</div>
      </div>
    )
  }

  const resultEntry = data.result
  const result = resultEntry?.result || {}
  const status = result.status || 'completed'
  const hasReference = result.reference != null && result.reference !== '—'
  const hasMetadata = result.metadata != null && result.metadata !== '—'
  const traceData = result.trace_data || null
  const hasMessages = !!(traceData?.messages?.length)
  const hasScores = Array.isArray(result.scores) && result.scores.length > 0
  const hasError = !!result.error
  const filteredTrace = traceData
    ? Object.fromEntries(Object.entries(traceData).filter(([k]) => k !== 'messages' && k !== 'trace_url'))
    : null
  const messagesPayload = hasMessages ? traceData.messages : null
  const messageData = buildMessageItems(messagesPayload || [])
  const runCommand = buildRunCommand(data.eval_path, resultEntry?.function)

  const baseForCompare = comparison?.baseResult || resultEntry

  return (
    <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
      <div id="app" className="flex flex-col h-screen">
        <header className="flex-shrink-0 flex items-center justify-between gap-4 border-b border-blue-200/60 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:text-blue-400"
              title="Back (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </a>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">{resultEntry?.function}</span>
              <CopyButton
                getText={() => runCommand}
                className="copy-btn flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                title="Copy run command"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="rerun-btn"
              className="flex h-7 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 disabled:opacity-60"
              title="Rerun this evaluation"
              onClick={handleRerun}
              disabled={isRerunning}
            >
              {isRerunning ? (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
              )}
              {isRerunning ? 'Running...' : 'Rerun'}
            </button>
            <span className="text-xs text-zinc-500">{data.index + 1}/{data.total}</span>
            <button
              id="prev-btn"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-blue-500"
              title="Up"
              disabled={data.index <= 0}
              onClick={() => window.location.href = `/runs/${runId}/results/${data.index - 1}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
            <button
              id="next-btn"
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-blue-500"
              title="Down"
              disabled={data.index >= data.total - 1}
              onClick={() => window.location.href = `/runs/${runId}/results/${data.index + 1}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        </header>

        {hasError ? (
          <div className="flex-shrink-0 bg-rose-50 border-b border-rose-200 px-4 py-2 dark:bg-rose-500/10 dark:border-rose-500/30">
            <div className="flex items-start gap-2 text-sm">
              <svg className="mt-0.5 shrink-0 text-rose-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <pre id="data-error" className="flex-1 text-rose-600 dark:text-rose-300 whitespace-pre-wrap font-mono text-xs">{result.error}</pre>
              <CopyButton
                getText={() => result.error || ''}
                className="copy-btn shrink-0 text-rose-400 hover:text-rose-600"
                title="Copy"
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div id="main-panel" className="flex flex-col min-w-0 flex-1">
            {isComparisonMode && comparison ? (
              <div className="flex flex-col min-h-0">
                <div className="border-b border-blue-200/60 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{baseForCompare?.function}</span>
                    {baseForCompare?.dataset ? (
                      <span className="text-xs text-zinc-500">{baseForCompare.dataset}</span>
                    ) : null}
                    {(baseForCompare?.labels || []).map((label) => (
                      <span key={label} className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{label}</span>
                    ))}
                  </div>
                </div>
                <div className="flex min-h-0 border-b border-blue-100 dark:border-zinc-800">
                  <div className="flex-1 min-w-0 border-r border-blue-100 dark:border-zinc-800">
                    <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-blue-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Input</span>
                      <CopyButton
                        getText={() => getRawText(baseForCompare?.result?.input)}
                        className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 bg-white dark:bg-zinc-900/30">
                      <DataViewer content={baseForCompare?.result?.input} placeholder="—" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="data-panel-header flex items-center justify-between border-b border-amber-200/40 bg-amber-50/50 px-3 py-1.5 dark:border-amber-500/10 dark:bg-amber-500/5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reference</span>
                      <CopyButton
                        getText={() => getRawText(baseForCompare?.result?.reference)}
                        className="copy-btn text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 bg-amber-50/30 dark:bg-amber-500/5">
                      <DataViewer content={baseForCompare?.result?.reference} placeholder="—" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 grid grid-cols-1 gap-3 p-4 overflow-auto">
                  {comparison.runs.map((run) => {
                    const runResult = run.result?.result || {}
                    return (
                      <div key={run.runId} className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
                        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: run.color }}></span>
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{run.runName}</span>
                          </div>
                          <span className="text-[10px] text-zinc-400">{runResult.status || '—'}</span>
                        </div>
                        <div className="p-3 space-y-2">
                          <DataViewer content={runResult.output} placeholder="—" />
                          {runResult.error ? (
                            <div className="text-[11px] text-rose-500">Error: {runResult.error}</div>
                          ) : null}
                          <InlineScoreBadges scores={runResult.scores || []} latency={runResult.latency} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div id="io-row" className="flex min-h-0" style={{ flex: '1 1 auto' }}>
                  <div id="input-panel" className="flex flex-col min-w-0" style={{ width: '50%' }}>
                    <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-blue-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Input</span>
                      <CopyButton
                        getText={() => getRawText(result.input)}
                        className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 bg-white dark:bg-zinc-900/30">
                      <DataViewer content={result.input} placeholder="—" />
                    </div>
                  </div>

                  <div id="output-panel" className="flex flex-col min-w-0" style={{ flex: '1 1 auto' }}>
                    <div className="data-panel-header flex items-center justify-between border-b border-blue-100 bg-emerald-50/50 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Output</span>
                      <CopyButton
                        getText={() => getRawText(result.output)}
                        className="copy-btn text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 bg-white dark:bg-zinc-900/30">
                      <DataViewer content={result.output} placeholder="—" />
                    </div>
                  </div>
                </div>

                {hasReference ? (
                  <div id="ref-panel" className="flex flex-col flex-shrink-0" style={{ height: '150px', minHeight: '60px' }}>
                    <div className="data-panel-header flex items-center justify-between border-b border-amber-200/40 bg-amber-50/50 px-3 py-1.5 dark:border-amber-500/10 dark:bg-amber-500/5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reference</span>
                      <CopyButton
                        getText={() => getRawText(result.reference)}
                        className="copy-btn text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                        title="Copy"
                      />
                    </div>
                    <div className="data-panel-body p-3 overflow-auto bg-amber-50/30 dark:bg-amber-500/5">
                      <DataViewer content={result.reference} placeholder="—" />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div id="sidebar-panel" className="flex flex-col min-h-0 overflow-auto bg-zinc-50 dark:bg-zinc-900/50" style={{ width: '320px', minWidth: '200px' }}>
            <div className="border-b border-blue-200/60 dark:border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-zinc-200 dark:border-zinc-700">{status}</span>
              </div>
              {result.latency != null ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Latency</span>
                  <span className={`font-mono text-xs ${getLatencyColor(result.latency)}`}>{result.latency.toFixed(2)}s</span>
                </div>
              ) : null}
              {resultEntry?.dataset ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Dataset</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{resultEntry.dataset}</span>
                </div>
              ) : null}
              {resultEntry?.labels?.length ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Labels</span>
                  <div className="flex gap-1">
                    {resultEntry.labels.map((label) => (
                      <span key={label} className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{label}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {traceData?.trace_url ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Trace</span>
                  <a
                    href={traceData.trace_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                    View Trace
                  </a>
                </div>
              ) : null}
            </div>

            {hasMessages ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  onClick={() => setMessagesOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 text-left"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Messages</span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200">{traceData.messages.length}</span>
                    <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </span>
                </button>
              </div>
            ) : null}

            {hasScores ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100/50 dark:bg-zinc-800/30">Scores</div>
                <div className="p-2 space-y-1.5">
                  {result.scores.map((score, idx) => (
                    <ScoreCard key={`${score.key}-${idx}`} score={score} />
                  ))}
                </div>
              </div>
            ) : null}

            {hasMetadata ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50"
                  onClick={() => setCollapsed((prev) => ({ ...prev, metadata: !prev.metadata }))}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Metadata</span>
                  <svg className={`collapse-icon h-3.5 w-3.5 text-zinc-400 ${collapsed.metadata ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className={`collapsible-content ${collapsed.metadata ? '' : 'open'}`}>
                  <div>
                    <div className="p-2 max-h-40 overflow-auto">
                      <DataViewer content={result.metadata} placeholder="—" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {filteredTrace && Object.keys(filteredTrace).length > 0 ? (
              <div className="border-b border-blue-200/60 dark:border-zinc-800">
                <button
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50"
                  onClick={() => setCollapsed((prev) => ({ ...prev, trace: !prev.trace }))}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Trace Data</span>
                  <svg className={`collapse-icon h-3.5 w-3.5 text-zinc-400 ${collapsed.trace ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className={`collapsible-content ${collapsed.trace ? '' : 'open'}`}>
                  <div>
                    <div className="p-2 max-h-48 overflow-auto">
                      <DataViewer content={filteredTrace} placeholder="—" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100/50 dark:bg-zinc-800/30">Annotation</div>
              <div className="p-3">
                {result.annotation ? (
                  <div className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">{result.annotation}</div>
                ) : (
                  <div className="text-xs italic text-zinc-400 dark:text-zinc-500">No annotation</div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-3 py-2 border-t border-blue-200/60 bg-zinc-100/30 dark:border-zinc-800 dark:bg-zinc-800/20">
              <div className="flex items-center gap-4 text-[10px] text-zinc-400">
                <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">↑↓</kbd> nav</span>
                <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">Esc</kbd> back</span>
              </div>
            </div>
          </div>
        </div>

        {hasMessages ? (
          <div
            id="messages-pane"
            className={`fixed top-0 right-0 bottom-0 z-50 border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 dark:border-zinc-700 dark:bg-zinc-900 ${messagesOpen ? '' : 'translate-x-full'}`}
            style={{ width: '700px' }}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Messages <span className="text-zinc-400">({traceData.messages.length})</span></span>
              <button
                onClick={() => setMessagesOpen(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="h-[calc(100%-41px)] overflow-auto">
              <div className="space-y-1 p-2">
                {messageData.items ? (
                  messageData.items.map((item) => (
                    <div key={item.key} className={`msg-box msg-${item.role}`}>
                      <div className="msg-box-header">{item.title}</div>
                      <div className="msg-box-content">{item.content}</div>
                    </div>
                  ))
                ) : (
                  <pre className="data-pre text-zinc-300 text-xs p-2">{messageData.raw}</pre>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
