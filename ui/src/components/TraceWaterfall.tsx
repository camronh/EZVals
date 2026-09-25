import { useMemo, useState } from 'react'
import type { Span } from '../types'
import { formatDuration } from '../lib/format'
import { DataViewer } from './DataViewer'

type Row = { span: Span; depth: number }

/** Depth-first order: each span followed by its children, earliest first. */
function flatten(spans: Span[]): Row[] {
  const ids = new Set(spans.map((s) => s.span_id))
  const children = new Map<string, Span[]>()
  for (const span of spans) {
    const parent = span.parent_span_id && ids.has(span.parent_span_id) ? span.parent_span_id : ''
    children.set(parent, [...(children.get(parent) ?? []), span])
  }
  const rows: Row[] = []
  const visit = (parent: string, depth: number) => {
    for (const span of (children.get(parent) ?? []).sort((a, b) => a.start - b.start)) {
      rows.push({ span, depth })
      visit(span.span_id, depth + 1)
    }
  }
  visit('', 0)
  return rows
}

const number = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0)

/** GenAI semantic-convention details worth showing inline: the model and token counts. */
function llmInfo(span: Span) {
  const a = span.attributes ?? {}
  const model = (a['gen_ai.response.model'] ?? a['gen_ai.request.model']) as string | undefined
  const input = number(a['gen_ai.usage.input_tokens'] ?? a['gen_ai.usage.prompt_tokens'])
  const output = number(a['gen_ai.usage.output_tokens'] ?? a['gen_ai.usage.completion_tokens'])
  return { model, input, output }
}

export function TraceWaterfall({ spans }: { spans: Span[] }) {
  const rows = useMemo(() => flatten(spans), [spans])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!rows.length) return <div className="p-4 text-[13px] text-theme-text-muted">No spans recorded</div>

  const start = Math.min(...spans.map((s) => s.start))
  const total = Math.max(1, Math.max(...spans.map((s) => s.end)) - start)
  const tokens = spans.reduce((sum, s) => {
    const { input, output } = llmInfo(s)
    return { input: sum.input + input, output: sum.output + output }
  }, { input: 0, output: 0 })
  const selected = spans.find((s) => s.span_id === selectedId)

  return (
    <div className="trace-waterfall text-[12px]">
      <div className="flex items-center gap-4 border-b border-theme-border px-4 py-2.5 text-[12px] text-theme-text-muted">
        <span>{spans.length} spans</span>
        <span className="font-mono tabular-nums">{formatDuration(total / 1e6)}</span>
        {tokens.input + tokens.output > 0 ? <span><span className="font-mono tabular-nums">{tokens.input.toLocaleString()}</span> in · <span className="font-mono tabular-nums">{tokens.output.toLocaleString()}</span> out tokens</span> : null}
      </div>
      <div role="tree" className="py-1">
        {rows.map(({ span, depth }) => {
          const { model, input, output } = llmInfo(span)
          const failed = span.status === 'error'
          const left = ((span.start - start) / total) * 100
          const width = Math.max(0.5, ((span.end - span.start) / total) * 100)
          return (
            <button
              key={span.span_id}
              role="treeitem"
              aria-selected={span.span_id === selectedId}
              className={`grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)_3.5rem] items-center gap-3 px-4 py-1.5 text-left ${span.span_id === selectedId ? 'bg-blue-500/10' : 'hover:bg-theme-bg-elevated'}`}
              onClick={() => setSelectedId(span.span_id === selectedId ? null : span.span_id)}
            >
              <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
                <span className={`truncate font-mono ${failed ? 'text-accent-error' : 'text-theme-text'}`}>{span.name}</span>
                {model && !span.name.includes(model) ? <span className="shrink-0 rounded bg-theme-bg-elevated px-1 text-[11px] text-theme-text-secondary">{model}</span> : null}
                {input + output > 0 ? <span className="shrink-0 font-mono text-[11px] tabular-nums text-theme-text-muted">{input}→{output}</span> : null}
              </span>
              <span className="relative h-4">
                <span
                  className={`absolute top-1 h-2 rounded-sm ${failed ? 'bg-accent-error' : model ? 'bg-blue-500' : 'bg-blue-500/40'}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-theme-text-muted">{formatDuration((span.end - span.start) / 1e6)}</span>
            </button>
          )
        })}
      </div>
      {selected ? (
        <div className="border-t border-theme-border p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[13px] font-medium text-theme-text">{selected.name}</span>
            {selected.status === 'error' ? <span className="text-accent-error">{selected.status_message || 'error'}</span> : null}
          </div>
          <DataViewer content={selected.attributes ?? {}} placeholder="No attributes" />
        </div>
      ) : null}
    </div>
  )
}
