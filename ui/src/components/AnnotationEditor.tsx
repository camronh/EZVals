import { useState } from 'react'
import { button, primaryButton } from './Dropdown'
import { Spinner } from './Spinner'

export const inputClass = 'w-full rounded-md border border-theme-border bg-theme-bg px-2.5 py-1.5 text-[13px] text-theme-text placeholder:text-theme-text-muted focus:border-accent-link focus:outline-none disabled:opacity-60'

/** Save/Cancel buttons for inline edit forms; Save shows a spinner while `saving`. */
export function EditActions({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className={`${button} !h-7`}
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="button"
        data-annotation-save="true"
        className={`${primaryButton} !h-7 disabled:opacity-60`}
        onClick={onSave}
        disabled={saving}
      >
        {saving ? <Spinner /> : null}
        Save
      </button>
    </div>
  )
}

/** Edits an annotation; an empty annotation saves as null. Escape cancels. */
export function AnnotationEditor({ initial, onSave, onCancel, rows = 4 }: {
  initial: string
  onSave: (annotation: string | null) => Promise<void>
  onCancel: () => void
  rows?: number
}) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim() || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save annotation')
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2">
      <textarea
        data-annotation-editor="true"
        className={inputClass}
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Add annotation..."
        autoFocus
        disabled={saving}
      />
      {error ? <div className="text-[12px] text-accent-error">{error}</div> : null}
      <EditActions saving={saving} onSave={save} onCancel={onCancel} />
    </div>
  )
}
