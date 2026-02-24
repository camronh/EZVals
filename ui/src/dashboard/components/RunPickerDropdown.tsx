import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRun } from '../../types'
import { formatRunTimestamp } from '../utils'

type RunPickerDropdownProps = {
  anchorRef: RefObject<HTMLElement>
  open: boolean
  onClose: () => void
  sessionRuns: SessionRun[]
  activeRunId: string | undefined
  onSelectRun: (runId: string) => void
  onRenameRun: (runId: string, newName: string) => void
}

export default function RunPickerDropdown({
  anchorRef,
  open,
  onClose,
  sessionRuns,
  activeRunId,
  onSelectRun,
  onRenameRun,
}: RunPickerDropdownProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [editingRunId, setEditingRunId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!open || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 100,
    })
    const activeIdx = sessionRuns.findIndex((r) => r.run_id === activeRunId)
    setFocusedIndex(activeIdx >= 0 ? activeIdx : 0)
  }, [open, anchorRef, sessionRuns, activeRunId])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target as Node)) return
      if (anchorRef?.current?.contains(event.target as Node)) return
      onClose()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open, anchorRef, onClose])

  useEffect(() => {
    if (!open) {
      setEditingRunId(null)
      setEditDraft('')
    }
  }, [open])

  useEffect(() => {
    if (editingRunId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingRunId])

  useEffect(() => {
    if (focusedIndex >= 0 && rowRefs.current[focusedIndex]) {
      rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingRunId) return // Let input handle keys when editing

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => Math.min(prev + 1, sessionRuns.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < sessionRuns.length) {
          const run = sessionRuns[focusedIndex]
          onSelectRun(run.run_id)
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'c':
        if (e.metaKey && focusedIndex >= 0 && focusedIndex < sessionRuns.length) {
          e.preventDefault()
          handleCopy(sessionRuns[focusedIndex])
        }
        break
    }
  }, [editingRunId, focusedIndex, sessionRuns, onSelectRun, onClose])

  const handleCopy = useCallback(async (run: SessionRun) => {
    const text = run.run_name || run.run_id
    try {
      await navigator.clipboard.writeText(text)
      setCopiedRunId(run.run_id)
      setTimeout(() => setCopiedRunId(null), 1200)
    } catch {
      // ignore
    }
  }, [])

  const handleEditSave = useCallback(() => {
    if (!editingRunId) return
    const trimmed = editDraft.trim()
    if (trimmed) {
      onRenameRun(editingRunId, trimmed)
    }
    setEditingRunId(null)
    setEditDraft('')
  }, [editingRunId, editDraft, onRenameRun])

  if (!open) return null

  return createPortal(
    <div
      ref={menuRef}
      className="run-picker"
      style={style ?? undefined}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="listbox"
      aria-label="Select a run"
    >
      {sessionRuns.map((run, index) => {
        const isSelected = run.run_id === activeRunId
        const isFocused = index === focusedIndex
        const isEditing = editingRunId === run.run_id
        const isCopied = copiedRunId === run.run_id

        return (
          <div
            key={run.run_id}
            ref={(el) => { rowRefs.current[index] = el }}
            className={`run-picker-row${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}`}
            role="option"
            aria-selected={isSelected}
            onClick={() => {
              if (!isEditing) {
                onSelectRun(run.run_id)
                onClose()
              }
            }}
            onMouseEnter={() => setFocusedIndex(index)}
          >
            <span className={`run-picker-dot${isSelected ? ' active' : ''}`} />

            <div className="run-picker-name-area">
              {isEditing ? (
                <div className="run-picker-edit-row">
                  <input
                    ref={editInputRef}
                    className="run-picker-edit-input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleEditSave() }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingRunId(null); setEditDraft('') }
                      e.stopPropagation()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={handleEditSave}
                  />
                  <span className="run-picker-key-hints">
                    <kbd>↵</kbd> <kbd>Esc</kbd>
                  </span>
                </div>
              ) : (
                <>
                  <span className="run-picker-run-name">{run.run_name || run.run_id}</span>
                  <span className="run-picker-timestamp">{formatRunTimestamp(run.timestamp)}</span>
                </>
              )}
            </div>

            {!isEditing ? (
              <div className="run-picker-actions">
                <button
                  className="run-picker-action-btn"
                  title="Rename"
                  onClick={(e) => { e.stopPropagation(); setEditingRunId(run.run_id); setEditDraft(run.run_name || run.run_id) }}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-pencil"></use>
                  </svg>
                </button>
                <button
                  className={`run-picker-action-btn${isCopied ? ' copied' : ''}`}
                  title="Copy name"
                  onClick={(e) => { e.stopPropagation(); handleCopy(run) }}
                >
                  {isCopied ? (
                    <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
