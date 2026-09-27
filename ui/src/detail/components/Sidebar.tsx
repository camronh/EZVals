import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RunResultRow, Score } from '../../types'
import { AnnotationEditor, EditActions, inputClass } from '../../components/AnnotationEditor'
import { extractToolNamesFromMessages, DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { ScoreCard } from '../../components/ScoreCard'
import { getRawText } from '../../lib/format'

const label = 'text-[12px] font-medium text-theme-text-muted'
const sectionHeader = 'flex h-10 w-full items-center justify-between px-4 text-left'
const chip = 'rounded-md bg-theme-bg-elevated px-1.5 py-0.5 text-[11px] text-theme-text-secondary'

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
    <div className="border-b border-theme-border">
      <button className={`${sectionHeader} group`} onClick={() => setOpen(!open)}>
        <span className={`${label} group-hover:text-theme-text-secondary`}>{title}</span>
        <span className={`collapse-icon text-theme-text-muted ${open ? 'open' : ''}`}><Icon name="chevron-down" className="h-3 w-3" /></span>
      </button>
      <div className={`collapsible-content ${open ? 'open' : ''}`}><div><div className="max-h-48 overflow-auto px-4 pb-3">{children}</div></div></div>
    </div>
  )
}

function DrawerButton({ title, count, onClick }: { title: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${sectionHeader} border-b border-theme-border text-[13px] text-theme-text-secondary hover:bg-theme-bg-elevated hover:text-theme-text`}>
      {title}
      <span className="flex items-center gap-2 text-theme-text-muted">
        <span className="font-mono text-[12px] tabular-nums">{count}</span>
        <Icon name="chevron-right" className="h-3 w-3" />
      </span>
    </button>
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
    <div className="score-editor rounded-md border border-theme-border bg-theme-bg p-2.5" onKeyDown={cancelOnEscape(onCancel)}>
      <div className="mb-2 text-[13px] font-medium text-theme-text">{score.key}</div>
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
        {error ? <div className="text-[12px] text-accent-error">{error}</div> : null}
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
  onEditingChange: (editing: boolean) => void
}

export function Sidebar({ row, runId, onSaveAnnotation, onSaveScores, onOpenMessages, onEditingChange }: Props) {
  const r = row.result
  const [editing, setEditing] = useState<'annotation' | number | null>(null)
  useEffect(() => onEditingChange(editing !== null), [editing, onEditingChange])
  const messages = Array.isArray(r.trace_data?.messages) ? r.trace_data.messages : []
  const tools = extractToolNamesFromMessages(messages)
  const scores = r.scores ?? []
  const { messages: _m, trace_url: traceUrl, ...extraTrace } = r.trace_data ?? {}
  const metadata = Object.entries(r.metadata ?? {})

  return (
    <div id="sidebar-panel" className="flex min-h-0 flex-col overflow-auto bg-theme-bg-secondary">
      {scores.length ? (
        <div className="border-b border-theme-border">
          <div className={`${label} flex h-10 items-center px-4`}>Scores</div>
          <div className="space-y-1.5 px-3 pb-3">
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

      <div className="space-y-2.5 border-b border-theme-border px-4 py-3.5">
        <Row name="Status">
          <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-medium ${r.status === 'error' ? 'bg-accent-error-bg text-accent-error' : r.status === 'running' || r.status === 'pending' ? 'bg-theme-bg-elevated text-accent-warn' : 'bg-theme-bg-elevated text-theme-text-secondary'}`}>{r.status ?? 'completed'}</span>
        </Row>
        {r.latency != null ? <Row name="Latency"><span className="font-mono text-[12px] tabular-nums text-theme-text">{r.latency.toFixed(2)}s</span></Row> : null}
        {row.dataset ? (
          <Row name="Dataset">
            <a className="max-w-[70%] truncate text-right text-[13px] text-accent-link hover:text-accent-link-hover" title={`Open dashboard filtered to dataset: ${row.dataset}`} href={`/?run_id=${encodeURIComponent(runId)}&dataset_in=${encodeURIComponent(row.dataset)}`}>
              {row.dataset}
            </a>
          </Row>
        ) : null}
        {row.labels?.length ? <Row name="Labels"><div className="flex max-w-[70%] flex-wrap justify-end gap-1">{row.labels.map((l) => <span key={l} className={`${chip} max-w-[140px] truncate`} title={l}>{l}</span>)}</div></Row> : null}
        {traceUrl ? (
          <Row name="Trace">
            <a href={traceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] text-accent-link hover:text-accent-link-hover">
              {String(traceUrl).replace(/^\w+:\/\/(www\.)?/, '').split('/')[0]}<Icon name="external" className="h-3 w-3" />
            </a>
          </Row>
        ) : null}
        {tools.length ? <Row name="Tools"><div id="tool-names" className="flex max-w-[70%] flex-wrap justify-end gap-1">{tools.map((t) => <span key={t} className={chip}>{t}</span>)}</div></Row> : null}
      </div>

      {messages.length ? <DrawerButton title="Messages" count={messages.length} onClick={onOpenMessages} /> : null}

      {metadata.length ? (
        <Collapsible title="Metadata" defaultOpen>
          <dl className="space-y-2.5">
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt className={label}>{formatMetadataLabel(key)}</dt>
                <dd className="mt-0.5">
                  {typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? (
                    <a href={value} target="_blank" rel="noreferrer" className="break-all text-[12px] text-accent-link hover:text-accent-link-hover">{value}</a>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-theme-text">{getRawText(value) || '—'}</pre>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      ) : null}

      {Object.keys(extraTrace).length ? <Collapsible title="Extra data" defaultOpen={false}><DataViewer content={extraTrace} placeholder="—" /></Collapsible> : null}

      <div className="flex-1">
        <div className="flex h-10 items-center justify-between px-4">
          <span className={label}>Annotation</span>
          {editing !== 'annotation' ? (
            <button className="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text" title="Edit annotation" onClick={() => setEditing('annotation')}>
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="px-4 pb-4">
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
            <div className="whitespace-pre-wrap text-[13px] text-theme-text-secondary">{r.annotation}</div>
          ) : (
            <button type="button" className="text-[13px] text-accent-link hover:text-accent-link-hover" onClick={() => setEditing('annotation')}>
              + Add annotation
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-t border-theme-border px-4 py-2 text-[11px] text-theme-text-muted">
        <span><kbd className="mr-1 rounded border border-theme-border bg-theme-bg px-1 font-mono">↑↓</kbd>nav</span>
        <span><kbd className="mr-1 rounded border border-theme-border bg-theme-bg px-1 font-mono">Esc</kbd>{editing !== null ? 'cancel' : 'back'}</span>
      </div>
    </div>
  )
}
