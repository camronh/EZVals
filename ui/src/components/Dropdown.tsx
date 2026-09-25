import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDismiss } from '../hooks/useDismiss'

export const button = 'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-theme-btn-border bg-theme-btn-bg px-2.5 text-[13px] font-medium text-theme-text-secondary transition-colors hover:bg-theme-btn-bg-hover hover:text-theme-text disabled:cursor-not-allowed disabled:opacity-50'
export const iconButton = `${button} w-8 justify-center !px-0`
export const primaryButton = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-blue-500'

/** A row of mutually exclusive options; the active one is raised. */
export function Segmented<T extends string>({ id, options, value, onChange, size = 'md' }: {
  id?: string
  options: { value: T; label: ReactNode; id?: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div id={id} role="radiogroup" className={`inline-flex shrink-0 rounded-md bg-theme-bg-elevated p-0.5 ${size === 'sm' ? 'text-[11px]' : 'text-[13px]'}`}>
      {options.map((o) => (
        <button
          key={o.value}
          id={o.id}
          role="radio"
          aria-checked={o.value === value}
          className={`inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors ${size === 'sm' ? 'h-5 px-2' : 'h-7 px-2.5'} ${o.value === value ? 'bg-theme-bg text-theme-text shadow-sm' : 'text-theme-text-muted hover:text-theme-text-secondary'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A button that toggles a panel below it; clicking outside closes the panel. */
export function Dropdown({ button, children, panelClass, align = 'right', defaultOpen = false }: {
  button: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  panelClass: string
  align?: 'left' | 'right'
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
        <div className={`absolute ${align}-0 mt-1.5 rounded-lg border border-theme-border bg-theme-bg text-[13px] shadow-[var(--shadow)] ${panelClass}`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  )
}
