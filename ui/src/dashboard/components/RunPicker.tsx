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

/** The session's runs: arrow keys move between them, Enter opens one, ⌘C copies its name. Mount it only while open. */
export function RunPicker({ anchorRef, onClose, sessionRuns, activeRunId, onSelectRun, onRenameRun, onDeleteRun }: Props) {
  const [focused, setFocused] = useState(() => Math.max(0, sessionRuns.findIndex((r) => r.run_id === activeRunId)))
  const [editing, setEditing] = useState<{ runId: string; draft: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const rows = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!editing) rows.current[focused]?.focus()
  }, [focused, editing])

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
    if (e.key === 'ArrowDown') setFocused(Math.min(focused + 1, sessionRuns.length - 1))
    else if (e.key === 'ArrowUp') setFocused(Math.max(focused - 1, 0))
    else if (e.key === 'Escape') onClose()
    else if (e.key === 'c' && e.metaKey) copy(sessionRuns[focused])
    else return
    e.preventDefault()
  }

  return (
    <FloatingMenu anchorRef={anchorRef} open onClose={onClose} onKeyDown={onKeyDown} aria-label="Runs in this session">
      <ul>
        {sessionRuns.map((run, i) => {
          const selected = run.run_id === activeRunId
          const isEditing = editing?.runId === run.run_id
          return (
            <li
              key={run.run_id}
              className={`run-picker-row${selected ? ' selected' : ''}${i === focused ? ' focused' : ''}`}
              data-run-id={run.run_id}
              onMouseEnter={() => setFocused(i)}
            >
              {isEditing ? (
                <div className="run-picker-edit-row">
                  <input
                    className="input h-7 flex-1"
                    aria-label="Run name"
                    value={editing.draft}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setEditing({ runId: run.run_id, draft: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') saveRename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onBlur={saveRename}
                  />
                  <span className="run-picker-key-hints"><kbd className="kbd">↵</kbd><kbd className="kbd">Esc</kbd></span>
                </div>
              ) : (
                <>
                  <button
                    ref={(el) => { rows.current[i] = el }}
                    className="run-picker-name-area rounded-sm text-left"
                    tabIndex={i === focused ? 0 : -1}
                    aria-current={selected ? 'true' : undefined}
                    onFocus={() => setFocused(i)}
                    onClick={() => choose(run)}
                  >
                    <span className="run-picker-run-name">{run.run_name || run.run_id}</span>
                    <span className="run-picker-timestamp">{formatRunTimestamp(run.timestamp)}</span>
                  </button>
                  <div className="run-picker-actions">
                    <button className="run-picker-action-btn" title="Rename" aria-label="Rename run" onClick={() => setEditing({ runId: run.run_id, draft: run.run_name || run.run_id })}>
                      <Icon name="pencil" className="h-3 w-3" />
                    </button>
                    <button className={`run-picker-action-btn${copied === run.run_id ? ' copied' : ''}`} title="Copy name" aria-label={copied === run.run_id ? 'Copied' : 'Copy run name'} onClick={() => copy(run)}>
                      {copied === run.run_id ? <Icon name="check" className="h-3 w-3" /> : <Icon name="copy" className="h-3 w-3" />}
                    </button>
                    <button
                      className="run-picker-action-btn run-picker-delete-btn hover:!text-danger disabled:opacity-40"
                      title={selected ? 'Switch to another run to delete this one' : 'Delete run'}
                      aria-label="Delete run"
                      disabled={selected}
                      onClick={() => remove(run)}
                    >
                      <Icon name="trash" className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </FloatingMenu>
  )
}
