import type { CSSProperties, HTMLAttributes, ReactNode, RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingMenuProps = HTMLAttributes<HTMLDivElement> & {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose?: () => void
  children: ReactNode
}

/** A menu portaled to <body>, positioned under its anchor and kept on screen. */
export function FloatingMenu({ anchorRef, open, onClose, children, className = 'menu-popover', ...props }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current!.getBoundingClientRect()
    const menu = menuRef.current!.getBoundingClientRect()
    const below = anchor.bottom + 4
    setStyle({
      position: 'fixed',
      top: below + menu.height > window.innerHeight - 8 ? Math.max(8, anchor.top - menu.height - 4) : below,
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - menu.width - 8)),
      zIndex: 100,
    })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target as Node)) return
      if (anchorRef?.current?.contains(event.target as Node)) return
      onClose?.()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open, anchorRef, onClose])

  if (!open) return null

  return createPortal(
    <div ref={menuRef} className={className} style={style ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }} {...props}>
      {children}
    </div>,
    document.body,
  )
}
