import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RunResultRow, Score } from '../../types'
import { AnnotationEditor, EditActions } from '../../components/AnnotationEditor'
import { extractToolNamesFromMessages, DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { ScoreCard } from '../../components/ScoreCard'
import { getRawText } from '../../lib/format'

const sectionHeader = 'flex h-10 w-full items-center justify-between px-4 text-left'

function formatMetadataLabel(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="section-label">{name}</span>
      {children}
    </div>
  )
}

function Collapsible({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-line">
      <button className={`${sectionHeader} group hover:bg-surface-muted`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="section-label group-hover:text-fg">{title}</span>
        <span className={`collapse-icon text-fg-muted ${open ? 'open' : ''}`}><Icon name="chevron-down" className="h-3 w-3" /></span>
      </button>
      <div className={`collapsible-content ${open ? 'open' : ''}`}><div><div className="max-h-48 overflow-auto px-4 pb-3">{children}</div></div></div>
    </div>
  )
}

function DrawerButton({ title, count, onClick }: { title: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-haspopup="dialog" className={`${sectionHeader} border-b border-line text-sm text-fg-secondary hover:bg-surface-muted hover:text-fg`}>
      {title}
      <span className="flex items-center gap-2 text-fg-muted">
        <span className="text-xs tabular-nums">{count}</span>
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
    <div className="score-editor rounded-lg border border-line bg-surface p-3 shadow-sm" onKeyDown={cancelOnEscape(onCancel)}>
      <div className="mb-2 text-sm font-medium text-fg">{score.key}</div>
      <div className="space-y-2">
        {hasValue ? (
          <input className="input w-full font-mono" aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (number or text)" disabled={saving} autoFocus />
        ) : null}
        {hasPassed ? (
          <select className="input w-full" aria-label="Result" value={String(passed)} onChange={(e) => setPassed(e.target.value === 'true')} disabled={saving} autoFocus={!hasValue}>
            <option value="true">Passed</option>
            <option value="false">Failed</option>
          </select>
        ) : null}
        <textarea className="input min-h-[60px] w-full" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this score?" disabled={saving} />
        {error ? <div className="text-xs text-danger">{error}</div> : null}
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
  /** Shown in the dashboard's review panel, where Esc closes the panel. */
  inPanel?: boolean
}

export function Sidebar({ row, runId, onSaveAnnotation, onSaveScores, onOpenMessages, onEditingChange, inPanel }: Props) {
  const r = row.result
  const [editing, setEditing] = useState<'annotation' | number | null>(null)
  useEffect(() => onEditingChange(editing !== null), [editing, onEditingChange])
  const messages = Array.isArray(r.trace_data?.messages) ? r.trace_data.messages : []
  const tools = extractToolNamesFromMessages(messages)
  const scores = r.scores ?? []
  const { messages: _m, trace_url: traceUrl, ...extraTrace } = r.trace_data ?? {}
  const metadata = Object.entries(r.metadata ?? {})

  return (
    <div id="sidebar-panel" className="flex min-h-0 flex-1 flex-col overflow-auto bg-surface-subtle">
      {scores.length ? (
        <div className="border-b border-line">
          <h2 className="section-label flex h-10 items-center px-4">Scores</h2>
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

      <div className="space-y-2.5 border-b border-line px-4 py-3.5">
        {r.latency != null ? <Row name="Latency"><span className="text-sm tabular-nums text-fg">{r.latency.toFixed(2)}s</span></Row> : null}
        {row.dataset ? (
          <Row name="Dataset">
            <a className="link max-w-[70%] truncate text-right text-sm" title={`Open dashboard filtered to dataset: ${row.dataset}`} href={`/?run_id=${encodeURIComponent(runId)}&dataset_in=${encodeURIComponent(row.dataset)}`}>
              {row.dataset}
            </a>
          </Row>
        ) : null}
        {row.labels?.length ? <Row name="Labels"><div className="flex max-w-[70%] flex-wrap justify-end gap-1">{row.labels.map((l) => <span key={l} className="chip max-w-[140px] truncate" title={l}>{l}</span>)}</div></Row> : null}
        {traceUrl ? (
          <Row name="Trace">
            <a href={traceUrl} target="_blank" rel="noreferrer" className="link flex items-center gap-1 text-sm">
              {String(traceUrl).replace(/^\w+:\/\/(www\.)?/, '').split('/')[0]}<Icon name="external" className="h-3 w-3" />
            </a>
          </Row>
        ) : null}
        {tools.length ? <Row name="Tools"><div id="tool-names" className="flex max-w-[70%] flex-wrap justify-end gap-1">{tools.map((t) => <span key={t} className="chip font-mono">{t}</span>)}</div></Row> : null}
      </div>

      {messages.length ? <DrawerButton title="Messages" count={messages.length} onClick={onOpenMessages} /> : null}

      {metadata.length ? (
        <Collapsible title="Metadata" defaultOpen>
          <dl className="space-y-2.5">
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt className="section-label">{formatMetadataLabel(key)}</dt>
                <dd className="mt-0.5">
                  {typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? (
                    <a href={value} target="_blank" rel="noreferrer" className="link break-all text-xs">{value}</a>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-fg">{getRawText(value) || '—'}</pre>
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
          <h2 className="section-label">Annotation</h2>
          {editing !== 'annotation' ? (
            <button className="btn btn-ghost btn-xs btn-icon -mr-1" title="Edit annotation" aria-label="Edit annotation" onClick={() => setEditing('annotation')}>
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
            <div className="whitespace-pre-wrap text-sm text-fg-secondary">{r.annotation}</div>
          ) : (
            <button type="button" className="link text-sm" onClick={() => setEditing('annotation')}>
              Add annotation
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-t border-line px-4 py-2 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd>next result</span>
        <span className="flex items-center gap-1.5"><kbd className="kbd">Esc</kbd>{editing !== null ? 'cancel' : inPanel ? 'close' : 'back'}</span>
      </div>
    </div>
  )
}
