import { useState } from 'react'
import { Spinner } from './Spinner'

/** Save/Cancel buttons for inline edit forms; Save shows a spinner while `saving`. */
export function EditActions({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="btn btn-sm"
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="button"
        data-annotation-save="true"
        className="btn btn-primary btn-sm"
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
      setError(`Couldn't save: ${(err as Error).message}`)
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2">
      <textarea
        data-annotation-editor="true"
        className="input w-full"
        aria-label="Annotation"
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="What did you notice?"
        autoFocus
        disabled={saving}
      />
      {error ? <div className="text-xs text-danger">{error}</div> : null}
      <EditActions saving={saving} onSave={save} onCancel={onCancel} />
    </div>
  )
}
