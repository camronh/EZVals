import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A modal dialog on the native <dialog>: focus moves to the dialog and stays in it (Tab reaches its controls),
 * Escape or a click on the backdrop closes it, and focus goes back to where it was.
 */
export function Dialog({ id, title, onClose, actions, children, className = 'w-[440px]' }: {
  id?: string
  title: string
  onClose: () => void
  /** Extra header buttons, left of Close. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => {
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      autoFocus
      tabIndex={-1}
      className={`dialog ${className}`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      onCancel={(e) => e.preventDefault()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 pl-5 pr-3">
        <h2 id={titleId} className="text-base font-semibold text-fg">{title}</h2>
        <div className="flex items-center gap-1">
          {actions}
          <button type="button" id={id ? `${id}-close` : undefined} className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      {children}
    </dialog>
  )
}
