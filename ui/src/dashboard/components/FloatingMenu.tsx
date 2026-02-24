import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingMenuProps = {
  anchorRef: RefObject<HTMLElement>
  open: boolean
  onClose?: () => void
  children: ReactNode
}

export default function FloatingMenu({ anchorRef, open, onClose, children }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (!open || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const newStyle: CSSProperties = {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 100,
    }
    // Defer overflow check to after the menu renders
    requestAnimationFrame(() => {
      const menu = menuRef.current
      if (!menu) return
      const menuRect = menu.getBoundingClientRect()
      // Flip above anchor if overflowing bottom
      if (menuRect.bottom > window.innerHeight - 8) {
        setStyle((prev) => prev ? { ...prev, top: rect.top - menuRect.height - 4 } : prev)
      }
      // Shift left if overflowing right
      if (menuRect.right > window.innerWidth - 8) {
        setStyle((prev) => prev ? { ...prev, left: Math.max(8, window.innerWidth - menuRect.width - 8) } : prev)
      }
    })
    setStyle(newStyle)
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
    <div ref={menuRef} className="compare-dropdown" style={style}>
      {children}
    </div>,
    document.body,
  )
}
