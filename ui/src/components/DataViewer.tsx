import { useEffect, useMemo, useState } from 'react'

type MessageItem = {
  key: string
  role: string
  title: string
  content: string
}

type MessageSchema = {
  role?: string
  type?: string
  speaker?: string
  name?: string
  tool_call_id?: string
  tool_use_id?: string
  content?: unknown
  text?: unknown
  message?: unknown
  tool_calls?: Array<{
    id?: string
    function?: { name?: string; arguments?: unknown }
    name?: string
    args?: unknown
    input?: unknown
  } | Record<string, unknown>>
}

type ToolCallInfo = {
  id?: string
  name: string
  args: unknown
}

type MessageViewMode = 'pretty' | 'raw'

type MarkedLike = { parse: (input: string) => string }
type DomPurifyLike = { sanitize: (input: string) => string }
type HljsLike = { highlight: (input: string, opts: { language: string }) => { value: string } }

function escapeHtml(str: unknown) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function looksLikeMarkdown(text: string) {
  if (!text) return false
  return [/^#{1,6}\s+\S/m, /^\s*[-*+]\s+\S/m, /^\s*\d+\.\s+\S/m, /^>+\s+\S/m, /`{3,}[\s\S]*?`{3,}/m, /\[.+?\]\(.+?\)/m]
    .some((re) => re.test(text))
}

export function getRawText(content: unknown) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function buildViewer(content: unknown, placeholder = '—') {
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
    const marked = typeof window !== 'undefined' ? (window as unknown as { marked?: MarkedLike }).marked : undefined
    const purifier = typeof window !== 'undefined' ? (window as unknown as { DOMPurify?: DomPurifyLike }).DOMPurify : undefined
    let html = marked ? marked.parse(rawText) : `<pre class="data-pre">${escapeHtml(rawText)}</pre>`
    if (purifier) html = purifier.sanitize(html)
    return { raw: rawText, html: `<div class="data-surface markdown-body">${html}</div>` }
  }

  if (mode === 'json') {
    const hljs = typeof window !== 'undefined' ? (window as unknown as { hljs?: HljsLike }).hljs : undefined
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMessageLike(value: unknown): value is MessageSchema {
  if (!isObjectRecord(value)) return false
  const role = value.role ?? value.type ?? value.speaker
  if (typeof role !== 'string' || !role.trim()) return false
  return value.content !== undefined || value.text !== undefined || value.message !== undefined || value.tool_calls !== undefined
}

function extractMessages(content: unknown): MessageSchema[] | null {
  if (typeof content === 'string') {
    try {
      return extractMessages(JSON.parse(content))
    } catch {
      return null
    }
  }

  if (Array.isArray(content)) {
    if (content.length === 0) return null
    return content.every(isMessageLike) ? content as MessageSchema[] : null
  }

  if (!isObjectRecord(content)) return null

  if (Array.isArray(content.messages)) {
    if (content.messages.length === 0) return null
    return content.messages.every(isMessageLike) ? content.messages as MessageSchema[] : null
  }

  return isMessageLike(content) ? [content as MessageSchema] : null
}

function extractToolCalls(msg: MessageSchema): ToolCallInfo[] {
  const rawCalls: unknown[] = []
  if (Array.isArray(msg.tool_calls)) rawCalls.push(...msg.tool_calls)

  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (!block || typeof block !== 'object') continue
      const typedBlock = block as Record<string, unknown>
      const type = String(typedBlock.type || '').toLowerCase()
      if (type === 'tool_use' || type === 'tool_call' || type === 'function_call') {
        rawCalls.push(typedBlock)
      }
    }
  }

  const calls: ToolCallInfo[] = []
  for (const call of rawCalls) {
    if (!call || typeof call !== 'object') continue
    const typed = call as Record<string, unknown>
    const fn = typed.function && typeof typed.function === 'object' ? typed.function as Record<string, unknown> : null
    const name = fn?.name || typed.name
    if (typeof name !== 'string' || !name) continue
    const id = fn?.id || typed.id || typed.call_id || typed.tool_call_id || typed.tool_use_id
    const args = fn?.arguments ?? typed.arguments ?? typed.args ?? typed.input ?? {}
    calls.push({ id: typeof id === 'string' ? id : undefined, name, args })
  }

  return calls
}

export function extractToolNamesFromMessages(messages: unknown) {
  const typedMessages = extractMessages(messages)
  if (!typedMessages) return []
  const names = new Set<string>()
  for (const msg of typedMessages) {
    for (const call of extractToolCalls(msg)) names.add(call.name)
  }
  return Array.from(names)
}

function buildMessageItems(messages: unknown) {
  const typedMessages = extractMessages(messages)
  if (!typedMessages) return null

  const items: MessageItem[] = []
  const toolCallsById = new Map<string, ToolCallInfo>()
  for (const msg of typedMessages) {
    for (const call of extractToolCalls(msg)) {
      if (call.id) toolCallsById.set(call.id, call)
    }
  }

  for (const msg of typedMessages) {
    const role = (msg.role || msg.type || msg.speaker || 'unknown').toLowerCase()
    const toolCalls = extractToolCalls(msg)
    if (toolCalls.length > 0) {
      const toolCallsContent = toolCalls.map((call) => {
        const args = call.args
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
        return `${call.name}(${argsStr})`
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
      const callRef = msg.tool_call_id || msg.tool_use_id
      if (!toolName && callRef) {
        toolName = toolCallsById.get(callRef)?.name
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
            const jsonified = String(content)
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
      content = content.map((c) => {
        if (typeof c === 'string') return c
        if (typeof c === 'object' && c !== null) {
          const typed = c as { text?: string; content?: string }
          return typed.text || typed.content || JSON.stringify(c)
        }
        return String(c)
      }).join('\n')
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

  return items
}

type DataViewerProps = {
  content: unknown
  placeholder?: string
  className?: string
}

export function DataViewer({ content, placeholder, className = '' }: DataViewerProps) {
  const { html, raw } = useMemo(() => buildViewer(content, placeholder), [content, placeholder])
  const messageItems = useMemo(() => buildMessageItems(content), [content])
  const [mode, setMode] = useState<MessageViewMode>('pretty')

  useEffect(() => {
    setMode('pretty')
  }, [content])

  if (messageItems && messageItems.length > 0) {
    const rawText = getRawText(content)
    const wrapperClass = `data-viewer message-viewer ${className}`.trim()
    return (
      <div className={wrapperClass} data-raw={rawText}>
        <div className="mb-2 flex items-center justify-end">
          <div className="inline-flex rounded border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/70">
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${mode === 'pretty' ? 'bg-white text-zinc-700 shadow dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              onClick={() => setMode('pretty')}
            >
              Pretty
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${mode === 'raw' ? 'bg-white text-zinc-700 shadow dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              onClick={() => setMode('raw')}
            >
              Raw
            </button>
          </div>
        </div>
        {mode === 'pretty' ? (
          <div className="space-y-1">
            {messageItems.map((item) => (
              <div key={item.key} className={`msg-box msg-${item.role}`}>
                <div className="msg-box-header">{item.title}</div>
                <div className="msg-box-content message-view-msg-content">{item.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="data-surface">
            <pre className="data-pre">{rawText}</pre>
          </div>
        )}
      </div>
    )
  }

  const wrapperClass = `data-viewer ${className}`.trim()
  return (
    <div
      className={wrapperClass}
      data-raw={raw}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
