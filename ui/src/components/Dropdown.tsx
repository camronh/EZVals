import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { useDismiss } from '../hooks/useDismiss'

/** A row of mutually exclusive options (a radio group): the active one is raised; arrow keys move the choice. */
export function Segmented<T extends string>({ id, options, value, onChange, size = 'md', label }: {
  id?: string
  options: { value: T; label: ReactNode; id?: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  label?: string
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const next = options[(options.findIndex((o) => o.value === value) + step + options.length) % options.length]
    onChange(next.value)
    ;(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
  }
  return (
    <div id={id} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={`inline-flex shrink-0 rounded-md bg-surface-muted p-0.5 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            id={o.id}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors ${size === 'sm' ? 'h-6 px-2' : 'h-7 px-2.5'} ${checked ? 'bg-surface-raised text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Keyboard support for an open menu: the first item takes focus, arrow keys and Home/End move between items,
 * and Tab closes the menu (focus moves on naturally).
 */
export function useMenuKeys(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = panel.current
    if (!open || !el) return
    const items = () => [...el.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
    items()[0]?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const target = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key]
      if (target != null && list.length) {
        e.preventDefault()
        list[(target + list.length) % list.length].focus()
      } else if (e.key === 'Tab') onClose()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [open, panel, onClose])
}

type TriggerProps = { 'aria-expanded': boolean; 'aria-haspopup': 'menu' | 'dialog'; 'aria-controls': string }

/**
 * A button that opens a panel below it: a `menu` of actions (arrow keys move between them) or a `dialog`
 * of controls (Tab moves through them). Escape or a click outside closes it and returns focus to the button.
 */
export function Dropdown({ button, children, panelClass, kind = 'menu', label, align = 'right', defaultOpen = false }: {
  button: (props: { open: boolean; toggle: () => void; trigger: TriggerProps }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  panelClass: string
  kind?: 'menu' | 'dialog'
  label: string
  align?: 'left' | 'right'
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const panelId = useId()
  const close = useCallback(() => {
    setOpen(false)
    document.querySelector<HTMLElement>(`[aria-controls="${panelId}"]`)?.focus()
  }, [panelId])
  useDismiss(open, [ref], useCallback((e: Event) => (e.type === 'keydown' ? close() : setOpen(false)), [close]))
  useMenuKeys(open && kind === 'menu', panel, () => setOpen(false))
  useEffect(() => {
    if (open && kind === 'dialog') (panel.current?.querySelector<HTMLElement>('input, select, textarea') ?? panel.current?.querySelector<HTMLElement>('button'))?.focus()
  }, [open, kind])
  return (
    <div ref={ref} className="dropdown relative">
      {button({ open, toggle: () => setOpen((o) => !o), trigger: { 'aria-expanded': open, 'aria-haspopup': kind, 'aria-controls': panelId } })}
      {open ? (
        <div ref={panel} id={panelId} role={kind} aria-label={label} className={`popover absolute ${align}-0 z-50 mt-1.5 ${panelClass}`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  )
}
