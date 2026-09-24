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
  if (!rows.length) return <div className="p-3 text-xs italic text-zinc-400">No spans recorded</div>

  const start = Math.min(...spans.map((s) => s.start))
  const total = Math.max(1, Math.max(...spans.map((s) => s.end)) - start)
  const tokens = spans.reduce((sum, s) => {
    const { input, output } = llmInfo(s)
    return { input: sum.input + input, output: sum.output + output }
  }, { input: 0, output: 0 })
  const selected = spans.find((s) => s.span_id === selectedId)

  return (
    <div className="trace-waterfall text-xs">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800">
        <span>{spans.length} spans</span>
        <span>{formatDuration(total / 1e6)}</span>
        {tokens.input + tokens.output > 0 ? <span>{tokens.input.toLocaleString()} in · {tokens.output.toLocaleString()} out tokens</span> : null}
      </div>
      <div role="tree">
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
              className={`grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)_3.5rem] items-center gap-3 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${span.span_id === selectedId ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
              onClick={() => setSelectedId(span.span_id === selectedId ? null : span.span_id)}
            >
              <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
                <span className={`truncate font-mono ${failed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-200'}`}>{span.name}</span>
                {model ? <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-600 dark:text-violet-300">{model}</span> : null}
                {input + output > 0 ? <span className="shrink-0 text-[10px] text-zinc-400">{input}→{output}</span> : null}
              </span>
              <span className="relative h-4">
                <span
                  className={`absolute top-1 h-2 rounded-sm ${failed ? 'bg-rose-500' : model ? 'bg-violet-500' : 'bg-blue-500'}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </span>
              <span className="text-right font-mono text-[10px] text-zinc-400">{formatDuration((span.end - span.start) / 1e6)}</span>
            </button>
          )
        })}
      </div>
      {selected ? (
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">{selected.name}</span>
            {selected.status === 'error' ? <span className="text-rose-500">{selected.status_message || 'error'}</span> : null}
          </div>
          <DataViewer content={selected.attributes ?? {}} placeholder="No attributes" />
        </div>
      ) : null}
    </div>
  )
}
