import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDismiss } from '../hooks/useDismiss'

export const toolbarButton = 'relative flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text'

/** A toolbar button that toggles a panel below it; clicking outside closes the panel. */
export function Dropdown({ button, children, panelClass, defaultOpen = false }: {
  button: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  panelClass: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, [ref], close)
  return (
    <div ref={ref} className="dropdown relative">
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div className={`absolute right-0 mt-1 rounded border border-theme-border bg-theme-bg-secondary text-xs shadow-xl ${panelClass}`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  )
}
