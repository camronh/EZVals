import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SessionRun } from '../../types'
import { FloatingMenu } from '../../components/FloatingMenu'
import { Icon } from '../../components/Icon'
import { formatRunTimestamp } from '../../lib/format'

type Props = {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  sessionRuns: SessionRun[]
  activeRunId: string
  onSelectRun: (runId: string) => void
  onRenameRun: (runId: string, name: string) => void
  onDeleteRun: (runId: string) => void
}

/** The session's runs, navigable with arrow keys: Enter opens a run, ⌘C copies its name. Mount it only while open. */
export function RunPicker({ anchorRef, onClose, sessionRuns, activeRunId, onSelectRun, onRenameRun, onDeleteRun }: Props) {
  const [focused, setFocused] = useState(() => Math.max(0, sessionRuns.findIndex((r) => r.run_id === activeRunId)))
  const [editing, setEditing] = useState<{ runId: string; draft: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const rows = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => { rows.current[focused]?.scrollIntoView({ block: 'nearest' }) }, [focused])

  const choose = (run: SessionRun) => {
    onSelectRun(run.run_id)
    onClose()
  }
  const copy = async (run: SessionRun) => {
    await navigator.clipboard.writeText(run.run_name || run.run_id)
    setCopied(run.run_id)
    setTimeout(() => setCopied(null), 1200)
  }
  const remove = (run: SessionRun) => {
    if (window.confirm(`Delete run "${run.run_name || run.run_id}"? This can't be undone.`)) onDeleteRun(run.run_id)
  }
  const saveRename = () => {
    if (editing?.draft.trim()) onRenameRun(editing.runId, editing.draft.trim())
    setEditing(null)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    const run = sessionRuns[focused]
    if (e.key === 'ArrowDown') setFocused(Math.min(focused + 1, sessionRuns.length - 1))
    else if (e.key === 'ArrowUp') setFocused(Math.max(focused - 1, 0))
    else if ((e.key === 'Enter' || e.key === ' ') && run) choose(run)
    else if (e.key === 'Escape') onClose()
    else if (e.key === 'c' && e.metaKey && run) copy(run)
    else return
    e.preventDefault()
  }

  return (
    <FloatingMenu anchorRef={anchorRef} open onClose={onClose} className="run-picker" onKeyDown={onKeyDown} tabIndex={-1} role="listbox" aria-label="Select a run">
      {sessionRuns.map((run, i) => {
        const selected = run.run_id === activeRunId
        const isEditing = editing?.runId === run.run_id
        return (
          <div
            key={run.run_id}
            ref={(el) => { rows.current[i] = el }}
            className={`run-picker-row${selected ? ' selected' : ''}${i === focused ? ' focused' : ''}`}
            role="option"
            aria-selected={selected}
            data-run-id={run.run_id}
            onClick={() => !isEditing && choose(run)}
            onMouseEnter={() => setFocused(i)}
          >
            <span className={`run-picker-dot${selected ? ' active' : ''}`} />
            <div className="run-picker-name-area">
              {isEditing ? (
                <div className="run-picker-edit-row">
                  <input
                    className="run-picker-edit-input"
                    value={editing.draft}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setEditing({ runId: run.run_id, draft: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') saveRename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={saveRename}
                  />
                  <span className="run-picker-key-hints"><kbd>↵</kbd> <kbd>Esc</kbd></span>
                </div>
              ) : (
                <>
                  <span className="run-picker-run-name">{run.run_name || run.run_id}</span>
                  <span className="run-picker-timestamp">{formatRunTimestamp(run.timestamp)}</span>
                </>
              )}
            </div>
            {isEditing ? null : (
              <div className="run-picker-actions">
                <button className="run-picker-action-btn" title="Rename" onClick={(e) => { e.stopPropagation(); setEditing({ runId: run.run_id, draft: run.run_name || run.run_id }) }}>
                  <Icon name="pencil" className="h-3 w-3" />
                </button>
                <button className={`run-picker-action-btn${copied === run.run_id ? ' copied' : ''}`} title="Copy name" onClick={(e) => { e.stopPropagation(); copy(run) }}>
                  {copied === run.run_id ? <Icon name="check" className="h-3 w-3 text-emerald-400" /> : <Icon name="copy" className="h-3 w-3" />}
                </button>
                <button
                  className="run-picker-action-btn run-picker-delete-btn hover:!text-rose-500 disabled:opacity-40"
                  title={selected ? 'Switch to another run to delete this one' : 'Delete run'}
                  aria-label="Delete run"
                  disabled={selected}
                  onClick={(e) => { e.stopPropagation(); remove(run) }}
                >
                  <Icon name="trash" className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </FloatingMenu>
  )
}
