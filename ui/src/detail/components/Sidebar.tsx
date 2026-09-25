import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RunResultRow, Score } from '../../types'
import { AnnotationEditor, EditActions, inputClass } from '../../components/AnnotationEditor'
import { extractToolNamesFromMessages, DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { ScoreCard } from '../../components/ScoreCard'
import { getRawText } from '../../lib/format'

const label = 'text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400'
const sectionHeader = 'flex w-full items-center justify-between bg-zinc-100/50 px-3 py-2 text-left hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50'
const chip = 'rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'

function latencyColor(latency: number) {
  return latency <= 1 ? 'text-emerald-600 dark:text-emerald-400' : latency <= 5 ? 'text-zinc-600 dark:text-zinc-300' : 'text-rose-600 dark:text-rose-400'
}

function formatMetadataLabel(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className={label}>{name}</span>
      {children}
    </div>
  )
}

function Collapsible({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-blue-200/60 dark:border-zinc-800">
      <button className={sectionHeader} onClick={() => setOpen(!open)}>
        <span className={`${label}`}>{title}</span>
        <span className={`collapse-icon text-zinc-400 ${open ? 'open' : ''}`}><Icon name="chevron-down" /></span>
      </button>
      <div className={`collapsible-content ${open ? 'open' : ''}`}><div><div className="max-h-48 overflow-auto p-2">{children}</div></div></div>
    </div>
  )
}

function DrawerButton({ title, count, onClick }: { title: string; count: number; onClick: () => void }) {
  return (
    <div className="border-b border-blue-200/60 dark:border-zinc-800">
      <button onClick={onClick} className={sectionHeader}>
        <span className={`${label}`}>{title}</span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200">{count}</span>
          <Icon name="chevron-right" className="h-3.5 w-3.5 text-zinc-400" />
        </span>
      </button>
    </div>
  )
}

/** Parses a typed score value: blank is null, anything `Number` accepts (`.5`, `1e3`, `-2`) is a number, the rest stays text. */
export function parseScoreValue(text: string): number | string | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : t
}

/** Stops Escape from reaching the page (which would navigate back) and cancels the edit instead. */
function cancelOnEscape(onCancel: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  }
}

/**
 * Inline editor for one score. A score keeps its kind: pass/fail stays pass/fail, a value stays a value,
 * and a score with both a value and pass/fail edits both.
 */
export function ScoreEditor({ score, onSave, onCancel }: { score: Score; onSave: (score: Score) => Promise<void>; onCancel: () => void }) {
  const boolInValue = typeof score.value === 'boolean' && score.passed == null
  const hasPassed = boolInValue || score.passed != null
  const hasValue = !boolInValue && (score.value != null || score.passed == null)
  const [value, setValue] = useState(hasValue && score.value != null ? String(score.value) : '')
  const [passed, setPassed] = useState((boolInValue ? score.value : score.passed) === true)
  const [notes, setNotes] = useState(score.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const { value: _v, passed: _p, ...rest } = score
    const edited: Score = { ...rest, notes: notes.trim() || null }
    if (boolInValue) edited.value = passed
    else {
      if (hasValue) edited.value = parseScoreValue(value)
      if (hasPassed) edited.passed = passed
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(edited)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }
  return (
    <div className="score-editor rounded border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800/50" onKeyDown={cancelOnEscape(onCancel)}>
      <div className="mb-2 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">{score.key}</div>
      <div className="space-y-2">
        {hasValue ? (
          <input className={`${inputClass} font-mono`} aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (number or text)" disabled={saving} autoFocus />
        ) : null}
        {hasPassed ? (
          <select className={inputClass} aria-label="Passed" value={String(passed)} onChange={(e) => setPassed(e.target.value === 'true')} disabled={saving} autoFocus={!hasValue}>
            <option value="true">Passed: true</option>
            <option value="false">Passed: false</option>
          </select>
        ) : null}
        <textarea className={`${inputClass} min-h-[60px]`} aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." disabled={saving} />
        {error ? <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div> : null}
        <EditActions saving={saving} onSave={save} onCancel={onCancel} />
      </div>
    </div>
  )
}

type Props = {
  row: RunResultRow
  runId: string
  onSaveAnnotation: (annotation: string | null) => Promise<void>
  onSaveScores: (scores: Score[]) => Promise<void>
  onOpenMessages: () => void
  onOpenTrace: () => void
  onEditingChange: (editing: boolean) => void
}

export function Sidebar({ row, runId, onSaveAnnotation, onSaveScores, onOpenMessages, onOpenTrace, onEditingChange }: Props) {
  const r = row.result
  const [editing, setEditing] = useState<'annotation' | number | null>(null)
  useEffect(() => onEditingChange(editing !== null), [editing, onEditingChange])
  const messages = Array.isArray(r.trace_data?.messages) ? r.trace_data.messages : []
  const tools = extractToolNamesFromMessages(messages)
  const scores = r.scores ?? []
  const { messages: _m, trace_url: traceUrl, ...extraTrace } = r.trace_data ?? {}
  const metadata = Object.entries(r.metadata ?? {})

  return (
    <div id="sidebar-panel" className="flex min-h-0 flex-col overflow-auto bg-zinc-50 dark:bg-zinc-900/50">
      <div className="space-y-2 border-b border-blue-200/60 p-3 dark:border-zinc-800">
        <Row name="Status"><span className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium dark:border-zinc-700">{r.status ?? 'completed'}</span></Row>
        {r.latency != null ? <Row name="Latency"><span className={`font-mono text-xs ${latencyColor(r.latency)}`}>{r.latency.toFixed(2)}s</span></Row> : null}
        {row.dataset ? (
          <Row name="Dataset">
            <a className="max-w-[70%] truncate text-right text-xs text-zinc-600 underline underline-offset-2 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400" title={`Open dashboard filtered to dataset: ${row.dataset}`} href={`/?run_id=${encodeURIComponent(runId)}&dataset_in=${encodeURIComponent(row.dataset)}`}>
              {row.dataset}
            </a>
          </Row>
        ) : null}
        {row.labels?.length ? <Row name="Labels"><div className="flex max-w-[70%] flex-wrap justify-end gap-1">{row.labels.map((l) => <span key={l} className={`${chip} max-w-[140px] truncate`} title={l}>{l}</span>)}</div></Row> : null}
        {traceUrl ? (
          <Row name="Trace">
            <a href={traceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-400">
              <Icon name="external" className="h-2.5 w-2.5" /> View Trace
            </a>
          </Row>
        ) : null}
        {tools.length ? <Row name="Tools"><div id="tool-names" className="flex max-w-[70%] flex-wrap justify-end gap-1">{tools.map((t) => <span key={t} className={chip}>{t}</span>)}</div></Row> : null}
      </div>

      {messages.length ? <DrawerButton title="Messages" count={messages.length} onClick={onOpenMessages} /> : null}
      {row.spans?.length ? <DrawerButton title="Spans" count={row.spans.length} onClick={onOpenTrace} /> : null}

      {scores.length ? (
        <div className="border-b border-blue-200/60 dark:border-zinc-800">
          <div className={`${label} bg-zinc-100/50 px-3 py-2 dark:bg-zinc-800/30`}>Scores</div>
          <div className="space-y-1.5 p-2">
            {scores.map((score, i) => editing === i ? (
              <ScoreEditor
                key={`${score.key}-${i}`}
                score={score}
                onCancel={() => setEditing(null)}
                onSave={async (edited) => {
                  await onSaveScores(scores.map((s, j) => (j === i ? edited : s)))
                  setEditing(null)
                }}
              />
            ) : <ScoreCard key={`${score.key}-${i}`} score={score} onEdit={() => setEditing(i)} />)}
          </div>
        </div>
      ) : null}

      {metadata.length ? (
        <Collapsible title="Metadata" defaultOpen>
          <dl className="space-y-2">
            {metadata.map(([key, value]) => (
              <div key={key} className="rounded border border-zinc-200 bg-white/70 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60">
                <dt className={`${label}`}>{formatMetadataLabel(key)}</dt>
                <dd className="mt-1">
                  {typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? (
                    <a href={value} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400">{value}</a>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-700 dark:text-zinc-200">{getRawText(value) || '—'}</pre>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      ) : null}

      {Object.keys(extraTrace).length ? <Collapsible title="Trace Data" defaultOpen={false}><DataViewer content={extraTrace} placeholder="—" /></Collapsible> : null}

      <div className="flex-1">
        <div className="flex items-center justify-between bg-zinc-100/50 px-3 py-2 dark:bg-zinc-800/30">
          <span className={`${label}`}>Annotation</span>
          {editing !== 'annotation' ? (
            <button className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-300" title="Edit annotation" onClick={() => setEditing('annotation')}>
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="p-3">
          {editing === 'annotation' ? (
            <div onKeyDown={cancelOnEscape(() => setEditing(null))}>
              <AnnotationEditor
                initial={r.annotation ?? ''}
                onCancel={() => setEditing(null)}
                onSave={async (annotation) => {
                  await onSaveAnnotation(annotation)
                  setEditing(null)
                }}
              />
            </div>
          ) : r.annotation ? (
            <div className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">{r.annotation}</div>
          ) : (
            <button type="button" className="text-xs text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300" onClick={() => setEditing('annotation')}>
              + Add annotation
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-t border-blue-200/60 bg-zinc-100/30 px-3 py-2 text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 dark:bg-zinc-800/20">
        <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">↑↓</kbd> nav</span>
        <span><kbd className="rounded border border-zinc-300 bg-white px-1 font-mono dark:border-zinc-600 dark:bg-zinc-800">Esc</kbd> {editing !== null ? 'cancel' : 'back'}</span>
      </div>
    </div>
  )
}
